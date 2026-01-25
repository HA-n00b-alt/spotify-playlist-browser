# BPM Finder API

A Google Cloud Run microservice that computes BPM (beats per minute) and musical key from audio preview URLs. **Async streaming architecture** with real-time NDJSON results. The service is deployed as a **private** Cloud Run service, requiring Google Cloud IAM authentication.

## Features

- **Async Streaming Architecture**: Submit batch, get `batch_id` immediately (<500ms), stream results in real-time via NDJSON
- **Batch Processing**: Process multiple audio URLs concurrently via Pub/Sub workers
- **Single-Method BPM Extraction**: Uses Essentia's `RhythmExtractor2013(method="multifeature")` for BPM detection
- **Direct Compressed Audio Analysis**: Essentia handles MP3/AAC decoding directly (no ffmpeg conversion step)
- **Duration Capping**: Analyzes first 35 seconds only for latency/cost optimization
- **Selective Fallback Architecture**: Automatically uses a high-accuracy fallback service (librosa-based) only when needed:
  - BPM fallback: Triggered when BPM confidence < `max_confidence` threshold
  - Key fallback: Triggered when key strength < `max_confidence` threshold
  - Can call fallback for BPM only, key only, both, or neither
  - **Per-worker fallback calls**: Each worker task calls fallback service independently when needed
- **Fallback Safety Controls**: Circuit breaker + retries to avoid cascading failures
- **Configurable Confidence Threshold**: `max_confidence` parameter (default 0.65) controls when fallback is triggered
- **Configurable Debug Output**: `debug_level` parameter (`minimal`, `normal`, `detailed`) controls debug information verbosity
- **Musical Key Detection**: Multiple Essentia key profile types with automatic selection of best result
- **Normalized Confidence Scores**: All confidence values normalized to 0-1 range for consistent interpretation
- **Comprehensive Debug Information**: Detailed debug info including method comparisons, confidence analysis, error reporting, and telemetry
- **Telemetry**: Timing information for download, Essentia analysis, and fallback service calls
- **Separate Results**: Response includes both Essentia and Librosa results separately (Librosa fields are null if not used)
- **Private Cloud Run Service**: IAM authentication required for access
- **SSRF Protection**: HTTPS-only requirement with redirect validation
- **High Concurrency**: Worker service handles 200 parallel tasks (20 instances × 10 concurrency)
- **Real-time Results**: Results stream as they complete via NDJSON format
- **Partial Results (BPM-first)**: Optional early BPM-only results, followed by a final update with key/fallback fields
- **Persistent Storage**: Results stored in Firestore, can reconnect to stream anytime

## Architecture

The system uses an **async event-driven architecture** with three main components:

1. **Primary API Service** (`bpm-service`): Accepts batch requests, publishes to Pub/Sub, streams results
2. **Worker Service** (`bpm-worker`): Processes Pub/Sub messages, writes results to Firestore
3. **Pub/Sub + Firestore**: Message queue and persistent storage

### Primary Service (`bpm-service`)

- **Runtime**: Python 3 + FastAPI + Uvicorn
- **Container**: MTG Essentia base image (`ghcr.io/mtg/essentia:latest`) with ffmpeg for codec support
- **Performance Optimizations**:
  - Lazy loading of heavy libraries (essentia loads only when needed, reducing cold start time)
  - Pre-compiled Python bytecode (compiled during Docker build)
  - CPU boost enabled for faster startup
- **Deployment**: Google Cloud Run
  - **Resources**: 2GB RAM, 2 CPU, CPU boost enabled (reduces cold start time)
  - **Timeout**: 300 seconds
  - **Max Instances**: 10 (auto-scaling)
  - **Concurrency**: 80 concurrent requests per instance
- **Authentication**: Cloud Run IAM (Identity Tokens)
- **Endpoints**:
  - `POST /analyze/batch`: Submit batch, returns `batch_id` immediately
  - `GET /stream/{batch_id}`: Stream results as NDJSON (real-time)
  - `GET /batch/{batch_id}`: Get batch status and all results
- **Integration**: Publishes tasks to Pub/Sub, reads results from Firestore (no audio processing in this service)

### Worker Service (`bpm-worker`)

- **Runtime**: Python 3 + FastAPI + Uvicorn
- **Purpose**: Process individual URLs from Pub/Sub messages
- **Audio Processing**: Same as primary service (Essentia for BPM/key detection)
- **Container**: MTG Essentia base image (`ghcr.io/mtg/essentia:latest`) with ffmpeg
- **Deployment**: Google Cloud Run
  - **High Resources**: 4GB RAM, 4 CPU, CPU boost enabled
  - **Timeout**: 600 seconds (for individual URL processing)
  - **Max Instances**: 20 (auto-scaling)
  - **Concurrency**: 10 concurrent requests per instance (200 parallel tasks total)
- **Authentication**: Public endpoint (Pub/Sub push subscription)
- **Integration**: 
  - Receives Pub/Sub push messages via `/pubsub/process`
  - Writes results to Firestore as they complete
  - Calls fallback service when needed (per item)
  - Sends pre-decoded PCM (`.npy`) to fallback when available to reduce duplicate decoding

### Pub/Sub & Firestore

- **Pub/Sub Topic**: `bpm-analysis-tasks` - Queues individual URL processing tasks
- **Pub/Sub Subscription**: `bpm-analysis-worker-sub` - Push subscription to worker service
- **Firestore Collection**: `batches/{batch_id}` - Stores batch status and results
- **Message Format**: `{batch_id, url, index, max_confidence, debug_level}`

### Fallback Service (`bpm-fallback-service`)

- **Runtime**: Python 3 + FastAPI + Uvicorn
- **Audio Processing**: Librosa (HPSS, beat tracking, chroma features)
  - Accepts either uploaded audio files (streamed to `/tmp`) or pre-decoded PCM (`.npy`)
  - Uses Essentia MonoLoader when available for fast decoding before Librosa
