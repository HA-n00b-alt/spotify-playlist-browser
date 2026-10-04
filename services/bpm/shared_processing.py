"""
Shared processing functions for BPM analysis
Used by both main service and worker service
"""
import os
import time
import asyncio
import tempfile
import logging
import json
from contextvars import ContextVar
from typing import Optional, Tuple, List
from urllib.parse import urlparse
import httpx
import aiofiles

# Pre-import Essentia at module level to avoid hanging on first use
# This is a heavy import but necessary for analysis
try:
    import essentia.standard as es
    ESSENTIA_AVAILABLE = True
except ImportError:
    es = None
    ESSENTIA_AVAILABLE = False

# Download limits
CONNECT_TIMEOUT = 5.0
TOTAL_TIMEOUT = 20.0
MAX_SIZE = 10 * 1024 * 1024  # 10MB
MAX_AUDIO_DURATION = 35.0

# Fallback Service Configuration
FALLBACK_SERVICE_URL = "https://bpm-fallback-service-7jlgdaerna-ey.a.run.app"
FALLBACK_SERVICE_AUDIENCE = FALLBACK_SERVICE_URL
FALLBACK_REQUEST_TIMEOUT_COLD_START = 120.0
FALLBACK_REQUEST_TIMEOUT_WARM = 60.0
FALLBACK_MAX_RETRIES = 3
FALLBACK_RETRY_DELAY = 2.0

# Essentia Configuration
ESSENTIA_MAX_CONFIDENCE_RAW = 5.32

# BPM Normalization thresholds
BPM_LOWER_THRESHOLD = 40
BPM_UPPER_THRESHOLD = 220

logger = logging.getLogger(__name__)
request_id_var: ContextVar[Optional[str]] = ContextVar("request_id", default=None)

def log_event(level: int, message: str, **fields) -> None:
    record = {"message": message, **fields}
    request_id = request_id_var.get()
    if request_id:
        record["request_id"] = request_id
    logger.log(level, json.dumps(record, ensure_ascii=True))


class FallbackCircuitBreaker:
    """Simple circuit breaker for fallback service calls."""
    def __init__(self, failure_threshold=5, recovery_timeout=60):
        """
        Initializes the FallbackCircuitBreaker.
        
        Args:
            failure_threshold (int): Number of consecutive failures before the circuit opens.
                                     Can be overridden by FALLBACK_FAILURE_THRESHOLD environment variable.
            recovery_timeout (int): Time in seconds before a half-open state is attempted.
                                    Can be overridden by FALLBACK_RECOVERY_TIMEOUT environment variable.
        """
        self.failure_threshold = int(os.getenv("FALLBACK_FAILURE_THRESHOLD", failure_threshold))
        self.recovery_timeout = int(os.getenv("FALLBACK_RECOVERY_TIMEOUT", recovery_timeout))
        self.failure_count = 0
        self.last_failure_time = None
        self.state = "closed"
    
    
    def record_success(self):
        prev_state = self.state
        self.failure_count = 0
        self.state = "closed"
        if prev_state != "closed":
            log_event(
                logging.WARNING,
                "Circuit breaker state changed",
                event="circuit_breaker_state_change",
                previous_state=prev_state,
                state="closed",
            )
    
    def record_failure(self):
        prev_state = self.state
        self.failure_count += 1
        self.last_failure_time = time.time()
        if self.failure_count >= self.failure_threshold:
            self.state = "open"
            if prev_state != "open":
                log_event(
                    logging.WARNING,
                    "Circuit breaker state changed",
                    event="circuit_breaker_state_change",
                    previous_state=prev_state,
                    state="open",
                    failures=self.failure_count,
                )
    
    def can_attempt(self) -> bool:
        if self.state == "closed":
            return True
        elif self.state == "open":
            if self.last_failure_time and (time.time() - self.last_failure_time) >= self.recovery_timeout:
                self.state = "half_open"
                return True
            return False
        else:  # half_open
            return True


def validate_redirect_url(url: str) -> bool:
    """Validate that a redirect URL uses HTTPS."""
    return url.startswith("https://")


