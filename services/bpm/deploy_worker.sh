#!/bin/bash
set -euo pipefail

# Configuration
PROJECT_ID="${PROJECT_ID:-delman-site}"
REGION="${REGION:-europe-west3}"
SERVICE_NAME="bpm-worker"
ARTIFACT_REPO="bpm-repo"
PUBSUB_TOPIC="bpm-analysis-tasks"
PUBSUB_SUBSCRIPTION="bpm-analysis-worker-sub"
PUBSUB_DEAD_LETTER_TOPIC="bpm-analysis-tasks-dlq"

# Image tag
IMAGE_TAG="${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REPO}/${SERVICE_NAME}:latest"

echo "🚀 Deploying BPM Worker Service to Cloud Run"
echo "Project: ${PROJECT_ID}"
echo "Region: ${REGION}"
echo "Service: ${SERVICE_NAME}"
echo ""

# Set GCP project
gcloud config set project "${PROJECT_ID}"

# Check if user has necessary permissions
echo "🔍 Checking permissions..."
CURRENT_USER=$(gcloud config get-value account)
if [ -z "${CURRENT_USER}" ]; then
    echo "❌ Error: No active gcloud account. Run 'gcloud auth login' first."
    exit 1
fi
echo "Authenticated as: ${CURRENT_USER}"
echo ""

# Enable required APIs
echo "📡 Enabling required APIs..."
gcloud services enable \
    pubsub.googleapis.com \
    firestore.googleapis.com \
    --project="${PROJECT_ID}" || true
echo ""

# Create Pub/Sub topic if it doesn't exist
echo "📨 Checking Pub/Sub topic..."
if ! gcloud pubsub topics describe "${PUBSUB_TOPIC}" \
    --project="${PROJECT_ID}" &>/dev/null; then
    echo "Creating Pub/Sub topic: ${PUBSUB_TOPIC}"
    gcloud pubsub topics create "${PUBSUB_TOPIC}" \
        --project="${PROJECT_ID}"
    echo "✅ Topic created successfully"
else
    echo "Topic already exists: ${PUBSUB_TOPIC}"
fi

# Create Dead Letter Topic if it doesn't exist
echo "📨 Checking Dead Letter Topic..."
if ! gcloud pubsub topics describe "${PUBSUB_DEAD_LETTER_TOPIC}" \
    --project="${PROJECT_ID}" &>/dev/null; then
    echo "Creating Dead Letter Topic: ${PUBSUB_DEAD_LETTER_TOPIC}"
    gcloud pubsub topics create "${PUBSUB_DEAD_LETTER_TOPIC}" \
        --project="${PROJECT_ID}"
    echo "✅ Dead Letter Topic created successfully"
else
    echo "Dead Letter Topic already exists: ${PUBSUB_DEAD_LETTER_TOPIC}"
fi
echo ""

# Check if Artifact Registry repository exists, create if not
echo "📦 Checking Artifact Registry repository..."
if ! gcloud artifacts repositories describe "${ARTIFACT_REPO}" \
    --location="${REGION}" \
    --project="${PROJECT_ID}" &>/dev/null; then
    echo "Creating Artifact Registry repository: ${ARTIFACT_REPO}"
    if ! gcloud artifacts repositories create "${ARTIFACT_REPO}" \
        --repository-format=docker \
        --location="${REGION}" \
        --description="BPM service Docker images" \
        --project="${PROJECT_ID}"; then
        echo ""
        echo "❌ Error: Failed to create Artifact Registry repository."
        echo "You may need to enable the Artifact Registry API:"
        echo "  gcloud services enable artifactregistry.googleapis.com --project=${PROJECT_ID}"
        exit 1
    fi
    echo "✅ Repository created successfully"
else
    echo "Repository already exists: ${ARTIFACT_REPO}"
fi
echo ""

# Build and push image using Cloud Build
# Use temporary build context to avoid mutating the repo
echo "📦 Building and pushing Docker image..."
TEMP_DIR=$(mktemp -d)
cp worker.py "${TEMP_DIR}/"
cp shared_processing.py "${TEMP_DIR}/"
cp requirements.txt "${TEMP_DIR}/requirements.txt"
cp Dockerfile.worker "${TEMP_DIR}/Dockerfile"