- **BPM Method**: Harmonic-Percussive Source Separation (HPSS) with percussive component beat tracking
- **Key Method**: Krumhansl-Schmuckler algorithm on harmonic component (improved with chroma_cqt and low-energy frame dropping)
- **Container**: Python 3.11-slim with librosa, numpy, scipy, ffmpeg
- **Deployment**: Google Cloud Run
  - **Low Concurrency**: 2 concurrent requests per instance (librosa is CPU-heavy)
  - **Higher Resources**: 4GB RAM, 2 CPU, CPU boost enabled
  - **Timeout**: 300 seconds (for batch processing)
  - **Max Instances**: 10 (auto-scaling)
  - **Total Capacity**: 20 concurrent fallback requests (10 instances × 2 concurrency)
- **Performance Optimizations**:
  - Lazy loading of heavy libraries (librosa and numpy load only when needed, reducing cold start time)
  - Pre-compiled Python bytecode (compiled during Docker build)
  - CPU boost enabled for faster startup
- **Authentication**: Cloud Run IAM (service-to-service authentication)
- **Use Case**: High-accuracy, high-cost fallback for low-confidence primary results
- **Confidence Calculation**: Uses beat interval consistency (coefficient of variation) to calculate confidence (0.0-1.0 range, no artificial caps)
- **Call Pattern**: Each worker task calls fallback service independently when Essentia confidence is below threshold

## Prerequisites

- Google Cloud SDK (`gcloud`) installed and authenticated
- A GCP project with billing enabled
- **Owner or Editor role** on the GCP project, OR the following IAM roles:
  - `roles/cloudbuild.builds.editor` (Cloud Build Editor)
  - `roles/artifactregistry.writer` (Artifact Registry Writer)
  - `roles/run.admin` (Cloud Run Admin)
  - `roles/iam.serviceAccountUser` (Service Account User)
  - `roles/iam.serviceAccountAdmin` (Service Account Admin) - for creating service accounts

## Configuration

### Primary Service Configuration

Before deployment, configure the following variables in `deploy.sh` or set them as environment variables:

- `PROJECT_ID`: Your GCP project ID (default: `bpm-api-microservice`)
- `REGION`: Cloud Run region (default: `europe-west3`)
- `SERVICE_NAME`: Cloud Run service name (default: `bpm-service`)
- `ARTIFACT_REPO`: Artifact Registry repository name (default: `bpm-repo`)
- `SERVICE_ACCOUNT`: Service account name for external callers (default: `vercel-bpm-invoker`)

### Fallback Service Configuration

The fallback service configuration is in `deploy_fallback.sh`:

- `PROJECT_ID`: Your GCP project ID (same as primary service)
- `REGION`: Cloud Run region (default: `europe-west3`)
- `SERVICE_NAME`: Fallback service name (default: `bpm-fallback-service`)

### Worker Service Configuration

Worker behavior can be tuned via environment variables:

- `STREAM_PARTIAL_BPM_ONLY`: When `true` (default), workers emit a partial result after BPM is ready and update later with key/fallback fields.
- `ARTIFACT_REPO`: Artifact Registry repository name (default: `bpm-repo`)
- `ESSENTIA_MAX_CONCURRENCY`: Max thread pool workers for Essentia analysis (defaults to CPU count)

### Primary Service Fallback Settings

Fallback configuration shared by the worker and primary services is in `shared_processing.py`:

- `FALLBACK_SERVICE_URL`: URL of the fallback service (must be updated after fallback deployment)
- `FALLBACK_SERVICE_AUDIENCE`: OIDC audience for service-to-service authentication (same as `FALLBACK_SERVICE_URL`)
- `FALLBACK_REQUEST_TIMEOUT_COLD_START`: First-attempt timeout (seconds)
- `FALLBACK_REQUEST_TIMEOUT_WARM`: Subsequent-attempt timeout (seconds)
- `FALLBACK_MAX_RETRIES`: Maximum fallback retry attempts
- `FALLBACK_RETRY_DELAY`: Base retry delay (seconds)
- `FALLBACK_FAILURE_THRESHOLD`: Consecutive failures before circuit opens
- `FALLBACK_RECOVERY_TIMEOUT`: Seconds before half-open retry is allowed

**Note**: The confidence threshold is now configurable per-request via the `max_confidence` parameter (default: 0.65). This allows clients to control when fallback is triggered.

**Important**: After deploying the fallback service, update `FALLBACK_SERVICE_URL` and `FALLBACK_SERVICE_AUDIENCE` in `shared_processing.py`, then redeploy the primary and worker services.

## One-Time Setup

### 0. Grant Required IAM Permissions (if needed)

If you're not a project Owner/Editor, grant yourself the required roles:

```bash
# Set your project ID
PROJECT_ID="your-project-id"

# Get your email
YOUR_EMAIL=$(gcloud config get-value account)

# Grant Cloud Build Editor
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
    --member="user:${YOUR_EMAIL}" \
    --role="roles/cloudbuild.builds.editor"

# Grant Artifact Registry Writer
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
    --member="user:${YOUR_EMAIL}" \
    --role="roles/artifactregistry.writer"

# Grant Cloud Run Admin
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
    --member="user:${YOUR_EMAIL}" \
    --role="roles/run.admin"

# Grant Service Account User
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
    --member="user:${YOUR_EMAIL}" \
    --role="roles/iam.serviceAccountUser"

# Grant Service Account Admin (to create service accounts)
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
    --member="user:${YOUR_EMAIL}" \
    --role="roles/iam.serviceAccountAdmin"
```

**Note**: If you don't have permission to grant yourself these roles, ask a project Owner/Editor to grant them.

### 1. Enable Required APIs

```bash
PROJECT_ID="your-project-id"
REGION="your-region"  # e.g., europe-west3, us-central1

gcloud services enable \
    run.googleapis.com \
    cloudbuild.googleapis.com \
    artifactregistry.googleapis.com \
    pubsub.googleapis.com \
    firestore.googleapis.com \
    --project=${PROJECT_ID}
```

