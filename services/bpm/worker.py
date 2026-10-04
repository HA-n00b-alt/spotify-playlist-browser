"""
BPM Worker Service - Processes Pub/Sub messages and writes results to Firestore
"""
import os
import json
import base64
import io
import asyncio
import tempfile
import httpx
import time
import resource
import logging
from typing import Optional
from urllib.parse import urlparse
from fastapi import FastAPI, Request, HTTPException
from google.cloud import firestore
from google.cloud.firestore import Increment
from concurrent.futures import ThreadPoolExecutor
from contextvars import ContextVar
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
    RetryError
)

# Import shared processing functions
import shared_processing
from shared_processing import (
    download_audio_async,
    analyze_audio,
    analyze_key_from_audio,
    get_auth_headers,
    generate_debug_output,
    FallbackCircuitBreaker,
    FALLBACK_SERVICE_URL,
    FALLBACK_SERVICE_AUDIENCE,
    FALLBACK_REQUEST_TIMEOUT_COLD_START,
    FALLBACK_REQUEST_TIMEOUT_WARM,
    FALLBACK_MAX_RETRIES,
    FALLBACK_RETRY_DELAY,
)

# Numpy is used for PCM serialization when calling the fallback service
import numpy as np

app = FastAPI(title="BPM Worker Service")
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"), format="%(message)s")
logger = logging.getLogger(__name__)
request_id_var: ContextVar[Optional[str]] = ContextVar("request_id", default=None)
db = firestore.Client()
PROCESS_START = time.time()
_first_request = True
STREAM_PARTIAL_BPM_ONLY = os.getenv("STREAM_PARTIAL_BPM_ONLY", "true").lower() == "true"
SKIP_PARTIAL_WRITES = os.getenv("SKIP_PARTIAL_WRITES", "false").lower() == "true"

# Global HTTP client with connection pooling
_http_client: Optional[httpx.AsyncClient] = None

# Global circuit breaker
fallback_circuit_breaker = FallbackCircuitBreaker()

# ThreadPoolExecutor for CPU-bound Essentia analysis
_essentia_executor: Optional[ThreadPoolExecutor] = None