async def download_audio_async(url: str, output_path: str, client: httpx.AsyncClient) -> None:
    """Download audio file with SSRF protection and size limits."""
    timeout = httpx.Timeout(
        connect=CONNECT_TIMEOUT,
        read=TOTAL_TIMEOUT,
        write=TOTAL_TIMEOUT,
        pool=CONNECT_TIMEOUT
    )
    
    current_url = url
    redirect_count = 0
    max_redirects = 10
    
    while redirect_count < max_redirects:
        response = await client.get(current_url, timeout=timeout)
        
        if response.status_code in (301, 302, 303, 307, 308):
            redirect_url = response.headers.get("location")
            await response.aclose()
            
            if not redirect_url:
                raise Exception("Invalid redirect: missing Location header")
            
            if redirect_url.startswith("/"):
                parsed = urlparse(current_url)
                redirect_url = f"{parsed.scheme}://{parsed.netloc}{redirect_url}"
            elif not redirect_url.startswith("http"):
                parsed = urlparse(current_url)
                redirect_url = f"{parsed.scheme}://{parsed.netloc}/{redirect_url.lstrip('/')}"
            
            if not validate_redirect_url(redirect_url):
                raise Exception("Redirect to non-HTTPS URL not allowed")
            
            log_event(
                logging.INFO,
                "Following redirect",
                event="download_redirect",
                redirect_count=redirect_count + 1,
                max_redirects=max_redirects,
                from_url=current_url[:80],
                to_url=redirect_url[:80],
            )
            current_url = redirect_url
            redirect_count += 1
            continue
        
        if response.status_code != 200:
            await response.aclose()
            raise Exception(f"Download failed: HTTP {response.status_code}")
        
        final_url = str(response.url)
        if not validate_redirect_url(final_url):
            raise Exception("Final URL must use HTTPS")
        
        content_length = response.headers.get("content-length")
        if content_length and int(content_length) > MAX_SIZE:
            raise Exception(f"File too large (max {MAX_SIZE / 1024 / 1024:.1f}MB)")
        
        total_size = 0
        try:
            async with aiofiles.open(output_path, "wb") as f:
                async for chunk in response.aiter_bytes():
                    total_size += len(chunk)
                    if total_size > MAX_SIZE:
                        await f.close()
                        try:
                            os.unlink(output_path)
                        except Exception:
                            pass
                        await response.aclose()
                        raise Exception(f"File too large (max {MAX_SIZE / 1024 / 1024:.1f}MB)")
                    await f.write(chunk)
        finally:
            await response.aclose()
        
        return
    
    raise Exception("Too many redirects")


def normalize_confidence(confidence: float) -> Tuple[float, str]:
    """Normalize confidence value to 0-1 range."""
    if confidence < 0:
        return 0.0, "very low"
    
    if confidence < 1.0:
        quality = "very low"
    elif confidence < 2.0:
        quality = "low"
    elif confidence < 3.0:
        quality = "moderate"
    elif confidence < 3.5:
        quality = "high"
    else:
        quality = "excellent"
    
    normalized = min(1.0, confidence / ESSENTIA_MAX_CONFIDENCE_RAW)
    return float(normalized), quality


def normalize_bpm(bpm: float) -> float:
    """Normalize BPM by applying corrections for extreme outliers."""
    normalized = bpm
    if normalized < BPM_LOWER_THRESHOLD:
        normalized *= 2
    elif normalized > BPM_UPPER_THRESHOLD:
        normalized /= 2
    return normalized