### 2. Create Artifact Registry Repository

```bash
PROJECT_ID="your-project-id"
REGION="your-region"
ARTIFACT_REPO="bpm-repo"

gcloud artifacts repositories create ${ARTIFACT_REPO} \
    --repository-format=docker \
    --location=${REGION} \
    --description="BPM service Docker images" \
    --project=${PROJECT_ID}
```

### 3. Create Service Account for External Callers

```bash
PROJECT_ID="your-project-id"
SERVICE_ACCOUNT="bpm-invoker"  # Change to your preferred name

# Create service account
gcloud iam service-accounts create ${SERVICE_ACCOUNT} \
    --display-name="BPM Service Invoker" \
    --project=${PROJECT_ID}
```

The `deploy.sh` script will automatically grant the `roles/run.invoker` permission to this service account after deployment.

### 4. Download Service Account Key

```bash
PROJECT_ID="your-project-id"
SERVICE_ACCOUNT="bpm-invoker"

# Create and download service account key
gcloud iam service-accounts keys create ${SERVICE_ACCOUNT}-key.json \
    --iam-account=${SERVICE_ACCOUNT}@${PROJECT_ID}.iam.gserviceaccount.com \
    --project=${PROJECT_ID}
```

**Security Note**: Store this JSON key securely. You'll need it to authenticate external applications calling the service.

## Deployment

### Deploy Primary Service

To deploy the primary BPM service to Google Cloud Run:

```bash
# Set your project ID
export PROJECT_ID="your-project-id"

# Deploy with default region (europe-west3)
./deploy.sh

# Or override region
REGION=us-central1 ./deploy.sh
```

**Note**: Make sure you've completed the [One-Time Setup](#one-time-setup) steps before deploying.

The `deploy.sh` script will:
1. Build the Docker image using Cloud Build (with bytecode compilation and optimizations)
2. Push to Artifact Registry
3. Deploy to Cloud Run **without public access** (`--no-allow-unauthenticated`) with CPU boost enabled
4. Create/verify the service account
5. Grant `roles/run.invoker` permission to the service account

### Deploy Worker Service

**IMPORTANT**: Deploy the worker service **before** deploying the primary service, as the primary service publishes to Pub/Sub.

```bash
# Set your project ID
export PROJECT_ID="your-project-id"

# Deploy worker service
./deploy_worker.sh

# Or override region
REGION=us-central1 ./deploy_worker.sh
```

The `deploy_worker.sh` script will:
1. Enable Pub/Sub and Firestore APIs
2. Create Pub/Sub topic `bpm-analysis-tasks`
3. Build the Docker image using Cloud Build (with bytecode compilation and optimizations)
4. Push to Artifact Registry
5. Deploy to Cloud Run **with public access** (required for Pub/Sub push)
6. Create Pub/Sub push subscription pointing to worker service
7. Grant Pub/Sub service account permission to invoke worker

### Deploy Fallback Service

To deploy the high-accuracy fallback service:

```bash
# Set your project ID (same as primary service)
export PROJECT_ID="your-project-id"

# Deploy fallback service
./deploy_fallback.sh

# Or override region
REGION=us-central1 ./deploy_fallback.sh
```

The `deploy_fallback.sh` script will:
1. Build the Docker image using Cloud Build (with bytecode compilation and optimizations)
2. Push to Artifact Registry
3. Deploy to Cloud Run **without public access** with higher resources (4GB RAM, 2 CPU, CPU boost)
4. Configure service-to-service authentication for primary service calls

**Important**: The worker service must be able to authenticate to the fallback service. The worker service uses its default Cloud Run service account to generate OIDC tokens for calling the fallback service.

### Get Service URL

After deployment, get the service URL:

```bash
PROJECT_ID="your-project-id"
REGION="your-region"
SERVICE_NAME="bpm-service"

gcloud run services describe ${SERVICE_NAME} \
    --region=${REGION} \
    --format="value(status.url)" \
    --project=${PROJECT_ID}
```

## Testing

### Using the Test Script

A test script is provided for easy testing of the async streaming architecture:

```bash
# Test with default settings (max_confidence=0.65, debug_level=normal)
./test_api.sh

# Test with custom max_confidence
./test_api.sh 0.75

# Test with custom max_confidence and debug_level
./test_api.sh 0.75 detailed
```

The test script will:
1. Submit batch via `POST /analyze/batch` and get `batch_id` immediately
2. Stream results via `GET /stream/{batch_id}` (NDJSON format)
3. Display results as they arrive in real-time
4. Check final status via `GET /batch/{batch_id}`

**Expected Flow:**
1. Batch submission returns `batch_id` in <500ms
2. First partial result arrives in 5-10 seconds (BPM-only if enabled)
3. Final results stream as key/fallback completes
4. Final "complete" message when all URLs are processed

**Streaming Results Format (NDJSON):**
- `{"type":"status","status":"processing","total":5,"processed":0}`
- `{"type":"result","index":0,"status":"partial","bpm_essentia":128,"key_essentia":null,...}`
- `{"type":"result","index":0,"status":"final","bpm_essentia":128,"key_essentia":"C",...}`
- `{"type":"progress","processed":2,"total":5}`
- `{"type":"complete","batch_id":"...","total":5}`

**Reconnect to Stream:**
You can reconnect to a stream anytime using the batch_id:
```bash
curl -s -N -H "Authorization: Bearer $TOKEN" \
  "${SERVICE_URL}/stream/${BATCH_ID}"
```

**Optional Debug Scripts:**

For debugging purposes, optional test scripts are available:
- `test_fallback_direct.sh`: Test the fallback service directly (requires manual configuration)
- `test_fallback_auth.sh`: Test fallback service authentication (requires manual configuration)

### Test Health Endpoint