if ! gcloud builds submit \
    --tag "${IMAGE_TAG}" \
    --region "${REGION}" \
    "${TEMP_DIR}"; then
    rm -rf "${TEMP_DIR}"
    echo ""
    echo "❌ Error: Cloud Build failed. You may need additional permissions."
    echo ""
    echo "Required IAM roles:"
    echo "  - roles/cloudbuild.builds.editor (Cloud Build Editor)"
    echo "  - roles/artifactregistry.writer (Artifact Registry Writer)"
    echo "  - roles/iam.serviceAccountUser (Service Account User)"
    echo ""
    echo "To grant yourself these roles, run:"
    echo "  gcloud projects add-iam-policy-binding ${PROJECT_ID} \\"
    echo "    --member=\"user:${CURRENT_USER}\" \\"
    echo "    --role=\"roles/cloudbuild.builds.editor\""
    echo ""
    echo "  gcloud projects add-iam-policy-binding ${PROJECT_ID} \\"
    echo "    --member=\"user:${CURRENT_USER}\" \\"
    echo "    --role=\"roles/artifactregistry.writer\""
    echo ""
    echo "  gcloud projects add-iam-policy-binding ${PROJECT_ID} \\"
    echo "    --member=\"user:${CURRENT_USER}\" \\"
    echo "    --role=\"roles/iam.serviceAccountUser\""
    echo ""
    exit 1
fi

rm -rf "${TEMP_DIR}"
echo "✅ Image built and pushed successfully"
echo ""

# Deploy to Cloud Run (allow unauthenticated for Pub/Sub push)
# High resources for audio processing, high concurrency for parallel tasks
echo "🚢 Deploying to Cloud Run..."
if ! gcloud run deploy "${SERVICE_NAME}" \
    --image "${IMAGE_TAG}" \
    --region "${REGION}" \
    --platform managed \
    --no-allow-unauthenticated \
    --port 8080 \
    --memory 4Gi \
    --cpu 4 \
    --timeout 600s \
    --max-instances 20 \
    --concurrency 16 \
    --cpu-boost \
    --set-env-vars "GOOGLE_CLOUD_PROJECT=${PROJECT_ID},ESSENTIA_MAX_CONCURRENCY=8,MAX_AUDIO_DURATION=180,FALLBACK_REQUEST_TIMEOUT_COLD_START=60,FALLBACK_REQUEST_TIMEOUT_WARM=30,LOG_LEVEL=INFO" \
    --project "${PROJECT_ID}"; then
    echo ""
    echo "❌ Error: Cloud Run deployment failed. You may need additional permissions."
    echo ""
    echo "Required IAM role:"
    echo "  - roles/run.admin (Cloud Run Admin)"
    echo ""
    echo "To grant yourself this role, run:"
    echo "  gcloud projects add-iam-policy-binding ${PROJECT_ID} \\"
    echo "    --member=\"user:${CURRENT_USER}\" \\"
    echo "    --role=\"roles/run.admin\""
    echo ""
    exit 1
fi

# Get service URL
WORKER_URL=$(gcloud run services describe "${SERVICE_NAME}" \
    --region "${REGION}" \
    --format "value(status.url)" \
    --project "${PROJECT_ID}")

echo ""
echo "✅ Deployment complete!"
echo "Worker URL: ${WORKER_URL}"
echo ""

# Create dedicated service account for Pub/Sub push authentication
PUSH_SA_NAME="pubsub-push-invoker"
PUSH_SA_EMAIL="${PUSH_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

echo "🔐 Setting up dedicated service account for Pub/Sub push..."
if ! gcloud iam service-accounts describe "${PUSH_SA_EMAIL}" \
    --project="${PROJECT_ID}" &>/dev/null; then
    echo "Creating service account: ${PUSH_SA_NAME}"
    gcloud iam service-accounts create "${PUSH_SA_NAME}" \
        --display-name "Pub/Sub Push Invoker for Worker Service" \
        --project="${PROJECT_ID}"
    echo "✅ Service account created"
else
    echo "Service account already exists: ${PUSH_SA_NAME}"
fi

# Grant the push service account permission to invoke the worker service
echo "🔐 Granting push service account permission to invoke worker service..."
gcloud run services add-iam-policy-binding "${SERVICE_NAME}" \
    --region "${REGION}" \
    --member "serviceAccount:${PUSH_SA_EMAIL}" \
    --role "roles/run.invoker" \
    --project "${PROJECT_ID}"

