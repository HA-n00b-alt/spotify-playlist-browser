"""
BPM Finder API - Google Cloud Run microservice
Batch processing: Computes BPM and key from multiple audio preview URLs.
"""
import os
import tempfile
import asyncio
import io
import time
import uuid
import json
import logging
from contextvars import ContextVar
from typing import Optional, Tuple, List
from urllib.parse import urlparse
from concurrent.futures import ThreadPoolExecutor
import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, HttpUrl, field_validator
from google.cloud import pubsub_v1, firestore

# Import shared processing functions
import shared_processing
from shared_processing import (
    download_audio_async as shared_download_audio_async,
    analyze_audio,
    get_auth_headers as shared_get_auth_headers,
    generate_debug_output,
    FallbackCircuitBreaker,
    FALLBACK_SERVICE_URL,
    FALLBACK_SERVICE_AUDIENCE,
    FALLBACK_REQUEST_TIMEOUT_COLD_START,
    FALLBACK_REQUEST_TIMEOUT_WARM,
    FALLBACK_MAX_RETRIES,
    FALLBACK_RETRY_DELAY,
)

# Google Cloud authentication is handled by shared_processing.get_auth_headers

app = FastAPI(title="BPM Finder API")
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"), format="%(message)s")
logger = logging.getLogger(__name__)
request_id_var: ContextVar[Optional[str]] = ContextVar("request_id", default=None)

def log_event(level: int, message: str, **fields) -> None:
    record = {"message": message, **fields}
    request_id = request_id_var.get()
    if request_id:
        record["request_id"] = request_id
    logger.log(level, json.dumps(record, ensure_ascii=True))

# Google Cloud configuration
PROJECT_ID = os.getenv("GOOGLE_CLOUD_PROJECT") or os.getenv("GCP_PROJECT") or os.getenv("PROJECT_ID", "delman-site")
PUBSUB_TOPIC = f"projects/{PROJECT_ID}/topics/bpm-analysis-tasks"

# Initialize Pub/Sub and Firestore clients
publisher = pubsub_v1.PublisherClient()
db = firestore.Client()

# Global circuit breaker instance (using shared implementation)
fallback_circuit_breaker = FallbackCircuitBreaker()

# Global HTTPX client with connection pooling for reuse across requests
_http_client: Optional[httpx.AsyncClient] = None

# ThreadPoolExecutor for CPU-bound Essentia analysis (prevents event loop blocking)
_essentia_executor: Optional[ThreadPoolExecutor] = None
_essentia_semaphore: Optional[asyncio.Semaphore] = None

def get_essentia_executor() -> ThreadPoolExecutor:
    """Get or create the global ThreadPoolExecutor for Essentia analysis."""
    global _essentia_executor
    if _essentia_executor is None:
        # Use env var or default to CPU count
        max_workers = int(os.getenv("ESSENTIA_MAX_CONCURRENCY", max(1, os.cpu_count() or 1)))
        _essentia_executor = ThreadPoolExecutor(max_workers=max_workers, thread_name_prefix="essentia")
        log_event(
            logging.INFO,
            "Essentia executor configured",
            event="executor_config",
            max_workers=max_workers,
            cpu_count=os.cpu_count(),
        )
    return _essentia_executor

def get_essentia_semaphore() -> asyncio.Semaphore:
    """Get or create the global semaphore for Essentia analysis concurrency control."""
    global _essentia_semaphore
    if _essentia_semaphore is None:
        # Use same limit as executor
        max_concurrent = int(os.getenv("ESSENTIA_MAX_CONCURRENCY", max(1, os.cpu_count() or 1)))
        _essentia_semaphore = asyncio.Semaphore(max_concurrent)
    return _essentia_semaphore

# Per-request URL concurrency limit for batch processing
BATCH_URL_CONCURRENCY = int(os.getenv("BATCH_URL_CONCURRENCY", "20"))