```bash
# Get identity token
TOKEN=$(gcloud auth print-identity-token)

# Replace with your actual service URL
SERVICE_URL="https://your-service-url.run.app"

# Test health endpoint
curl -H "Authorization: Bearer $TOKEN" "${SERVICE_URL}/health"
```

Expected response:
```json
{"ok": true}
```

### Test Async Streaming Endpoint

**Submit Batch and Stream Results**

```bash
# Get identity token
TOKEN=$(gcloud auth print-identity-token)

# Replace with your actual service URL
SERVICE_URL="https://your-service-url.run.app"

# Step 1: Submit batch
RESPONSE=$(curl -s -X POST \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "urls": [
        "https://audio-ssl.itunes.apple.com/...",
        "https://audio-ssl.itunes.apple.com/...",
        "https://audio-ssl.itunes.apple.com/..."
      ],
      "max_confidence": 0.65,
      "debug_level": "normal",
      "fallback_override": "always"
    }' \
    "${SERVICE_URL}/analyze/batch")

# Extract batch_id
BATCH_ID=$(echo "$RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin)['batch_id'])")

echo "Batch ID: $BATCH_ID"
echo "Response: $RESPONSE" | python3 -m json.tool

# Step 2: Stream results (NDJSON)
curl -s -N -X GET "${SERVICE_URL}/stream/${BATCH_ID}" \
    -H "Authorization: Bearer $TOKEN" | while IFS= read -r line; do
    if [ -n "$line" ]; then
        echo "$line" | python3 -m json.tool
    fi
done
```

Expected response format (NDJSON stream):
```json
[
  {
    "bpm_essentia": 128,
    "bpm_raw_essentia": 128.0,
    "bpm_confidence_essentia": 0.77,
    "bpm_librosa": null,
    "bpm_raw_librosa": null,
    "bpm_confidence_librosa": null,
    "key_essentia": "C",
    "scale_essentia": "major",
    "keyscale_confidence_essentia": 0.86,
    "key_librosa": null,
    "scale_librosa": null,
    "keyscale_confidence_librosa": null,
    "debug_txt": "URL fetch: SUCCESS (https://audio-ssl.itunes.apple.com/...)\nMax confidence threshold: 0.65\n=== Analysis (Essentia) ===\nAudio loaded: 30.0s\nBPM=128.0 (normalized=128.0)\nConfidence: raw=4.10 (range: 0-5.32), normalized=0.77 (0-1), quality=excellent\nBPM confidence (0.770) >= threshold (0.65) - using Essentia result\nKey strength (0.859) >= threshold (0.65) - using Essentia result\n=== Telemetry ===\nDownload: 1.23s, Essentia analysis: 2.45s"
  },
  {
    "bpm_essentia": 130,
    "bpm_raw_essentia": 130.0,
    "bpm_confidence_essentia": 0.47,
    "bpm_librosa": 130,
    "bpm_raw_librosa": 130.0,
    "bpm_confidence_librosa": 0.82,
    "key_essentia": "C",
    "scale_essentia": "major",
    "keyscale_confidence_essentia": 0.86,
    "key_librosa": null,
    "scale_librosa": null,
    "keyscale_confidence_librosa": null,
    "debug_txt": "URL fetch: SUCCESS (...)\nMax confidence threshold: 0.65\n=== Analysis (Essentia) ===\nAudio loaded: 30.0s\nBPM=130.0 (normalized=130.0)\nConfidence: raw=2.50 (range: 0-5.32), normalized=0.47 (0-1), quality=moderate\nBPM confidence (0.470) < threshold (0.65) - fallback needed\n=== Fallback Service ===\nFallback needed: BPM=True, Key=False\nAuth token generated: Yes (Bearer token present)\nCalling fallback service: https://bpm-fallback-service-340051416180.europe-west3.run.app/process_batch\nFallback service response: HTTP 200\nFallback results received: 1 items\nProcessing fallback result 0: bpm_normalized=130.0, bpm_raw=130.0, confidence=0.82\nFallback BPM: 130.0 (confidence=0.820)\n=== Telemetry ===\nDownload: 1.15s, Essentia analysis: 2.38s, Fallback service: 3.21s"
  }
]
```

### Test with Service Account

To test authentication from an external application:

```bash
# Authenticate as service account
gcloud auth activate-service-account \
    your-service-account@your-project.iam.gserviceaccount.com \
    --key-file=your-service-account-key.json

# Get identity token (audience is the service URL)
SERVICE_URL="https://your-service-url.run.app"
TOKEN=$(gcloud auth print-identity-token --audience="${SERVICE_URL}")

# Test endpoint
curl -H "Authorization: Bearer $TOKEN" "${SERVICE_URL}/health"
```

## API Endpoints

### `GET /health`

Health check endpoint.

**Response:**
```json
{"ok": true}
```

### `POST /analyze/batch`

Submit batch for async processing: publishes tasks to Pub/Sub and returns `batch_id` immediately.

**Request Body:**
```json
{
  "urls": [
    "https://audio-ssl.itunes.apple.com/...",
    "https://audio-ssl.itunes.apple.com/...",
    "https://audio-ssl.itunes.apple.com/..."
  ],
  "max_confidence": 0.65,
  "debug_level": "normal",
  "fallback_override": "bpm_only"
}
```

**Request Parameters:**
- `urls` (required): Array of HTTPS URLs to audio preview files (minimum 1 URL)
- `max_confidence` (optional, default: 0.65): Confidence threshold (0.0-1.0) below which the fallback service is called. If Essentia's confidence is above this threshold, the primary service result is used.
- `debug_level` (optional, default: "normal"): Controls debug output verbosity:
  - `"minimal"`: Only errors and final results
  - `"normal"`: All debug info + telemetry summary (default)
  - `"detailed"`: Full debug info + detailed timing with timestamps