# Create Pub/Sub push subscription if it doesn't exist
echo "📨 Creating Pub/Sub push subscription with OIDC authentication and Dead Letter Topic..."
if ! gcloud pubsub subscriptions describe "${PUBSUB_SUBSCRIPTION}" \
    --project="${PROJECT_ID}" &>/dev/null; then
    echo "Creating push subscription: ${PUBSUB_SUBSCRIPTION}"
    # Create with OIDC token authentication and Dead Letter Topic
    # --push-auth-service-account: The SA that will authenticate to Cloud Run
    # --push-auth-token-audience: The Cloud Run service URL (required for OIDC)
    # --dead-letter-topic: Topic for permanently failed messages
    # --max-delivery-attempts: Maximum retries before sending to DLQ (default: 5)
    gcloud pubsub subscriptions create "${PUBSUB_SUBSCRIPTION}" \
        --topic="${PUBSUB_TOPIC}" \
        --push-endpoint="${WORKER_URL}/pubsub/process" \
        --push-auth-service-account="${PUSH_SA_EMAIL}" \
        --push-auth-token-audience="${WORKER_URL}" \
        --ack-deadline=600 \
        --dead-letter-topic="${PUBSUB_DEAD_LETTER_TOPIC}" \
        --max-delivery-attempts=5 \
        --project="${PROJECT_ID}"
    echo "✅ Subscription created successfully with OIDC authentication and Dead Letter Topic"
    echo "   Push auth service account: ${PUSH_SA_EMAIL}"
    echo "   Token audience: ${WORKER_URL}"
    echo "   Dead Letter Topic: ${PUBSUB_DEAD_LETTER_TOPIC}"
    echo "   Max delivery attempts: 5"
else
    echo "Subscription already exists: ${PUBSUB_SUBSCRIPTION}"
    echo "Updating push endpoint with OIDC authentication and Dead Letter Topic..."
    # Update with OIDC token authentication and Dead Letter Topic
    gcloud pubsub subscriptions update "${PUBSUB_SUBSCRIPTION}" \
        --push-endpoint="${WORKER_URL}/pubsub/process" \
        --push-auth-service-account="${PUSH_SA_EMAIL}" \
        --push-auth-token-audience="${WORKER_URL}" \
        --ack-deadline=600 \
        --dead-letter-topic="${PUBSUB_DEAD_LETTER_TOPIC}" \
        --max-delivery-attempts=5 \
        --project="${PROJECT_ID}"
    echo "✅ Subscription updated with OIDC authentication and Dead Letter Topic"
    echo "   Push auth service account: ${PUSH_SA_EMAIL}"
    echo "   Token audience: ${WORKER_URL}"
    echo "   Dead Letter Topic: ${PUBSUB_DEAD_LETTER_TOPIC}"
    echo "   Max delivery attempts: 5"
fi
echo ""

# Grant worker service account Firestore write permissions
echo "🔐 Granting worker service account Firestore permissions..."
# Get the Cloud Run service account for the worker
WORKER_SA=$(gcloud run services describe "${SERVICE_NAME}" \
    --region "${REGION}" \
    --format "value(spec.template.spec.serviceAccountName)" \
    --project "${PROJECT_ID}")

# If no custom SA, use the default compute SA
if [ -z "${WORKER_SA}" ] || [ "${WORKER_SA}" = "default" ]; then
    PROJECT_NUMBER=$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')
    WORKER_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
fi

echo "Worker service account: ${WORKER_SA}"

# Grant Firestore user role (allows read/write)
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member "serviceAccount:${WORKER_SA}" \
    --role "roles/datastore.user" \
    --condition=None \
    --project "${PROJECT_ID}" || echo "⚠️  Note: Firestore permissions may already be set"

echo "✅ Worker service account Firestore permissions configured"
echo ""

echo ""
echo "✅ Worker service configured!"
echo ""
echo "To test locally, run:"
echo "  curl ${WORKER_URL}/health"
echo ""
echo "Pub/Sub Topic: ${PUBSUB_TOPIC}"
echo "Pub/Sub Subscription: ${PUBSUB_SUBSCRIPTION}"
echo "Worker URL: ${WORKER_URL}"