def analyze_key_from_audio(audio, max_confidence: float) -> Tuple[str, str, float, float, bool, List[str]]:
    """Analyze key from a pre-loaded audio array."""
    debug_lines = []
    key = "unknown"
    scale = "unknown"
    key_strength_raw = 0.0
    key_confidence_normalized = 0.0
    need_fallback_key = False

    try:
        log_event(logging.DEBUG, "Starting key extraction", event="analyze_key_start")
        key_profiles = ['temperley', 'krumhansl', 'edma', 'edmm']
        results = []

        for profile in key_profiles:
            try:
                log_event(logging.DEBUG, "Trying key profile", event="analyze_key_profile_try", profile=profile)
                key_extractor = es.KeyExtractor(profileType=profile)
                key_result, scale_result, strength = key_extractor(audio)
                results.append((str(key_result), str(scale_result), float(strength), profile))
                debug_lines.append(f"key_profile={profile}: key={key_result} {scale_result}, strength={strength:.3f}")
                log_event(
                    logging.DEBUG,
                    "Key profile result",
                    event="analyze_key_profile_result",
                    profile=profile,
                    key=str(key_result),
                    scale=str(scale_result),
                    strength=float(strength),
                )
            except Exception as e:
                log_event(
                    logging.WARNING,
                    "Key profile failed",
                    event="analyze_key_profile_failed",
                    profile=profile,
                    error=str(e),
                )
                continue

        if results:
            results.sort(key=lambda x: x[2], reverse=True)
            key, scale, key_strength_raw, winning_profile = results[0]
            key_confidence_normalized = min(1.0, max(0.0, key_strength_raw))
            debug_lines.append(f"Winner: {winning_profile} (strength={key_strength_raw:.3f})")
            log_event(
                logging.DEBUG,
                "Key winner",
                event="analyze_key_winner",
                profile=winning_profile,
                key=key,
                scale=scale,
                strength=key_strength_raw,
            )
        else:
            try:
                log_event(logging.DEBUG, "No profile results, trying default KeyExtractor", event="analyze_key_default_try")
                key_extractor = es.KeyExtractor()
                key, scale, key_strength_raw = key_extractor(audio)
                key_confidence_normalized = min(1.0, max(0.0, key_strength_raw))
                debug_lines.append(f"Fallback: default KeyExtractor")
                log_event(
                    logging.DEBUG,
                    "Default KeyExtractor result",
                    event="analyze_key_default_result",
                    key=key,
                    scale=scale,
                    strength=key_strength_raw,
                )
            except Exception as e:
                error_msg = f"KeyExtractor fallback error: {str(e)}"
                import traceback
                log_event(
                    logging.ERROR,
                    "Default KeyExtractor error",
                    event="analyze_key_default_error",
                    error=error_msg,
                    traceback=traceback.format_exc(),
                )
                debug_lines.append(error_msg)
                need_fallback_key = True

        if key_confidence_normalized >= max_confidence:
            debug_lines.append(f"Key strength ({key_confidence_normalized:.3f}) >= threshold")
        else:
            need_fallback_key = True
            debug_lines.append(f"Key strength ({key_confidence_normalized:.3f}) < threshold - fallback needed")
    except Exception as e:
        error_msg = f"Key computation error: {str(e)}"
        import traceback
        log_event(
            logging.ERROR,
            "Key computation error",
            event="analyze_key_error",
            error=error_msg,
            traceback=traceback.format_exc(),
        )
        debug_lines.append(error_msg)
        need_fallback_key = True

    return key, scale, key_strength_raw, key_confidence_normalized, need_fallback_key, debug_lines