- `fallback_override` (optional, default: `null`): Overrides the default fallback logic.
  - `"never"`: Never use the fallback service, even if confidence is below threshold.
  - `"always"`: Always use the fallback service for both BPM and key (but run Essentia first).
  - `"bpm_only"`: Force BPM fallback; key fallback still follows the confidence threshold (but run Essentia first).
  - `"key_only"`: Force key fallback; BPM fallback still follows the confidence threshold (but run Essentia first).
  - `"fallback_only"`: Skip Essentia entirely, use ONLY fallback for both BPM and key.
  - `"fallback_only_bpm"`: Skip Essentia BPM, use ONLY fallback for BPM (but run Essentia for key).
  - `"fallback_only_key"`: Skip Essentia key, use ONLY fallback for key (but run Essentia for BPM).

**Response:**
Returns immediately with batch submission details:

```json
{
  "batch_id": "123e4567-e89b-12d3-a456-426614174000",
  "total_urls": 5,
  "status": "processing",
  "stream_url": "/stream/123e4567-e89b-12d3-a456-426614174000"
}
```

**Processing:**
- Tasks are published to Pub/Sub immediately
- Worker service processes URLs asynchronously
- Results are written to Firestore as they complete
- Use `/stream/{batch_id}` to receive results in real-time

### `GET /stream/{batch_id}`

Stream batch results as NDJSON (Newline Delimited JSON). Polls Firestore every 500ms and yields results as they become available.

**Response:** Streaming NDJSON with the following message types:

**Status Message:**
```json
{"type":"status","status":"processing","total":5,"processed":2}
```

**Result Message:**
```json
{
  "type": "result",
  "index": 0,
  "status": "final",
  "url": "https://...",
  "bpm_essentia": 128,
  "bpm_raw_essentia": 128.0,
  "bpm_confidence_essentia": 0.77,
  "bpm_librosa": null,
  "bpm_raw_librosa": null,
  "bpm_confidence_librosa": null,
  "key_essentia": "C",
  "scale_essentia": "major",
  "keyscale_confidence_essentia": 0.86,
  "key_librosa": null,
  "scale_librosa": null,
  "keyscale_confidence_librosa": null,
  "debug_txt": "..."
}
```

**Progress Message:**
```json
{"type":"progress","processed":3,"total":5}
```

**Complete Message:**
```json
{"type":"complete","batch_id":"...","total":5}
```

**Error Message:**
```json
{"type":"error","message":"Batch not found"}
```

**Usage:**
- Connect to stream endpoint and read NDJSON lines
- Partial results may arrive before final results for the same index
- Results arrive as they complete (typically 5-10s for first result)
- Stream closes when batch is complete
- Can reconnect anytime using the same `batch_id`

### `GET /batch/{batch_id}`

Get batch status and all results from Firestore.

**Response:**
```json
{
  "batch_id": "123e4567-e89b-12d3-a456-426614174000",
  "status": "completed",
  "total_urls": 5,
  "processed": 5,
  "results": {
    "0": {
      "index": 0,
      "url": "https://...",
      "bpm_essentia": 128,
      ...
    },
    "1": { ... },
    ...
  }
}
```

**Status Values:**
- `"processing"`: Batch is still being processed
- `"completed"`: All URLs have been processed

### Legacy Response Format

For reference, the old synchronous response format (array of results):

```json
[
  {
    "bpm_essentia": 128,
    "bpm_raw_essentia": 128.0,
    "bpm_confidence_essentia": 0.77,
    "bpm_librosa": null,
    "bpm_raw_librosa": null,
    "bpm_confidence_librosa": null,
    "key_essentia": "C",
    "scale_essentia": "major",
    "keyscale_confidence_essentia": 0.86,
    "key_librosa": null,
    "scale_librosa": null,
    "keyscale_confidence_librosa": null,
    "debug_txt": "URL fetch: SUCCESS (https://audio-ssl.itunes.apple.com/...)\nMax confidence threshold: 0.65\n=== Analysis (Essentia) ===\nAudio loaded: 30.0s\nBPM=128.0 (normalized=128.0)\nConfidence: raw=4.10 (range: 0-5.32), normalized=0.77 (0-1), quality=excellent\nBPM confidence (0.770) >= threshold (0.65) - using Essentia result\nKey strength (0.859) >= threshold (0.65) - using Essentia result\n=== Telemetry ===\nDownload: 1.23s, Essentia analysis: 2.45s"
  },
  {
    "bpm_essentia": 130,
    "bpm_raw_essentia": 130.0,
    "bpm_confidence_essentia": 0.47,
    "bpm_librosa": 130,
    "bpm_raw_librosa": 130.0,
    "bpm_confidence_librosa": 0.82,
    "key_essentia": "C",
    "scale_essentia": "major",
    "keyscale_confidence_essentia": 0.86,
    "key_librosa": null,
    "scale_librosa": null,
    "keyscale_confidence_librosa": null,
    "debug_txt": "URL fetch: SUCCESS (...)\nMax confidence threshold: 0.65\n=== Analysis (Essentia) ===\nAudio loaded: 30.0s\nBPM=130.0 (normalized=130.0)\nConfidence: raw=2.50 (range: 0-5.32), normalized=0.47 (0-1), quality=moderate\nBPM confidence (0.470) < threshold (0.65) - fallback needed\n=== Fallback Service ===\nFallback needed: BPM=True, Key=False\nAuth token generated: Yes (Bearer token present)\nCalling fallback service: https://bpm-fallback-service-340051416180.europe-west3.run.app/process_batch\nFallback service response: HTTP 200\nFallback results received: 1 items\nProcessing fallback result 0: bpm_normalized=130.0, bpm_raw=130.0, confidence=0.82\nFallback BPM: 130.0 (confidence=0.820)\n=== Telemetry ===\nDownload: 1.15s, Essentia analysis: 2.38s, Fallback service: 3.21s"
  }
]
```

**Field Descriptions:**