def get_http_client() -> httpx.AsyncClient:
    """Get or create the global HTTPX AsyncClient with connection pooling."""
    global _http_client
    if _http_client is None:
        # Create client with connection pooling enabled
        # limits: max_keepalive_connections=20, max_connections=100
        _http_client = httpx.AsyncClient(
            limits=httpx.Limits(
                max_keepalive_connections=20,  # Keep 20 connections alive for reuse
                max_connections=100,           # Maximum 100 total connections
            ),
            timeout=httpx.Timeout(
                connect=10.0,  # Default connect timeout
                read=30.0,     # Default read timeout (can be overridden per request)
                write=30.0,    # Default write timeout
                pool=10.0      # Pool timeout
            ),
            follow_redirects=False,  # We handle redirects manually for security
        )
        log_event(
            logging.INFO,
            "HTTP client initialized",
            event="startup_http_client",
            max_keepalive_connections=20,
            max_connections=100,
        )
    return _http_client

def format_url_for_log(url: str, max_len: int = 80) -> str:
    """Format URL for logs: show scheme/host/path and elide long strings."""
    parsed = urlparse(url)
    base = f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
    if len(base) > max_len:
        return base[: max_len - 3] + "..."
    if parsed.query:
        suffix = "?..."
        if len(base) + len(suffix) > max_len:
            return base[: max_len - 3] + "..."
        return base + suffix
    return base

@app.on_event("startup")
async def startup_event():
    """Initialize HTTP client and check fallback service health at startup."""
    log_event(logging.INFO, "Startup config", event="startup_config", project_id=PROJECT_ID, pubsub_topic=PUBSUB_TOPIC)
    # Pre-initialize the HTTP client with connection pooling
    get_http_client()
    
    # Check fallback service health
    try:
        # Try to get auth headers (this will fail if auth is misconfigured)
        try:
            auth_headers = await shared_get_auth_headers(FALLBACK_SERVICE_AUDIENCE)
        except Exception as e:
            log_event(
                logging.ERROR,
                "Fallback service auth check failed at startup",
                event="startup_fallback_auth_failed",
                error=str(e),
            )
            log_event(
                logging.WARNING,
                "Fallback service calls will be skipped until auth is configured",
                event="startup_fallback_disabled",
            )
            return
        
        # Try to reach the fallback service health endpoint using global client
        client = get_http_client()
        timeout = httpx.Timeout(connect=5.0, read=10.0)
        try:
            response = await client.get(
                f"{FALLBACK_SERVICE_URL}/health",
                headers=auth_headers,
                timeout=timeout
            )
            if response.status_code == 200:
                log_event(logging.INFO, "Fallback service is reachable", event="startup_fallback_health_ok")
                fallback_circuit_breaker.record_success()
            else:
                log_event(
                    logging.WARNING,
                    "Fallback service returned non-200 at startup",
                    event="startup_fallback_health_non_200",
                    status_code=response.status_code,
                )
                fallback_circuit_breaker.record_failure()
        except httpx.TimeoutException:
            log_event(
                logging.WARNING,
                "Fallback service health check timed out at startup",
                event="startup_fallback_health_timeout",
            )
            fallback_circuit_breaker.record_failure()
        except Exception as e:
            log_event(
                logging.ERROR,
                "Fallback service health check failed at startup",
                event="startup_fallback_health_error",
                error=str(e),
            )
            fallback_circuit_breaker.record_failure()
    except Exception as e:
        log_event(
            logging.ERROR,
            "Startup fallback service check failed",
            event="startup_fallback_check_error",
            error=str(e),
        )