def analyze_audio(
    audio_path: str,
    max_confidence: float,
    return_audio: bool = False,
    compute_key: bool = True
) -> Tuple:
    """Analyze audio file: compute BPM and key.

    If return_audio is True, append (audio, sample_rate) to the result tuple.
    """
    import time
    import resource
    start_time = time.time()
    load_start = None
    load_duration = None
    bpm_start = None
    bpm_duration = None
    key_start = None
    key_duration = None
    log_event(logging.DEBUG, "Starting analysis", event="analyze_start", audio_path=audio_path, start_time=start_time)
    
    def _with_audio(result_tuple, audio_data, sample_rate):
        if return_audio:
            return result_tuple + (audio_data, sample_rate)
        return result_tuple

    # Check if Essentia is available (should be pre-imported at module level)
    if not ESSENTIA_AVAILABLE or es is None:
        error_msg = "Essentia not available (import failed at module level)"
        log_event(logging.ERROR, "Essentia unavailable", event="analyze_essentia_unavailable", error=error_msg)
        return _with_audio(
            (None, None, None, None, "error", "unknown", "unknown", 0.0, 0.0, True, True, error_msg),
            None,
            None,
        )
    
    log_event(logging.DEBUG, "Essentia available (pre-imported)", event="analyze_essentia_available")
    
    debug_lines = []
    
    try:
        log_event(logging.DEBUG, "Creating MonoLoader", event="analyze_loader_create")
        load_start = time.time()
        sample_rate = 44100
        loader = es.MonoLoader(filename=audio_path, sampleRate=sample_rate)
        log_event(logging.DEBUG, "Loading audio file", event="analyze_audio_load_start")
        audio = loader()
        load_duration = time.time() - load_start
        log_event(logging.DEBUG, "Audio loaded", event="analyze_audio_loaded", samples=len(audio))
        
        max_samples = int(MAX_AUDIO_DURATION * 44100)
        if len(audio) > max_samples:
            audio = audio[:max_samples]
            debug_lines.append(f"Audio loaded: {len(audio)/sample_rate:.1f}s (trimmed, capped at {MAX_AUDIO_DURATION}s)")
        else:
            debug_lines.append(f"Audio loaded: {len(audio)/sample_rate:.1f}s")
        log_event(
            logging.DEBUG,
            "Audio prepared",
            event="analyze_audio_prepared",
            samples=len(audio),
            seconds=len(audio) / sample_rate,
        )
    except Exception as e:
        error_msg = f"Essentia audio loading error: {str(e)}"
        import traceback
        log_event(
            logging.ERROR,
            "Audio loading error",
            event="analyze_audio_load_error",
            error=error_msg,
            traceback=traceback.format_exc(),
        )
        debug_lines.append(error_msg)
        return _with_audio(
            (None, None, None, None, "error", "unknown", "unknown", 0.0, 0.0, True, True, "\n".join(debug_lines)),
            None,
            None,
        )
    
    # BPM extraction
    bpm_normalized = None
    bpm_raw = None
    bpm_confidence_normalized = None
    bpm_quality = None
    bpm_method = "multifeature"
    need_fallback_bpm = False
    
    try:
        bpm_start = time.time()
        log_event(logging.DEBUG, "Creating RhythmExtractor2013", event="analyze_bpm_extractor_create")
        rhythm_extractor = es.RhythmExtractor2013(method="multifeature")
        log_event(logging.DEBUG, "Extracting BPM", event="analyze_bpm_start")
        bpm_raw, beats, confidence_raw, _, beats_intervals = rhythm_extractor(audio)
        bpm_duration = time.time() - bpm_start
        log_event(
            logging.DEBUG,
            "BPM extracted",
            event="analyze_bpm_extracted",
            bpm_raw=float(bpm_raw),
            confidence_raw=float(confidence_raw),
        )
        
        bpm_confidence_normalized, bpm_quality = normalize_confidence(float(confidence_raw))
        bpm_normalized = normalize_bpm(float(bpm_raw))
        
        debug_lines.append(f"BPM={bpm_raw:.2f} (normalized={round(bpm_normalized, 1):.1f})")
        debug_lines.append(f"Confidence: raw={confidence_raw:.3f}, normalized={bpm_confidence_normalized:.3f}, quality={bpm_quality}")
        
        if bpm_confidence_normalized >= max_confidence:
            debug_lines.append(f"BPM confidence ({bpm_confidence_normalized:.3f}) >= threshold ({max_confidence:.2f})")
        else:
            need_fallback_bpm = True
            debug_lines.append(f"BPM confidence ({bpm_confidence_normalized:.3f}) < threshold ({max_confidence:.2f}) - fallback needed")
    except Exception as e:
        error_msg = f"BPM extraction error: {str(e)}"
        import traceback
        log_event(
            logging.ERROR,
            "BPM extraction error",
            event="analyze_bpm_error",
            error=error_msg,
            traceback=traceback.format_exc(),
        )
        debug_lines.append(error_msg)
        need_fallback_bpm = True
    
    # Key extraction (optional)
    key = "unknown"
    scale = "unknown"
    key_strength_raw = 0.0
    key_confidence_normalized = 0.0
    need_fallback_key = False
    key_start = None
    key_duration = None
    
    if compute_key:
        key_start = time.time()
        (
            key,
            scale,
            key_strength_raw,
            key_confidence_normalized,
            need_fallback_key,
            key_debug_lines
        ) = analyze_key_from_audio(audio, max_confidence)
        key_duration = time.time() - key_start
        debug_lines.extend(key_debug_lines)
    else:
        debug_lines.append("Key skipped (partial)")
        need_fallback_key = False
    
    total_time = time.time() - start_time
    try:
        rss_kb = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    except Exception:
        rss_kb = None
    audio_load_s = f"{load_duration:.3f}" if load_duration is not None else "na"
    bpm_s = f"{bpm_duration:.3f}" if bpm_duration is not None else "na"
    key_s = f"{key_duration:.3f}" if key_duration is not None else "na"
    log_event(
        logging.DEBUG,
        "Shared processing telemetry",
        event="shared_processing_telemetry",
        audio_load_s=audio_load_s,
        bpm_s=bpm_s,
        key_s=key_s,
        total_s=f"{total_time:.3f}",
        samples=len(audio) if "audio" in locals() else "na",
        rss_kb=rss_kb if rss_kb is not None else "na",
    )
    log_event(
        logging.DEBUG,
        "Analysis complete",
        event="analyze_complete",
        bpm=bpm_normalized,
        key=key,
        scale=scale,
        total_s=total_time,
    )
    
    result = (
        bpm_normalized, bpm_raw, bpm_confidence_normalized, bpm_quality, bpm_method,
        key, scale, key_strength_raw, key_confidence_normalized,
        need_fallback_bpm, need_fallback_key,
        "\n".join(debug_lines)
    )
    log_event(logging.DEBUG, "Returning result tuple", event="analyze_return", length=len(result))
    return _with_audio(result, audio, sample_rate)