**Essentia BPM Results:**
- `bpm_essentia`: Normalized BPM from Essentia (integer, rounded). Only extreme outliers are corrected:
  - If raw BPM < 40: multiplied by 2
  - If raw BPM > 220: divided by 2
  - Otherwise: returned unchanged
- `bpm_raw_essentia`: Raw BPM value from Essentia (before normalization, rounded to 2 decimal places)
- `bpm_confidence_essentia`: BPM confidence score from Essentia (0.0-1.0, rounded to 2 decimal places). Normalized from Essentia's raw confidence values (0-5.32 range). Higher value indicates more reliable BPM detection.

**Librosa BPM Results (null if fallback not used):**
- `bpm_librosa`: Normalized BPM from Librosa fallback service (integer, rounded, null if not used)
- `bpm_raw_librosa`: Raw BPM value from Librosa fallback service (rounded to 2 decimal places, null if not used)
- `bpm_confidence_librosa`: BPM confidence score from Librosa fallback service (0.0-1.0, rounded to 2 decimal places, null if not used)

**Essentia Key Results:**
- `key_essentia`: Detected musical key from Essentia (e.g., "C", "D", "E", "F", "G", "A", "B")
- `scale_essentia`: Detected scale from Essentia ("major" or "minor")
- `keyscale_confidence_essentia`: Key detection confidence score from Essentia (0.0-1.0, rounded to 2 decimal places). Higher value indicates more reliable key detection.

**Librosa Key Results (null if fallback not used):**
- `key_librosa`: Detected musical key from Librosa fallback service (null if not used)
- `scale_librosa`: Detected scale from Librosa fallback service (null if not used)
- `keyscale_confidence_librosa`: Key detection confidence score from Librosa fallback service (0.0-1.0, rounded to 2 decimal places, null if not used)

**Debug Information:**
- `debug_txt`: Comprehensive debug information string (format depends on `debug_level` parameter):
  - **minimal**: Only errors and final results
  - **normal**: All debug info + telemetry summary (download time, Essentia analysis time, fallback service time if used)
  - **detailed**: Full debug info + detailed timing with timestamps
  - Includes: URL fetch status, audio loading status, BPM and key analysis details, fallback service status (if triggered), error messages (if any), and telemetry

**Response Interpretation:**
- **Essentia fields** (`bpm_essentia`, `key_essentia`, etc.): Always populated from the worker's Essentia analysis
- **Librosa fields** (`bpm_librosa`, `key_librosa`, etc.): Only populated when fallback service was called (null otherwise)
- **Partial vs Final**: When `status` is `partial`, key fields may be null until the final update for that index
- **When to use which result**: 
  - If `bpm_librosa` is not null, the fallback service provided a higher-confidence BPM result (use `bpm_librosa` for BPM)
  - If `key_librosa` is not null, the fallback service provided a higher-confidence key result (use `key_librosa` for key)
  - If Librosa fields are null, Essentia results met the confidence threshold and should be used

**Processing Behavior:**
- URLs are processed **concurrently** by independent worker tasks via Pub/Sub
- Audio is analyzed for **first 35 seconds only** (latency/cost optimization)
- Each worker task calls fallback service independently when Essentia confidence is below threshold
- When partial streaming is enabled, workers emit BPM-only results early and update the same index with a final result
- Results are written to Firestore as they complete and streamed to clients in real-time

**Performance Recommendations:**
- **Recommended max batch size: 20 songs** for optimal performance and reliability
- **For batches over 20 songs**: Use `/stream/{batch_id}` and fall back to `/batch/{batch_id}` if the stream expires (10-minute cap)

**Error Responses:**
- `400`: Invalid URL, non-HTTPS URL, file too large, redirect to non-HTTPS URL, or empty URLs array
- `500`: Processing error (download, analysis, or fallback service failed)
- `504`: Gateway timeout (may occur with very large batches exceeding 300 seconds)

## Batch Processing Best Practices

### Recommended Batch Sizes

- **Optimal batch size: ≤20 songs** for fast results and lower tail latency
- Larger batches are supported, but expect longer stream duration and more fallback load

### Large Batch Processing (20+ songs)

For larger batches, rely on the existing async flow:

1. **Submit batch** with `POST /analyze/batch` (returns `batch_id` immediately)
2. **Stream results** via `GET /stream/{batch_id}` (real-time)
3. **Poll results** via `GET /batch/{batch_id}` if the stream times out (stream max is 10 minutes)

This avoids HTTP request timeouts while still providing incremental results.

## SSRF Protection

The service implements SSRF protection through:

- Only `https://` URLs allowed
- Redirect validation (ensures redirects stay on HTTPS)
- Download limits:
  - Connect timeout: 5 seconds
  - Total timeout: 20 seconds
  - Max file size: 10MB

**Note**: Host/domain restrictions are handled through authentication. Only authenticated callers can access the service.

## Using the API from External Applications

Since the Cloud Run service is private (requires authentication), external applications must authenticate using Google Cloud Identity Tokens. The general process is:

1. **Obtain a service account key** from your GCP project
2. **Mint an Identity Token** with the Cloud Run service URL as the audience
3. **Send the token** in the `Authorization: Bearer` header

### Example: Vercel Serverless Function (Node.js)

This example shows how to call the BPM service from a Vercel serverless function:

```javascript
const { GoogleAuth } = require('google-auth-library');

export default async function handler(req, res) {
  // Get service account credentials from Vercel env var
  const serviceAccountKey = JSON.parse(
    process.env.GCP_SERVICE_ACCOUNT_KEY
  );
  
  // Cloud Run service URL
  const cloudRunUrl = process.env.BPM_SERVICE_URL;
  
  // Create auth client
  const auth = new GoogleAuth({
    credentials: serviceAccountKey,
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  
  // Get identity token with Cloud Run URL as audience
  const client = await auth.getIdTokenClient(cloudRunUrl);
  const idToken = await client.idTokenProvider.fetchIdToken(cloudRunUrl);
  
  // Call Cloud Run service (batch endpoint)
  const response = await fetch(`${cloudRunUrl}/analyze/batch`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      urls: req.body.urls, // Array of preview URLs from your frontend
      max_confidence: req.body.max_confidence || 0.65,
      debug_level: req.body.debug_level || "normal",
    }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    return res.status(response.status).json({ error });
  }
  
  const data = await response.json();
  return res.status(200).json(data);
}
```