@app.middleware("http")
async def attach_request_id(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
    token = request_id_var.set(request_id)
    shared_token = None
    try:
        shared_token = shared_processing.request_id_var.set(request_id)
    except Exception:
        shared_token = None
    try:
        response = await call_next(request)
    finally:
        request_id_var.reset(token)
        if shared_token is not None:
            shared_processing.request_id_var.reset(shared_token)
    response.headers["x-request-id"] = request_id
    return response

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup HTTP client and executor on shutdown."""
    global _http_client, _essentia_executor
    if _http_client is not None:
        await _http_client.aclose()
        _http_client = None
    if _essentia_executor is not None:
        _essentia_executor.shutdown(wait=True)
        _essentia_executor = None


class BatchBPMRequest(BaseModel):
    urls: List[HttpUrl]
    max_confidence: Optional[float] = 0.65
    debug_level: Optional[str] = "normal"  # "minimal", "normal", "detailed"
    fallback_override: Optional[str] = None  # "never": no fallback; "always": force both BPM/key fallback; "bpm_only": force BPM fallback; "key_only": force key fallback; "fallback_only*": skip Essentia for selected fields

    @field_validator("urls")
    @classmethod
    def validate_urls(cls, v):
        """Validate URL schemes and non-empty list."""
        if not v:
            raise ValueError("urls list cannot be empty")
        for url in v:
            url_str = str(url)
            if not url_str.startswith("https://"):
                raise ValueError("Only HTTPS URLs are allowed")
        return v
    
    @field_validator("max_confidence")
    @classmethod
    def validate_max_confidence(cls, v):
        """Validate max_confidence is in valid range."""
        if v is not None and (v < 0.0 or v > 1.0):
            raise ValueError("max_confidence must be between 0.0 and 1.0")
        return v
    
    @field_validator("debug_level")
    @classmethod
    def validate_debug_level(cls, v):
        """Validate debug_level is a valid option."""
        if v not in ["minimal", "normal", "detailed"]:
            raise ValueError("debug_level must be one of: minimal, normal, detailed")
        return v
    
    @field_validator("fallback_override")
    @classmethod
    def validate_fallback_override(cls, v):
        """Validate fallback_override is a valid option."""
        if v and v not in [
            "never",
            "always",
            "bpm_only",
            "key_only",
            "fallback_only",
            "fallback_only_bpm",
            "fallback_only_key",
        ]:
            raise ValueError(
                "fallback_override must be one of: never, always, bpm_only, key_only, "
                "fallback_only, fallback_only_bpm, fallback_only_key"
            )
        return v


class BPMResponse(BaseModel):
    # Essentia BPM results
    bpm_essentia: Optional[int] = None
    bpm_raw_essentia: Optional[float] = None
    bpm_confidence_essentia: Optional[float] = None
    
    # Librosa BPM results (null if not used)
    bpm_librosa: Optional[int] = None
    bpm_raw_librosa: Optional[float] = None
    bpm_confidence_librosa: Optional[float] = None
    
    # Essentia key results
    key_essentia: Optional[str] = None
    scale_essentia: Optional[str] = None
    keyscale_confidence_essentia: Optional[float] = None
    
    # Librosa key results (null if not used)
    key_librosa: Optional[str] = None
    scale_librosa: Optional[str] = None
    keyscale_confidence_librosa: Optional[float] = None
    
    # Debug information
    debug_txt: Optional[str] = None


class BatchSubmissionResponse(BaseModel):
    batch_id: str
    total_urls: int
    status: str
    stream_url: str


class BatchStatusResponse(BaseModel):
    batch_id: str
    status: str
    total_urls: int
    processed: int
    results: dict


# Wrapper for download_audio_async that converts Exception to HTTPException for FastAPI
async def download_audio_async(url: str, output_path: str) -> None:
    """Download audio file with SSRF protection and size limits using async streaming.
    
    Wraps shared_processing.download_audio_async to convert Exception to HTTPException.
    """
    client = get_http_client()
    try:
        await shared_download_audio_async(url, output_path, client)
    except Exception as e:
        # Convert generic Exception to HTTPException for FastAPI
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )


async def process_single_url(
    url: HttpUrl,
    max_confidence: float,
    index: int
) -> Tuple[int, dict]:
    """Process a single URL: download, analyze, return result.
    
    Returns:
        Tuple of (index, dict) with processing results and fallback flags
    """
    url_str = str(url)
    parsed = urlparse(url_str)
    input_ext = os.path.splitext(parsed.path)[1] or ".tmp"
    input_path = None
    debug_info_parts = []
    
    # Timing telemetry
    timing = {
        "download_start": None,
        "download_end": None,
        "download_duration": None,
        "essentia_start": None,
        "essentia_end": None,
        "essentia_duration": None,
    }
    
    try:
        # Create temp file
        input_fd, input_path = tempfile.mkstemp(suffix=input_ext, dir="/tmp")
        os.close(input_fd)  # Close file descriptor, we'll write via path
        
        # Download audio (async streaming) with timing
        try:
            timing["download_start"] = time.time()
            client = get_http_client()
            await shared_download_audio_async(url_str, input_path, client)
            timing["download_end"] = time.time()
            timing["download_duration"] = timing["download_end"] - timing["download_start"]
            debug_info_parts.append(f"URL fetch: SUCCESS ({format_url_for_log(url_str)})")
        except Exception as e:
            # Clean up temp file on download failure
            if input_path:
                try:
                    loop = asyncio.get_event_loop()
                    file_exists = await loop.run_in_executor(None, os.path.exists, input_path)
                    if file_exists:
                        await loop.run_in_executor(None, os.unlink, input_path)
                except Exception:
                    pass  # Ignore cleanup errors
                input_path = None
            
            error_msg = f"URL fetch error: {str(e)}"
            debug_info_parts.append(error_msg)
            # Note: We don't raise HTTPException here because this is used in batch processing
            # The error will be returned in the result dict
            return index, {
                "index": index,
                "url": url_str,
                "file_path": None,
                "bpm_essentia": None,
                "bpm_raw_essentia": None,
                "bpm_confidence_essentia": None,
                "bpm_librosa": None,
                "bpm_raw_librosa": None,
                "bpm_confidence_librosa": None,
                "key_essentia": "unknown",
                "scale_essentia": "unknown",
                "keyscale_confidence_essentia": 0.0,
                "key_librosa": None,
                "scale_librosa": None,
                "keyscale_confidence_librosa": None,
                "need_fallback_bpm": True,
                "need_fallback_key": True,
                "debug_info_parts": debug_info_parts,
                "timing": timing,
            }
        
        # Analyze audio (BPM + key from same loaded array) with timing
        # Offload CPU-bound Essentia analysis to thread pool to prevent event loop blocking
        timing["essentia_start"] = time.time()
        essentia_executor = get_essentia_executor()
        essentia_sem = get_essentia_semaphore()
        loop = asyncio.get_event_loop()
        
        async with essentia_sem:
            (
                bpm_normalized, bpm_raw, bpm_confidence_normalized, bpm_quality, bpm_method,
                key, scale, key_strength_raw, key_confidence_normalized,
                need_fallback_bpm, need_fallback_key,
                analysis_debug
            ) = await loop.run_in_executor(
                essentia_executor,
                analyze_audio,
                input_path,
                max_confidence
            )
        timing["essentia_end"] = time.time()
        timing["essentia_duration"] = timing["essentia_end"] - timing["essentia_start"]
        
        debug_info_parts.append(f"Max confidence threshold: {max_confidence:.2f}")
        debug_info_parts.append("=== Analysis (Essentia) ===")
        debug_info_parts.append(analysis_debug)
        
        # Store for potential fallback batch call
        # Return result with fallback flags and separate Essentia/Librosa fields
        return index, {
            "index": index,
            "url": url_str,
            "file_path": input_path,  # Keep file for batch fallback if needed
            # Essentia results
            "bpm_essentia": int(round(bpm_normalized)) if bpm_normalized is not None else None,
            "bpm_raw_essentia": round(bpm_raw, 2) if bpm_raw is not None else None,
            "bpm_confidence_essentia": round(bpm_confidence_normalized, 2) if bpm_confidence_normalized is not None else None,
            "key_essentia": key if key else "unknown",
            "scale_essentia": scale if scale else "unknown",
            "keyscale_confidence_essentia": round(key_confidence_normalized, 2) if key_confidence_normalized is not None else 0.0,
            # Librosa results (will be populated by fallback if needed)
            "bpm_librosa": None,
            "bpm_raw_librosa": None,
            "bpm_confidence_librosa": None,
            "key_librosa": None,
            "scale_librosa": None,
            "keyscale_confidence_librosa": None,
            # Fallback flags
            "need_fallback_bpm": need_fallback_bpm,
            "need_fallback_key": need_fallback_key,
            "debug_info_parts": debug_info_parts,
            "timing": timing,
        }
    
    except Exception as e:
        error_msg = f"Processing error: {str(e)}"
        debug_info_parts.append(error_msg)
        return index, {
            "index": index,
            "url": url_str,
            "file_path": None,
            "bpm_essentia": None,
            "bpm_raw_essentia": None,
            "bpm_confidence_essentia": None,
            "bpm_librosa": None,
            "bpm_raw_librosa": None,
            "bpm_confidence_librosa": None,
            "key_essentia": "unknown",
            "scale_essentia": "unknown",
            "keyscale_confidence_essentia": 0.0,
            "key_librosa": None,
            "scale_librosa": None,
            "keyscale_confidence_librosa": None,
            "need_fallback_bpm": True,
            "need_fallback_key": True,
            "debug_info_parts": debug_info_parts,
            "timing": timing,
        }
    
    finally:
        # Note: Don't delete input_path here - we may need it for fallback batch
        # Cleanup will happen after fallback processing
        pass


# Use shared get_auth_headers implementation
get_auth_headers = shared_get_auth_headers




@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"ok": True}


# Use shared generate_debug_output implementation
# (generate_debug_output is already imported from shared_processing)


@app.post("/analyze/batch", response_model=BatchSubmissionResponse)
async def analyze_batch(request: BatchBPMRequest):
    """Submit batch for processing: publish tasks to Pub/Sub and return batch_id immediately.
    
    Processing happens asynchronously via worker service. Use /stream/{batch_id} to receive results.
    """
    max_confidence = request.max_confidence if request.max_confidence is not None else 0.65
    debug_level = request.debug_level if request.debug_level else "normal"
    fallback_override = request.fallback_override
    
    # Generate batch_id
    batch_id = str(uuid.uuid4())
    total_urls = len(request.urls)
    
    # Create batch document in Firestore
    batch_ref = db.collection('batches').document(batch_id)
    batch_ref.set({
        'batch_id': batch_id,
        'total_urls': total_urls,
        'processed': 0,
        'status': 'processing',
        'created_at': firestore.SERVER_TIMESTAMP,
        'results': {}
    })
    log_event(
        logging.INFO,
        "Batch created",
        event="batch_created",
        batch_id=batch_id,
        total_urls=total_urls,
    )
    
    # Publish each URL as a separate message to Pub/Sub
    for index, url in enumerate(request.urls):
        trace_id = str(uuid.uuid4())
        message_data = {
            'batch_id': batch_id,
            'url': str(url),
            'index': index,
            'max_confidence': max_confidence,
            'debug_level': debug_level,
            'fallback_override': fallback_override,
            'trace_id': trace_id,
        }
        message_bytes = json.dumps(message_data).encode('utf-8')
        
        try:
            future = publisher.publish(PUBSUB_TOPIC, message_bytes)
            future.result()  # Wait for publish to complete
        except Exception as e:
            # Log error but continue with other URLs
            log_event(
                logging.ERROR,
                "Failed to publish message to Pub/Sub",
                event="pubsub_publish_error",
                index=index,
                batch_id=batch_id,
                trace_id=trace_id,
                error=str(e),
            )
            # Update Firestore with error
            batch_ref.update({
                f'results.{index}': {
                    'index': index,
                    'url': str(url),
                    'trace_id': trace_id,
                    'error': f'Failed to publish to Pub/Sub: {str(e)}'
                }
            })
    
    return BatchSubmissionResponse(
        batch_id=batch_id,
        total_urls=total_urls,
        status='processing',
        stream_url=f'/stream/{batch_id}'
    )


@app.get("/stream/{batch_id}")
async def stream_batch_results(batch_id: str):
    """Stream batch results as NDJSON (Newline Delimited JSON).
    
    Polls Firestore every 500ms and yields results as they become available.
    """
    log_event(logging.INFO, "Starting stream", event="stream_start", batch_id=batch_id)
    batch_ref = db.collection('batches').document(batch_id)
    sent_status = {}
    
    async def generate_stream():
        loop = asyncio.get_event_loop()
        start_time = time.time()
        last_keepalive = start_time
        max_stream_time = 600  # 10 minutes max stream time
        last_processed = -1
        last_progress = -1
        
        while True:
            try:
                current_time = time.time()
                elapsed = current_time - start_time
                
                # Check max stream time
                if elapsed > max_stream_time:
                    yield json.dumps({
                        "type": "error",
                        "message": f"Stream timeout after {max_stream_time}s"
                    }) + "\n"
                    break
                
                # Send keepalive every 30 seconds to prevent connection timeout
                if current_time - last_keepalive >= 30:
                    yield json.dumps({
                        "type": "keepalive",
                        "elapsed": int(elapsed)
                    }) + "\n"
                    last_keepalive = current_time
                
                # Get batch document from Firestore (run in executor to avoid blocking)
                batch_doc = await loop.run_in_executor(None, batch_ref.get)
                
                if not batch_doc.exists:
                    # Batch not found
                    yield json.dumps({
                        "type": "error",
                        "message": f"Batch {batch_id} not found"
                    }) + "\n"
                    break
                
                batch_data = batch_doc.to_dict()
                status = batch_data.get('status', 'processing')
                total_urls = batch_data.get('total_urls', 0)
                processed = batch_data.get('processed', 0)
                results = batch_data.get('results', {})
                
                # Send status update (only if status changed or every 10 seconds)
                should_send_status = (
                    len(sent_status) == 0 or  # First status
                    processed != last_processed or  # Processed count changed
                    int(elapsed) % 10 == 0  # Every 10 seconds
                )
                
                if should_send_status:
                    yield json.dumps({
                        "type": "status",
                        "status": status,
                        "total": total_urls,
                        "processed": processed,
                        "elapsed": int(elapsed)
                    }) + "\n"
                    last_processed = processed
                
                # Send new results
                for index_str, result in results.items():
                    index = int(index_str)
                    result_status = result.get("status", "final")
                    if sent_status.get(index) != result_status:
                        sent_status[index] = result_status
                        # Format result for streaming
                        stream_result = {
                            "type": "result",
                            "index": index,
                            "url": result.get("url"),
                            "trace_id": result.get("trace_id"),
                            "status": result_status,
                            "bpm_essentia": result.get("bpm_essentia"),
                            "bpm_raw_essentia": result.get("bpm_raw_essentia"),
                            "bpm_confidence_essentia": result.get("bpm_confidence_essentia"),
                            "bpm_librosa": result.get("bpm_librosa"),
                            "bpm_raw_librosa": result.get("bpm_raw_librosa"),
                            "bpm_confidence_librosa": result.get("bpm_confidence_librosa"),
                            "key_essentia": result.get("key_essentia"),
                            "scale_essentia": result.get("scale_essentia"),
                            "keyscale_confidence_essentia": result.get("keyscale_confidence_essentia"),
                            "key_librosa": result.get("key_librosa"),
                            "scale_librosa": result.get("scale_librosa"),
                            "keyscale_confidence_librosa": result.get("keyscale_confidence_librosa"),
                            "debug_txt": result.get("debug_txt"),
                            "error": result.get("error")
                        }
                        yield json.dumps(stream_result) + "\n"
                
                # Send progress update only when processed count changes
                if processed > 0 and processed != last_progress:
                    yield json.dumps({
                        "type": "progress",
                        "processed": processed,
                        "total": total_urls
                    }) + "\n"
                    last_progress = processed
                
                # Check if complete
                if status == "completed":
                    yield json.dumps({
                        "type": "complete",
                        "batch_id": batch_id,
                        "total": total_urls,
                        "elapsed": int(elapsed)
                    }) + "\n"
                    break
                
                # Wait before next poll (reduced for lower latency)
                await asyncio.sleep(0.25)
                
            except Exception as e:
                import traceback
                error_msg = f"Error streaming batch: {str(e)}\n{traceback.format_exc()}"
                log_event(logging.ERROR, "Stream error", event="stream_error", batch_id=batch_id, error=error_msg)
                yield json.dumps({
                    "type": "error",
                    "message": error_msg[:500]  # Limit error message length
                }) + "\n"
                break
    
    return StreamingResponse(
        generate_stream(),
        media_type="application/x-ndjson"
    )


@app.get("/batch/{batch_id}", response_model=BatchStatusResponse)
async def get_batch_status(batch_id: str):
    """Get batch status and results from Firestore."""
    log_event(logging.INFO, "Batch status requested", event="batch_status_query", batch_id=batch_id)
    batch_ref = db.collection('batches').document(batch_id)
    loop = asyncio.get_event_loop()
    batch_doc = await loop.run_in_executor(None, batch_ref.get)
    
    if not batch_doc.exists:
        raise HTTPException(status_code=404, detail=f"Batch {batch_id} not found")
    
    batch_data = batch_doc.to_dict()
    
    return BatchStatusResponse(
        batch_id=batch_id,
        status=batch_data.get('status', 'processing'),
        total_urls=batch_data.get('total_urls', 0),
        processed=batch_data.get('processed', 0),
        results=batch_data.get('results', {})
    )