async def get_auth_headers(audience: str) -> dict:
    """Generate OIDC token for service-to-service auth."""
    try:
        import google.auth
        import google.auth.transport.requests
        import google.oauth2.id_token
    except ImportError as e:
        raise Exception(f"google-auth not available: {str(e)}")
    
    def _get_token_sync():
        credentials, project = google.auth.default()
        if not credentials.valid:
            auth_request = google.auth.transport.requests.Request()
            credentials.refresh(auth_request)
        
        auth_request = google.auth.transport.requests.Request()
        token = google.oauth2.id_token.fetch_id_token(auth_request, audience)
        
        if not token:
            raise Exception(f"Empty token for audience: {audience}")
        
        return {"Authorization": f"Bearer {token}"}
    
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _get_token_sync)


def generate_debug_output(debug_info_parts: List[str], timing: dict, fallback_timing: Optional[dict], debug_level: str) -> str:
    """Generate debug output based on debug_level."""
    if debug_level == "minimal":
        filtered = [line for line in debug_info_parts if "error" in line.lower() or "SUCCESS" in line or "Fallback" in line]
        return "\n".join(filtered) if filtered else ""
    
    elif debug_level == "normal":
        output = "\n".join(debug_info_parts)
        telemetry = []
        if timing.get("download_duration"):
            telemetry.append(f"Download: {timing['download_duration']:.2f}s")
        if timing.get("essentia_duration"):
            telemetry.append(f"Essentia: {timing['essentia_duration']:.2f}s")
        if fallback_timing and fallback_timing.get("duration"):
            telemetry.append(f"Fallback: {fallback_timing['duration']:.2f}s")
        if telemetry:
            output += f"\n=== Telemetry ===\n" + ", ".join(telemetry)
        return output
    
    else:  # detailed
        output = "\n".join(debug_info_parts)
        telemetry = []
        if timing.get("download_duration"):
            telemetry.append(f"Download: {timing['download_duration']:.3f}s")
        if timing.get("essentia_duration"):
            telemetry.append(f"Essentia: {timing['essentia_duration']:.3f}s")
        if fallback_timing and fallback_timing.get("duration"):
            telemetry.append(f"Fallback: {fallback_timing['duration']:.3f}s")
        if telemetry:
            output += f"\n=== Telemetry ===\n" + "\n".join(telemetry)
        return output