**Vercel Environment Variables:**
- `GCP_SERVICE_ACCOUNT_KEY`: Full JSON content of your service account key file
- `BPM_SERVICE_URL`: Your Cloud Run service URL

### Example: Python Application

```python
from google.auth.transport.requests import Request
from google.oauth2 import id_token
import json
import os
import requests

# Load service account key from env var
service_account_info = json.loads(os.environ['GCP_SERVICE_ACCOUNT_KEY'])
cloud_run_url = os.environ['BPM_SERVICE_URL']

# Create credentials
from google.oauth2 import service_account
credentials = service_account.Credentials.from_service_account_info(
    service_account_info,
    scopes=['https://www.googleapis.com/auth/cloud-platform']
)

# Get ID token with audience
request = Request()
id_token_obj = id_token.fetch_id_token(request, cloud_run_url)

# Call Cloud Run service (batch endpoint)
response = requests.post(
    f"{cloud_run_url}/analyze/batch",
    headers={
        "Authorization": f"Bearer {id_token_obj}",
        "Content-Type": "application/json",
    },
    json={
        "urls": preview_urls,  # List of URLs
        "max_confidence": 0.65,
        "debug_level": "normal"
    }
)

data = response.json()  # Returns list of BPMResponse objects
```

### Example: Other Platforms

The same pattern applies to any platform:

1. Store the service account JSON key securely (environment variables, secrets manager, etc.)
2. Use the Google Auth library for your language to mint an Identity Token
3. Set the audience to your Cloud Run service URL
4. Include the token in the `Authorization: Bearer` header

## Local Development

### Prerequisites

- Python 3.9+
- Docker (for testing container)
- Essentia and ffmpeg (if running locally without Docker)

### Run Locally (without Docker)

```bash
# Install dependencies
pip install -r requirements.txt

# Note: You'll need Essentia Python bindings installed
# This is complex, so Docker is recommended for local testing

# Run server
uvicorn main:app --host 0.0.0.0 --port 8080
```

### Run with Docker

```bash
# Build image
docker build -t bpm-service .

# Run container
docker run -p 8080:8080 bpm-service

# Test
curl http://localhost:8080/health
```

## Performance Optimizations

The services implement several optimizations to reduce cold start time and improve performance:

### Cold Start Optimizations

1. **Lazy Loading**: Heavy libraries (essentia, librosa, numpy) are imported only when actually needed:
   - `essentia.standard` loads only when `analyze_audio()` is called (primary service)
   - `librosa` and `numpy` load only when `process_single_audio()` is called (fallback service)
   - This significantly reduces cold start time by avoiding expensive imports at module load time

2. **Bytecode Compilation**: Python code is pre-compiled to `.pyc` files during Docker build:
   - Reduces first-request compilation overhead
   - Faster module loading on cold starts

3. **CPU Boost**: Both services use Cloud Run's CPU boost feature:
   - Allocates more CPU during container startup
   - Reduces cold start initialization time

### Runtime Optimizations

1. **Worker Parallelism**: Cloud Run concurrency + `ESSENTIA_MAX_CONCURRENCY` (thread pool) controls CPU-bound analysis throughput

2. **Efficient File I/O**: Uses `aiofiles` for async file operations with internal buffering (no manual buffering needed)

3. **Connection Pooling**: HTTP client with connection pooling for efficient reuse across requests

## Processing Pipeline

### Worker Service Flow (Batch Processing)

1. **Download**: Fetch each audio URL and stream to `/tmp`
   - SSRF protection: HTTPS-only, redirect validation
   - Max file size: 10MB per file
2. **Essentia Analysis**: Load audio once and compute BPM + key
   - `RhythmExtractor2013(method="multifeature")` for BPM
   - `KeyExtractor` with multiple profiles (temperley, krumhansl, edma, edmm)
   - Duration cap: first 35 seconds only
3. **Partial Result (optional)**: If `STREAM_PARTIAL_BPM_ONLY=true`, emit a BPM-only partial result early
4. **Selective Fallback**:
   - If BPM or key confidence < `max_confidence`, call fallback for that field
   - Worker sends pre-decoded PCM (`.npy`) when available, otherwise the original file
   - Circuit breaker can skip fallback if the service is unhealthy
   - `fallback_override` can force BPM or key fallback regardless of confidence
5. **Write Results**: Persist to Firestore; stream updates via `/stream/{batch_id}`
6. **Cleanup**: Delete temp files

### Fallback Service Flow (Batch Processing)

1. **Receive**: Batch request with audio files or PCM (`.npy`) payloads (multipart upload)

2. **Process Concurrently** (librosa is CPU-heavy, limited concurrency):
   - For each file:
     - **Load**:
       - For audio files: stream to `/tmp`, decode via Essentia MonoLoader when available (fallback to librosa)
       - For PCM payloads: load `.npy` bytes directly
     - **HPSS**: Apply Harmonic-Percussive Source Separation:
       - **Percussive component**: Used for BPM detection (if requested)
       - **Harmonic component**: Used for key detection (if requested)
     - **BPM Extraction** (if `process_bpm=True`):
       - Use `librosa.beat.beat_track()` on percussive component
       - Calculate confidence from beat consistency (0.0-1.0 range)
     - **Key Extraction** (if `process_key=True`):
       - Use `librosa.feature.chroma_cqt()` on harmonic component (improved stability)
       - Apply Krumhansl-Schmuckler algorithm with low-energy frame dropping
     - **Per-Item Error Handling**: If one file fails, return empty response for that item, continue with others