def get_http_client() -> httpx.AsyncClient:
    """Get or create the global HTTPX AsyncClient."""
    global _http_client
    if _http_client is None:
        _http_client = httpx.AsyncClient(
            limits=httpx.Limits(
                max_keepalive_connections=20,
                max_connections=100,
            ),
            timeout=httpx.Timeout(
                connect=10.0,
                read=30.0,
                write=30.0,
                pool=10.0
            ),
            follow_redirects=False,
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


def get_essentia_executor() -> ThreadPoolExecutor:
    """Get or create the ThreadPoolExecutor for Essentia."""
    global _essentia_executor
    if _essentia_executor is None:
        max_workers = int(os.getenv("ESSENTIA_MAX_CONCURRENCY", max(1, os.cpu_count() or 1)))
        _essentia_executor = ThreadPoolExecutor(max_workers=max_workers, thread_name_prefix="essentia")
    return _essentia_executor


def log_event(level: int, message: str, **fields) -> None:
    record = {"message": message, **fields}
    request_id = request_id_var.get()
    if request_id:
        record["request_id"] = request_id
    logger.log(level, json.dumps(record, ensure_ascii=True))

def log_telemetry(message: str) -> None:
    log_event(logging.INFO, message, event="telemetry")

def log_task(level: int, batch_id: str, index: int, message: str, **fields) -> None:
    log_event(level, message, batch_id=batch_id, index=index, **fields)


def get_rss_kb() -> Optional[int]:
    try:
        return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    except Exception:
        return None


@app.on_event("startup")
async def startup_event():
    """Pre-import Essentia to avoid hanging on first use."""
    startup_s = time.time() - PROCESS_START
    log_telemetry(f"worker_startup_s={startup_s:.3f}")
    log_event(logging.INFO, "Config loaded", event="startup_config", stream_partial_bpm_only=STREAM_PARTIAL_BPM_ONLY)
    log_event(
        logging.INFO,
        "Config loaded",
        event="startup_config",
        essentia_max_concurrency=os.getenv("ESSENTIA_MAX_CONCURRENCY", "default"),
    )
    log_event(logging.INFO, "Pre-importing Essentia to avoid cold start delay", event="startup_essentia_preimport")
    start = time.time()
    try:
        # Pre-import Essentia in a thread to avoid blocking
        import threading
        def preimport_essentia():
            try:
                import essentia.standard as es
                log_event(
                    logging.INFO,
                    "Essentia pre-imported successfully",
                    event="startup_essentia_preimport_done",
                    duration_s=time.time() - start,
                )
            except Exception as e:
                log_event(
                    logging.WARNING,
                    "Essentia pre-import failed",
                    event="startup_essentia_preimport_failed",
                    error=str(e),
                )
        
        thread = threading.Thread(target=preimport_essentia, daemon=True)
        thread.start()
        thread.join(timeout=60)  # Wait up to 60 seconds
        if thread.is_alive():
            log_event(
                logging.WARNING,
                "Essentia pre-import still running after 60s, continuing",
                event="startup_essentia_preimport_timeout",
            )
    except Exception as e:
        log_event(
            logging.ERROR,
            "Error during Essentia pre-import",
            event="startup_essentia_preimport_error",
            error=str(e),
        )
    log_event(logging.INFO, "Startup complete", event="startup_complete")


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown."""
    global _http_client, _essentia_executor
    if _http_client is not None:
        await _http_client.aclose()
        _http_client = None
    if _essentia_executor is not None:
        _essentia_executor.shutdown(wait=True)
        _essentia_executor = None


async def process_single_url_task(
    batch_id: str,
    url: str,
    index: int,
    max_confidence: float,
    debug_level: str,
    fallback_override: Optional[str],
    trace_id: Optional[str],
):
    """Process a single URL and write result to Firestore.

    Args:
        batch_id (str): The ID of the batch this URL belongs to.
        url (str): The URL of the audio file to process.
        index (int): The index of the URL within the batch.
        max_confidence (float): The confidence threshold for fallback.
        debug_level (str): The verbosity level for debug output.
        fallback_override (Optional[str]): Overrides fallback logic. Possible values:
            "never": Never use the fallback service.
            "always": Always use the fallback service for both BPM and key (but run Essentia first).
            "bpm_only": Force BPM fallback (but run Essentia first).
            "key_only": Force key fallback (but run Essentia first).
            "fallback_only": Skip Essentia entirely, use ONLY fallback for both BPM and key.
            "fallback_only_bpm": Skip Essentia BPM, use ONLY fallback for BPM (but run Essentia for key).
            "fallback_only_key": Skip Essentia key, use ONLY fallback for key (but run Essentia for BPM).
    """
    batch_ref = db.collection('batches').document(batch_id)

    trace_tag = trace_id or "unknown"
    log_task(
        logging.INFO,
        batch_id,
        index,
        "Starting processing",
        event="task_start",
        trace_id=trace_tag,
        url=format_url_for_log(url),
        max_confidence=max_confidence,
        debug_level=debug_level,
        fallback_override=fallback_override,
    )
    
    input_path = None
    debug_info_parts = []
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
        parsed = urlparse(url)
        input_ext = os.path.splitext(parsed.path)[1] or ".tmp"
        input_fd, input_path = tempfile.mkstemp(suffix=input_ext, dir="/tmp")
        os.close(input_fd)
        
        # Download audio
        try:
            log_task(logging.INFO, batch_id, index, "Downloading", event="download_start", trace_id=trace_tag)
            timing["download_start"] = time.time()
            client = get_http_client()
            await download_audio_async(url, input_path, client)
            timing["download_end"] = time.time()
            timing["download_duration"] = timing["download_end"] - timing["download_start"]
            download_bytes = os.path.getsize(input_path) if os.path.exists(input_path) else 0
            log_telemetry(
                f"worker_download_s={timing['download_duration']:.3f} "
                f"bytes={download_bytes} "
                f"batch_id={batch_id} index={index} trace_id={trace_tag}"
            )
            debug_info_parts.append(f"URL fetch: SUCCESS ({format_url_for_log(url)})")
            log_task(
                logging.INFO,
                batch_id,
                index,
                "Download complete",
                event="download_complete",
                trace_id=trace_tag,
                duration_s=timing["download_duration"],
            )
        except Exception as e:
            error_msg = f"URL fetch error: {str(e)}"
            debug_info_parts.append(error_msg)
            log_task(
                logging.ERROR,
                batch_id,
                index,
                "Download failed",
                event="download_failed",
                trace_id=trace_tag,
                error=str(e),
            )
            raise

        # Check if we should skip Essentia entirely (fallback_only modes)
        skip_essentia = fallback_override in ("fallback_only", "fallback_only_bpm", "fallback_only_key")
        skip_essentia_bpm = fallback_override in ("fallback_only", "fallback_only_bpm")
        skip_essentia_key = fallback_override in ("fallback_only", "fallback_only_key")

        # Initialize variables
        bpm_normalized = None
        bpm_raw = None
        bpm_confidence_normalized = None
        bpm_quality = None
        bpm_method = "multifeature"
        key = "unknown"
        scale = "unknown"
        key_strength_raw = 0.0
        key_confidence_normalized = 0.0
        need_fallback_bpm = False
        need_fallback_key = False
        analysis_debug = ""
        audio_pcm = None
        sample_rate = 44100
        loop = asyncio.get_event_loop()
        executor = get_essentia_executor()

        # Analyze audio (or skip if fallback_only)
        if skip_essentia:
            log_task(
                logging.INFO,
                batch_id,
                index,
                "Skipping Essentia",
                event="essentia_skip",
                trace_id=trace_tag,
                fallback_override=fallback_override,
                skip_bpm=skip_essentia_bpm,
                skip_key=skip_essentia_key,
            )
            debug_info_parts.append(f"Max confidence threshold: {max_confidence:.2f}")
            debug_info_parts.append(f"Fallback override: {fallback_override}")
            debug_info_parts.append("=== Essentia Analysis ===")
            debug_info_parts.append("SKIPPED (fallback_only mode)")

            # Force fallback based on mode
            if skip_essentia_bpm:
                need_fallback_bpm = True
                debug_info_parts.append("BPM: Will use fallback only")
            if skip_essentia_key:
                need_fallback_key = True
                debug_info_parts.append("Key: Will use fallback only")
        else:
            try:
                log_task(logging.INFO, batch_id, index, "Analyzing", event="analysis_start", trace_id=trace_tag)
                log_task(
                    logging.DEBUG,
                    batch_id,
                    index,
                    "Input file info",
                    event="analysis_input_info",
                    trace_id=trace_tag,
                    exists=os.path.exists(input_path),
                    size_bytes=os.path.getsize(input_path) if os.path.exists(input_path) else 0,
                )
                timing["essentia_start"] = time.time()

                log_task(
                    logging.DEBUG,
                    batch_id,
                    index,
                    "Submitting to executor",
                    event="executor_submit",
                    trace_id=trace_tag,
                    max_workers=executor._max_workers,
                    active_threads=len(getattr(executor, "_threads", [])) if hasattr(executor, "_threads") else "unknown",
                )

                try:
                    result = await loop.run_in_executor(
                        executor,
                        analyze_audio,
                        input_path,
                        max_confidence,
                        True,
                        not STREAM_PARTIAL_BPM_ONLY
                    )
                    log_task(logging.DEBUG, batch_id, index, "Executor returned", event="executor_return", trace_id=trace_tag)
                    (
                        bpm_normalized, bpm_raw, bpm_confidence_normalized, bpm_quality, bpm_method,
                        key, scale, key_strength_raw, key_confidence_normalized,
                        need_fallback_bpm, need_fallback_key,
                        analysis_debug,
                        audio_pcm,
                        sample_rate
                    ) = result
                    log_task(
                        logging.DEBUG,
                        batch_id,
                        index,
                        "Result unpacked",
                        event="analysis_result_unpack",
                        trace_id=trace_tag,
                        bpm=bpm_normalized,
                        key=key,
                    )
                except Exception as e:
                    import traceback
                    error_details = f"Executor error: {str(e)}\n{traceback.format_exc()}"
                    log_task(
                        logging.ERROR,
                        batch_id,
                        index,
                        "Executor error",
                        event="executor_error",
                        trace_id=trace_tag,
                        error=error_details,
                    )
                    raise

                log_task(logging.DEBUG, batch_id, index, "Executor completed", event="executor_done", trace_id=trace_tag)
                timing["essentia_end"] = time.time()
                timing["essentia_duration"] = timing["essentia_end"] - timing["essentia_start"]
                log_telemetry(
                    f"worker_essentia_s={timing['essentia_duration']:.3f} "
                    f"batch_id={batch_id} index={index} trace_id={trace_tag}"
                )

                debug_info_parts.append(f"Max confidence threshold: {max_confidence:.2f}")
                debug_info_parts.append("=== Analysis (Essentia) ===")
                debug_info_parts.append(analysis_debug)

                # Apply fallback override logic (for non-fallback_only modes)
                if fallback_override:
                    debug_info_parts.append(f"Applying fallback override: {fallback_override}")
                    if fallback_override == "never":
                        need_fallback_bpm = False
                        need_fallback_key = False
                    elif fallback_override == "always":
                        need_fallback_bpm = True
                        need_fallback_key = True
                    elif fallback_override == "bpm_only":
                        need_fallback_bpm = True
                    elif fallback_override == "key_only":
                        need_fallback_key = True

                log_task(
                    logging.INFO,
                    batch_id,
                    index,
                    "Analysis complete",
                    event="analysis_complete",
                    trace_id=trace_tag,
                    duration_s=timing["essentia_duration"],
                    bpm=bpm_normalized,
                    key=key,
                    scale=scale,
                    need_fallback_bpm=need_fallback_bpm,
                    need_fallback_key=need_fallback_key,
                )

            except Exception as e:
                error_msg = f"Analysis error: {str(e)}"
                import traceback
                full_error = f"{error_msg}\n{traceback.format_exc()}"
                log_task(
                    logging.ERROR,
                    batch_id,
                    index,
                    "Analysis failed",
                    event="analysis_failed",
                    trace_id=trace_tag,
                    error=full_error,
                )
                debug_info_parts.append(error_msg)
                raise
        
        # Prepare result
        key_value = key if not STREAM_PARTIAL_BPM_ONLY else None
        scale_value = scale if not STREAM_PARTIAL_BPM_ONLY else None
        key_conf_value = (
            round(key_confidence_normalized, 2) if key_confidence_normalized is not None else 0.0
        )
        if STREAM_PARTIAL_BPM_ONLY:
            key_conf_value = None

        firestore_result = {
            "index": index,
            "url": url,
            "trace_id": trace_tag,
            "bpm_essentia": int(round(bpm_normalized)) if bpm_normalized is not None else None,
            "bpm_raw_essentia": round(bpm_raw, 2) if bpm_raw is not None else None,
            "bpm_confidence_essentia": round(bpm_confidence_normalized, 2) if bpm_confidence_normalized is not None else None,
            "bpm_librosa": None,
            "bpm_raw_librosa": None,
            "bpm_confidence_librosa": None,
            "key_essentia": key_value,
            "scale_essentia": scale_value,
            "keyscale_confidence_essentia": key_conf_value,
            "key_librosa": None,
            "scale_librosa": None,
            "keyscale_confidence_librosa": None,
            "status": "final"
        }

        # Stream partial result early if enabled or fallback is needed
        should_stream_partial = STREAM_PARTIAL_BPM_ONLY or need_fallback_bpm or need_fallback_key
        if should_stream_partial:
            firestore_result["status"] = "partial"
            partial_debug_info = list(debug_info_parts)
            if STREAM_PARTIAL_BPM_ONLY:
                partial_debug_info.append("Key pending (partial)")
            if need_fallback_bpm or need_fallback_key:
                partial_debug_info.append("Fallback pending")
            partial_debug_txt = generate_debug_output(
                partial_debug_info,
                timing,
                None,
                debug_level
            )
            firestore_result["debug_txt"] = partial_debug_txt if partial_debug_txt else None

            if not SKIP_PARTIAL_WRITES:
                log_task(
                    logging.INFO,
                    batch_id,
                    index,
                    "Writing partial result",
                    event="firestore_partial_write",
                    trace_id=trace_tag,
                )

                @retry(
                    stop=stop_after_attempt(5),
                    wait=wait_exponential(multiplier=1, min=1, max=30),
                    retry=retry_if_exception_type((Exception,)),
                    reraise=True
                )
                def update_partial_result():
                    """Write partial result without incrementing processed (idempotent)."""
                    transaction = db.transaction()

                    @firestore.transactional
                    def update_in_transaction(transaction):
                        batch_doc = batch_ref.get(transaction=transaction)
                        if not batch_doc.exists:
                            raise Exception(f"Batch {batch_id} not found")

                        batch_data = batch_doc.to_dict()
                        results = batch_data.get('results', {})
                        existing = results.get(str(index))
                        if existing and existing.get("status") in ("final", "error"):
                            return False

                        transaction.update(batch_ref, {
                            f'results.{index}': firestore_result
                        })
                        return True

                    return update_in_transaction(transaction)

                await loop.run_in_executor(None, update_partial_result)
            else:
                log_task(
                    logging.DEBUG,
                    batch_id,
                    index,
                    "Skipping partial write (SKIP_PARTIAL_WRITES=true)",
                    event="firestore_partial_skipped",
                    trace_id=trace_tag,
                )
        
        # Compute key after partial (to improve time-to-first-result)
        if STREAM_PARTIAL_BPM_ONLY:
            if audio_pcm is None:
                debug_info_parts.append("Key skipped (no audio)")
            else:
                key_result = await loop.run_in_executor(
                    executor,
                    analyze_key_from_audio,
                    audio_pcm,
                    max_confidence
                )
                (
                    key,
                    scale,
                    key_strength_raw,
                    key_confidence_normalized,
                    need_fallback_key,
                    key_debug_lines
                ) = key_result
                debug_info_parts.extend(key_debug_lines)
                firestore_result["key_essentia"] = key if key else "unknown"
                firestore_result["scale_essentia"] = scale if scale else "unknown"
                firestore_result["keyscale_confidence_essentia"] = (
                    round(key_confidence_normalized, 2) if key_confidence_normalized is not None else 0.0
                )

                # Write another partial result with key included (before fallback)
                # This gives users faster access to the key data
                if (need_fallback_bpm or need_fallback_key) and not SKIP_PARTIAL_WRITES:
                    # Only write if fallback is needed (otherwise final result will be written soon)
                    firestore_result["status"] = "partial"
                    key_partial_debug_info = list(debug_info_parts)
                    if need_fallback_bpm or need_fallback_key:
                        key_partial_debug_info.append("Fallback pending")
                    key_partial_debug_txt = generate_debug_output(
                        key_partial_debug_info,
                        timing,
                        None,
                        debug_level
                    )
                    firestore_result["debug_txt"] = key_partial_debug_txt if key_partial_debug_txt else None

                    log_task(
                        logging.INFO,
                        batch_id,
                        index,
                        "Writing partial result",
                        event="firestore_partial_write",
                        trace_id=trace_tag,
                    )

                    @retry(
                        stop=stop_after_attempt(5),
                        wait=wait_exponential(multiplier=1, min=1, max=30),
                        retry=retry_if_exception_type((Exception,)),
                        reraise=True
                    )
                    def update_key_partial_result():
                        """Write partial result with key included (before fallback)."""
                        transaction = db.transaction()

                        @firestore.transactional
                        def update_in_transaction(transaction):
                            batch_doc = batch_ref.get(transaction=transaction)
                            if not batch_doc.exists:
                                raise Exception(f"Batch {batch_id} not found")

                            batch_data = batch_doc.to_dict()
                            results = batch_data.get('results', {})
                            existing = results.get(str(index))
                            if existing and existing.get("status") in ("final", "error"):
                                return False

                            transaction.update(batch_ref, {
                                f'results.{index}': firestore_result
                            })
                            return True

                        return update_in_transaction(transaction)

                    await loop.run_in_executor(None, update_key_partial_result)
                    log_task(
                        logging.INFO,
                        batch_id,
                        index,
                        "Key partial result written",
                        event="firestore_key_partial_written",
                        trace_id=trace_tag,
                    )

        # Handle fallback if needed
        fallback_timing = None
        if need_fallback_bpm or need_fallback_key:
            log_task(
                logging.INFO,
                batch_id,
                index,
                "Calling fallback service",
                event="fallback_call",
                trace_id=trace_tag,
                need_bpm=need_fallback_bpm,
                need_key=need_fallback_key,
                audio_format="pcm_npy" if audio_pcm is not None else "file",
            )
            fallback_start = time.time()
            fallback_result = await call_fallback_service(
                input_path,
                url,
                batch_id,
                index,
                trace_tag,
                need_fallback_bpm,
                need_fallback_key,
                max_confidence,
                debug_level,
                audio_pcm,
                sample_rate
            )
            fallback_end = time.time()
            fallback_duration = fallback_end - fallback_start
            fallback_timing = {"duration": fallback_duration}
            
            if fallback_result:
                log_task(
                    logging.INFO,
                    batch_id,
                    index,
                    "Fallback complete",
                    event="fallback_complete",
                    trace_id=trace_tag,
                    duration_s=fallback_duration,
                )
                if need_fallback_bpm and fallback_result.get("bpm_normalized") is not None:
                    firestore_result["bpm_librosa"] = int(round(fallback_result["bpm_normalized"]))
                    firestore_result["bpm_raw_librosa"] = round(fallback_result["bpm_raw"], 2) if fallback_result.get("bpm_raw") else None
                    firestore_result["bpm_confidence_librosa"] = round(fallback_result["confidence"], 2) if fallback_result.get("confidence") else None
                
                if need_fallback_key and fallback_result.get("key") is not None:
                    firestore_result["key_librosa"] = fallback_result["key"]
                    firestore_result["scale_librosa"] = fallback_result["scale"]
                    firestore_result["keyscale_confidence_librosa"] = round(fallback_result["key_confidence"], 2) if fallback_result.get("key_confidence") else None
            else:
                log_task(
                    logging.WARNING,
                    batch_id,
                    index,
                    "Fallback failed or skipped",
                    event="fallback_failed",
                    trace_id=trace_tag,
                    duration_s=fallback_duration,
                )
        
        # Generate debug output for final result
        debug_txt = generate_debug_output(
            debug_info_parts,
            timing,
            fallback_timing,
            debug_level
        )
        firestore_result["debug_txt"] = debug_txt if debug_txt else None
        firestore_result["status"] = "final"
        
        # Write result to Firestore with idempotency check (using transaction)
        log_task(
            logging.INFO,
            batch_id,
            index,
            "Writing final result",
            event="firestore_write_start",
            trace_id=trace_tag,
            bpm=firestore_result.get("bpm_essentia"),
            key=firestore_result.get("key_essentia"),
        )
        loop = asyncio.get_event_loop()
        
        @retry(
            stop=stop_after_attempt(5),
            wait=wait_exponential(multiplier=1, min=1, max=30),
            retry=retry_if_exception_type((Exception,)),
            reraise=True
        )
        def update_result_idempotent():
            """Update Firestore with idempotency: only increment processed if this index wasn't already written.
            
            Wrapped with retry logic using tenacity to handle transient API errors.
            Retries up to 5 times with exponential backoff (1s, 2s, 4s, 8s, 16s, max 30s).
            """
            try:
                log_task(
                    logging.DEBUG,
                    batch_id,
                    index,
                    "Starting idempotent update",
                    event="firestore_idempotent_update_start",
                    trace_id=trace_tag,
                )
                
                # Use a transaction to ensure idempotency
                transaction = db.transaction()
                
                @firestore.transactional
                def update_in_transaction(transaction):
                    batch_doc = batch_ref.get(transaction=transaction)
                    if not batch_doc.exists:
                        raise Exception(f"Batch {batch_id} not found")
                    
                    batch_data = batch_doc.to_dict()
                    results = batch_data.get('results', {})
                    
                    # Check if this index was already finalized (idempotency check)
                    existing = results.get(str(index))
                    if existing and existing.get("status") in ("final", "error"):
                        log_task(
                            logging.DEBUG,
                            batch_id,
                            index,
                            "Index already finalized, skipping increment",
                            event="firestore_idempotent_skip",
                            trace_id=trace_tag,
                        )
                        return False  # Already finalized
                    
                    # Update with transaction
                    transaction.update(batch_ref, {
                        f'results.{index}': firestore_result,
                        'processed': Increment(1)
                    })
                    return True  # Newly processed
                
                was_new = update_in_transaction(transaction)
                log_task(
                    logging.INFO,
                    batch_id,
                    index,
                    "Firestore transaction completed",
                    event="firestore_transaction_complete",
                    trace_id=trace_tag,
                    is_new=was_new,
                )
                return was_new
            except Exception as e:
                import traceback
                error_details = f"{str(e)}\n{traceback.format_exc()}"
                log_task(
                    logging.ERROR,
                    batch_id,
                    index,
                    "Firestore write error (will retry)",
                    event="firestore_write_error",
                    trace_id=trace_tag,
                    error=error_details,
                )
                raise
        
        log_task(
            logging.DEBUG,
            batch_id,
            index,
            "Submitting Firestore update to executor",
            event="firestore_executor_submit",
            trace_id=trace_tag,
        )
        was_new = await loop.run_in_executor(None, update_result_idempotent)
        log_task(
            logging.DEBUG,
            batch_id,
            index,
            "Firestore update executor returned",
            event="firestore_executor_return",
            trace_id=trace_tag,
            is_new=was_new,
        )
        
        # Check if batch is complete (only if this was a new result)
        if was_new:
            batch_doc = await loop.run_in_executor(None, batch_ref.get)
            if batch_doc.exists:
                batch_data = batch_doc.to_dict()
                processed_count = batch_data.get('processed', 0)
                total_urls = batch_data.get('total_urls', 0)
                log_event(
                    logging.INFO,
                    "Batch progress",
                    event="batch_progress",
                    batch_id=batch_id,
                    processed=processed_count,
                    total=total_urls,
                )
                
                if processed_count >= total_urls:
                    @retry(
                        stop=stop_after_attempt(5),
                        wait=wait_exponential(multiplier=1, min=1, max=30),
                        retry=retry_if_exception_type((Exception,)),
                        reraise=True
                    )
                    def update_status():
                        """Update batch status to completed.
                        
                        Wrapped with retry logic using tenacity to handle transient API errors.
                        Retries up to 5 times with exponential backoff (1s, 2s, 4s, 8s, 16s, max 30s).
                        """
                        batch_ref.update({'status': 'completed'})
                    await loop.run_in_executor(None, update_status)
                    log_event(logging.INFO, "Batch completed", event="batch_completed", batch_id=batch_id)
        
        log_task(logging.INFO, batch_id, index, "Task complete", event="task_complete", trace_id=trace_tag)
        
    except Exception as e:
        # Write error to Firestore
        import traceback
        error_details = f"{str(e)}\n{traceback.format_exc()}"
        log_task(
            logging.ERROR,
            batch_id,
            index,
            "Task error",
            event="task_error",
            trace_id=trace_tag,
            error=error_details,
        )
        
        loop = asyncio.get_event_loop()
        error_result = {
            "index": index,
            "url": url,
            "error": error_details[:500],
            "status": "error"
        }
        
        @retry(
            stop=stop_after_attempt(5),
            wait=wait_exponential(multiplier=1, min=1, max=30),
            retry=retry_if_exception_type((Exception,)),
            reraise=True
        )
        def update_error():
            """Update Firestore with error result.
            
            Wrapped with retry logic using tenacity to handle transient API errors.
            Retries up to 5 times with exponential backoff (1s, 2s, 4s, 8s, 16s, max 30s).
            """
            try:
                batch_ref.update({
                    f'results.{index}': error_result,
                    'processed': Increment(1)
                })
            except Exception as update_err:
                log_task(
                    logging.ERROR,
                    batch_id,
                    index,
                    "Failed to write error (will retry)",
                    event="firestore_error_write_failed",
                    trace_id=trace_tag,
                    error=str(update_err),
                )
                raise
        
        await loop.run_in_executor(None, update_error)
        
        # Check if batch is complete even on error
        batch_doc = await loop.run_in_executor(None, batch_ref.get)
        if batch_doc.exists:
            batch_data = batch_doc.to_dict()
            if batch_data.get('processed', 0) >= batch_data.get('total_urls', 0):
                @retry(
                    stop=stop_after_attempt(5),
                    wait=wait_exponential(multiplier=1, min=1, max=30),
                    retry=retry_if_exception_type((Exception,)),
                    reraise=True
                )
                def update_status():
                    """Update batch status to completed.
                    
                    Wrapped with retry logic using tenacity to handle transient API errors.
                    Retries up to 5 times with exponential backoff (1s, 2s, 4s, 8s, 16s, max 30s).
                    """
                    batch_ref.update({'status': 'completed'})
                await loop.run_in_executor(None, update_status)
    
    finally:
        # Cleanup temp file
        if input_path and os.path.exists(input_path):
            try:
                os.unlink(input_path)
                log_task(
                    logging.DEBUG,
                    batch_id,
                    index,
                    "Temp file cleaned up",
                    event="temp_cleanup",
                    trace_id=trace_tag,
                )
            except Exception:
                pass


async def call_fallback_service(
    file_path: str,
    url: str,
    batch_id: str,
    index: int,
    trace_id: str,
    need_fallback_bpm: bool,
    need_fallback_key: bool,
    max_confidence: float,
    debug_level: str,
    audio_pcm,
    sample_rate
):
    """Call fallback service for a single item."""
    if (audio_pcm is None or not sample_rate) and (not file_path or not os.path.exists(file_path)):
        return None
    
    file_handle = None
    try:
        # Get auth headers
        auth_headers = await get_auth_headers(FALLBACK_SERVICE_AUDIENCE)
        
        # Check circuit breaker
        if not fallback_circuit_breaker.can_attempt():
            last_failure_age = (
                time.time() - fallback_circuit_breaker.last_failure_time
                if fallback_circuit_breaker.last_failure_time
                else None
            )
            last_failure_display = f"{last_failure_age:.1f}s ago" if last_failure_age is not None else "unknown"
            log_task(
                logging.WARNING,
                batch_id,
                index,
                "Circuit breaker open - skipping fallback",
                event="circuit_breaker_open",
                trace_id=trace_id,
                failures=fallback_circuit_breaker.failure_count,
                failure_threshold=fallback_circuit_breaker.failure_threshold,
                last_failure=last_failure_display,
            )
            return None
        
        files = []
        payload_type = None
        payload_bytes = None
        loop = asyncio.get_event_loop()
        if audio_pcm is not None and sample_rate:
            # Send pre-decoded PCM to avoid reloading in fallback service
            pcm_array = np.asarray(audio_pcm, dtype=np.float32)
            buffer = io.BytesIO()
            np.save(buffer, pcm_array, allow_pickle=False)
            buffer.seek(0)
            pcm_bytes = buffer.read()
            payload_type = "pcm_npy"
            payload_bytes = len(pcm_bytes)
            files.append(("pcm_npy_0", ("audio.npy", pcm_bytes, "application/octet-stream")))
        else:
            # Fall back to sending the original file
            file_handle = await loop.run_in_executor(None, open, file_path, "rb")
            payload_type = "file"
            payload_bytes = os.path.getsize(file_path) if os.path.exists(file_path) else None
            files.append(("audio_files", ("audio.tmp", file_handle, "audio/mpeg")))
        data = {
            "process_bpm_0": str(need_fallback_bpm).lower(),
            "process_key_0": str(need_fallback_key).lower(),
            "url_0": url,
            "trace_id_0": trace_id,
            "sample_rate_0": str(int(sample_rate)) if sample_rate else "44100"
        }
        log_telemetry(
            f"worker_fallback_payload type={payload_type} bytes={payload_bytes} "
            f"sr={int(sample_rate) if sample_rate else 44100} "
            f"trace_id={trace_id}"
        )
        
        # Retry logic
        client = get_http_client()
        
        for attempt in range(FALLBACK_MAX_RETRIES):
            request_timeout = FALLBACK_REQUEST_TIMEOUT_COLD_START if attempt == 0 else FALLBACK_REQUEST_TIMEOUT_WARM
            
            try:
                timeout = httpx.Timeout(
                    connect=5.0,
                    read=request_timeout,
                    write=request_timeout,
                    pool=5.0
                )
                
                attempt_start = time.time()
                log_task(
                    logging.INFO,
                    batch_id,
                    index,
                    "Fallback attempt",
                    event="fallback_attempt",
                    trace_id=trace_id,
                    attempt=attempt + 1,
                    max_attempts=FALLBACK_MAX_RETRIES,
                    timeout_s=request_timeout,
                    cold_start=attempt == 0,
                )
                response = await client.post(
                    f"{FALLBACK_SERVICE_URL}/process_batch",
                    files=files,
                    data=data,
                    headers=auth_headers,
                    timeout=timeout
                )
                attempt_s = time.time() - attempt_start
                log_telemetry(
                    f"worker_fallback_attempt_s={attempt_s:.3f} "
                    f"status={response.status_code} attempt={attempt + 1}"
                )
                
                if response.status_code == 200:
                    fallback_results = response.json()
                    if fallback_results and len(fallback_results) > 0:
                        fallback_circuit_breaker.record_success()
                        return fallback_results[0]
                
                log_task(
                    logging.WARNING,
                    batch_id,
                    index,
                    "Fallback failed with status",
                    event="fallback_http_error",
                    trace_id=trace_id,
                    status_code=response.status_code,
                )
                fallback_circuit_breaker.record_failure()
                return None
                
            except (httpx.TimeoutException, httpx.ConnectError, httpx.NetworkError) as e:
                log_task(
                    logging.ERROR,
                    batch_id,
                    index,
                    "Fallback network error",
                    event="fallback_network_error",
                    trace_id=trace_id,
                    error=str(e),
                )
                if attempt < FALLBACK_MAX_RETRIES - 1:
                    await asyncio.sleep(FALLBACK_RETRY_DELAY * (2 ** attempt))
                else:
                    fallback_circuit_breaker.record_failure()
                    return None
            except Exception as e:
                log_task(
                    logging.ERROR,
                    batch_id,
                    index,
                    "Fallback error",
                    event="fallback_error",
                    trace_id=trace_id,
                    error=str(e),
                )
                fallback_circuit_breaker.record_failure()
                return None
        
        return None
        
    except Exception as e:
        log_task(
            logging.ERROR,
            batch_id,
            index,
            "Fallback service error",
            event="fallback_service_error",
            trace_id=trace_id,
            error=str(e),
        )
        return None
    finally:
        if file_handle:
            try:
                file_handle.close()
            except Exception:
                pass


@app.post("/pubsub/process")
async def process_pubsub_message(request: Request):
    """Process Pub/Sub push message.
    
    CRITICAL: This endpoint processes SYNCHRONOUSLY and returns 2xx ONLY after Firestore write completes.
    
    - NO background tasks (asyncio.create_task is NOT used)
    - NO early returns (we await process_single_url_task which waits for Firestore)
    - Returns 204 (No Content) on success - only after Firestore write is done
    - Returns 500 on failure - so Pub/Sub will retry
    
    This ensures:
    1. Cloud Run doesn't kill the task after request returns
    2. Pub/Sub can retry if we return non-2xx
    3. No message loss if container is killed during processing
    """
    global _first_request
    request_start = time.time()
    cold_start = False
    request_token = None
    shared_token = None
    if _first_request:
        cold_start = True
        _first_request = False
    log_telemetry(f"worker_request_start cold_start={str(cold_start).lower()}")
    try:
        envelope = await request.json()
        
        if 'message' not in envelope:
            raise HTTPException(status_code=400, detail="Invalid Pub/Sub message format")
        
        message = envelope['message']
        if 'data' not in message:
            raise HTTPException(status_code=400, detail="Missing data in Pub/Sub message")
        
        # Decode message
        message_data = json.loads(base64.b64decode(message['data']).decode('utf-8'))
        
        batch_id = message_data.get('batch_id')
        url = message_data.get('url')
        index = message_data.get('index')
        max_confidence = message_data.get('max_confidence', 0.65)
        debug_level = message_data.get('debug_level', 'normal')
        fallback_override = message_data.get('fallback_override')
        trace_id = message_data.get('trace_id')
        
        if not all([batch_id, url, index is not None]):
            raise HTTPException(status_code=400, detail="Missing required fields")
        
        trace_tag = trace_id or "unknown"
        request_token = request_id_var.set(trace_tag)
        shared_token = None
        try:
            shared_token = shared_processing.request_id_var.set(trace_tag)
        except Exception:
            shared_token = None
        log_task(
            logging.INFO,
            batch_id,
            index,
            "Received Pub/Sub message, processing synchronously",
            event="pubsub_received",
            trace_id=trace_tag,
        )
        
        # CRITICAL: Process synchronously - await completion before returning ANY status code
        # process_single_url_task waits for:
        #   1. Audio download
        #   2. Audio analysis
        #   3. Fallback service (if needed)
        #   4. Firestore write (with transaction)
        # Only after ALL of the above completes do we return
        try:
            await process_single_url_task(
                batch_id,
                url,
                index,
                max_confidence,
                debug_level,
                fallback_override,
                trace_id,
            )
            # At this point, Firestore write is complete
            log_task(
                logging.INFO,
                batch_id,
                index,
                "Processing completed successfully",
                event="pubsub_processed",
                trace_id=trace_tag,
            )
            request_s = time.time() - request_start
            log_telemetry(
                f"worker_request_done_s={request_s:.3f} "
                f"batch_id={batch_id} index={index} trace_id={trace_id} rss_kb={get_rss_kb()}"
            )
            # Return 204 (No Content) - Pub/Sub interprets this as successful ACK
            # We return 204 (not 200) to signal success without a body
            from fastapi import Response
            return Response(status_code=204)
        except Exception as e:
            import traceback
            error_details = f"Processing failed: {str(e)}\n{traceback.format_exc()}"
            log_task(
                logging.ERROR,
                batch_id,
                index,
                "Processing failed",
                event="pubsub_processing_failed",
                trace_id=trace_tag,
                error=error_details,
            )
            request_s = time.time() - request_start
            log_telemetry(
                f"worker_request_done_s={request_s:.3f} "
                f"batch_id={batch_id} index={index} trace_id={trace_id} status=error rss_kb={get_rss_kb()}"
            )
            # Return 500 so Pub/Sub will retry the message
            raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")
        
    except HTTPException:
        # Re-raise HTTP exceptions (including our 500)
        raise
    except Exception as e:
        import traceback
        error_details = f"Error processing Pub/Sub: {str(e)}\n{traceback.format_exc()}"
        log_event(logging.ERROR, "Pub/Sub endpoint error", event="pubsub_endpoint_error", error=error_details)
        # Return 500 so Pub/Sub will retry
        raise HTTPException(status_code=500, detail=f"Error processing message: {str(e)}")
    finally:
        try:
            request_id_var.reset(request_token)
        except Exception:
            pass
        if shared_token is not None:
            try:
                shared_processing.request_id_var.reset(shared_token)
            except Exception:
                pass


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"ok": True}