3. **Return**: Array of `FallbackResponse` objects (one per input file, maintains order)

## Algorithms and Confidence Ranges

### Primary Service (Essentia)

**BPM Extraction:**
- **RhythmExtractor2013(method="multifeature")**: Confidence range 0-5.32, normalized by dividing by 5.32 (values > 5.32 clamped to 1.0)
  - Quality guidelines:
    - [0, 1): very low confidence
    - [1, 2): low confidence
    - [2, 3): moderate confidence
    - [3, 3.5): high confidence
    - (3.5, 5.32]: excellent confidence

**Key Detection:**
- **KeyExtractor**: Strength values (range varies by profile type). The service tries multiple profiles (temperley, krumhansl, edma, edmm) and selects the best result.

### Fallback Service (Librosa)

**BPM Extraction:**
- **librosa.beat.beat_track()**: No built-in confidence. Custom confidence calculated from beat consistency (coefficient of variation), 0.0-1.0 range.

**Key Detection:**
- **librosa.feature.chroma_cqt() + Krumhansl-Schmuckler**: Uses chroma_cqt for improved stability, drops low-energy frames, then applies Krumhansl-Schmuckler template matching. Correlation values (-1 to 1) normalized to 0-1 using `(corr + 1) / 2`.

## Confidence Normalization

The service normalizes confidence values from different algorithms to a consistent 0-1 range:

- **Essentia RhythmExtractor2013(method="multifeature")**: Confidence range 0-5.32, normalized by dividing by 5.32 (values > 5.32 clamped to 1.0)
  - Quality levels are determined from raw confidence before normalization
- **Essentia KeyExtractor**: Strength values (typically 0-1 range), used as-is if already 0-1, otherwise clamped to [0, 1]
- **Librosa beat_track**: Custom confidence calculation from beat consistency (already 0-1)
- **Krumhansl-Schmuckler**: Uses chroma_cqt for improved stability, drops low-energy frames, then correlates with key templates. Correlation values (-1 to 1) normalized to 0-1 using `(corr + 1) / 2`

## Security Notes

- Cloud Run IAM authentication (no public access)
- Service-to-service authentication for fallback calls (OIDC tokens)
- SSRF protection through HTTPS-only requirement and redirect validation
- Download size and timeout limits
- No audio persistence (temp files deleted immediately)
- Minimal logging (URLs with tokens are not logged)

## Troubleshooting

### "Permission denied" errors

Ensure the service account has `roles/run.invoker` permission:

```bash
PROJECT_ID="your-project-id"
REGION="your-region"
SERVICE_NAME="bpm-service"
SERVICE_ACCOUNT="your-service-account"

gcloud run services add-iam-policy-binding ${SERVICE_NAME} \
    --region=${REGION} \
    --member="serviceAccount:${SERVICE_ACCOUNT}@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/run.invoker" \
    --project=${PROJECT_ID}
```

### "Invalid URL" errors

Ensure the URL:
- Starts with `https://`
- Is a valid, accessible URL

### Audio format errors

The service supports common audio formats (MP3, M4A, AAC, etc.) that Essentia can decode directly. No ffmpeg conversion step is required - Essentia handles decoding natively.

### High memory usage

The primary service is configured with 2GB memory and high concurrency (80) for batch processing. For very large batches, consider increasing:

```bash
PROJECT_ID="your-project-id"
REGION="your-region"
SERVICE_NAME="bpm-service"

gcloud run services update ${SERVICE_NAME} \
    --region=${REGION} \
    --memory 4Gi \
    --concurrency 80 \
    --timeout 300s \
    --project=${PROJECT_ID}
```

The fallback service is already configured with 4GB memory, 2 CPU cores, and low concurrency (2) for CPU-heavy librosa processing.

### Batch processing performance

For optimal batch processing performance:

- **Primary Service**: High concurrency (80) allows processing many URLs concurrently
- **Fallback Service**: Low concurrency (2) prevents CPU overload from librosa
- **Timeout**: Both services use 300s timeout to handle large batches
- **Duration Cap**: Audio analysis is capped at 35 seconds to optimize latency and cost

### Fallback service not being called

If the fallback service is not being triggered when expected:

1. **Check `fallback_override` parameter**: If `fallback_override` is set to `"never"`, the fallback service will not be triggered regardless of confidence levels.
2. **Check confidence threshold**: The `max_confidence` parameter (default: 0.65) controls when fallback is triggered. Lower values trigger fallback more often.
3. **Verify fallback URL**: Ensure `FALLBACK_SERVICE_URL` in `shared_processing.py` matches the deployed fallback service URL
4. **Check authentication**: The worker service needs permission to call the fallback service. Ensure the worker's default Cloud Run service account has `roles/run.invoker` permission on the fallback service
5. **Check debug_txt**: The `debug_txt` field in the response will indicate if fallback was triggered and any errors encountered
6. **Circuit breaker**: If the fallback service is unhealthy, calls may be skipped until the breaker resets
7. **Per-worker fallback**: Each worker task independently calls fallback service when needed (not batched across workers)

### Fallback service authentication errors

If you see authentication errors when the fallback is triggered:

```bash
PROJECT_ID="your-project-id"
REGION="your-region"
WORKER_SERVICE="bpm-worker"
FALLBACK_SERVICE="bpm-fallback-service"

# Get the worker service's service account
WORKER_SA=$(gcloud run services describe ${WORKER_SERVICE} \
    --region=${REGION} \
    --format="value(spec.template.spec.serviceAccountName)" \
    --project=${PROJECT_ID})

# Grant invoker permission
gcloud run services add-iam-policy-binding ${FALLBACK_SERVICE} \
    --region=${REGION} \
    --member="serviceAccount:${WORKER_SA}" \
    --role="roles/run.invoker" \
    --project=${PROJECT_ID}
```

## License

GNU General Public License v3.0
