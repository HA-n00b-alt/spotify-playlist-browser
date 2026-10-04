#!/bin/bash
set -euo pipefail

# Configuration
PROJECT_ID="${PROJECT_ID:-delman-site}"
REGION="${REGION:-europe-west3}"
SERVICE_NAME="bpm-fallback-service"
ARTIFACT_REPO="bpm-repo"
SERVICE_ACCOUNT="vercel-bpm-invoker"

# Image tag
IMAGE_TAG="${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REPO}/${SERVICE_NAME}:latest"

echo "🚀 Deploying BPM Fallback Service to Cloud Run"
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
# Note: We need to use a custom build that uses Dockerfile.fallback
echo "📦 Building and pushing Docker image..."
# Create a temporary build context
TEMP_DIR=$(mktemp -d)
cp fallback_service.py "${TEMP_DIR}/"
cp requirements_fallback.txt "${TEMP_DIR}/requirements_fallback.txt"
cp Dockerfile.fallback "${TEMP_DIR}/Dockerfile"

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
    rm -rf "${TEMP_DIR}"
    exit 1
fi

# Cleanup temp directory
rm -rf "${TEMP_DIR}"

# Deploy to Cloud Run (without public access)
# Low concurrency for CPU-heavy librosa processing, CPU boost for startup
echo "🚢 Deploying to Cloud Run..."
if ! gcloud run deploy "${SERVICE_NAME}" \
    --image "${IMAGE_TAG}" \
    --region "${REGION}" \
    --platform managed \
    --no-allow-unauthenticated \
    --port 8080 \
    --memory 4Gi \
    --cpu 2 \
    --timeout 300s \
    --max-instances 10 \
    --concurrency 2 \
    --cpu-boost \
    --set-env-vars "PROCESS_POOL_WORKERS=3,FALLBACK_MAX_SECONDS=30,LOG_LEVEL=INFO" \
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
SERVICE_URL=$(gcloud run services describe "${SERVICE_NAME}" \
    --region "${REGION}" \
    --format "value(status.url)" \
    --project "${PROJECT_ID}")

echo ""
echo "✅ Deployment complete!"
echo "Service URL: ${SERVICE_URL}"
echo ""

# Grant primary service permission to invoke fallback service
echo "🔐 Configuring service-to-service authentication..."
PRIMARY_SERVICE_NAME="bpm-service"

# Get primary service's service account
PRIMARY_SERVICE_ACCOUNT=$(gcloud run services describe "${PRIMARY_SERVICE_NAME}" \
    --region "${REGION}" \
    --format "value(spec.template.spec.serviceAccountName)" \
    --project "${PROJECT_ID}" 2>/dev/null || echo "")

# If no custom service account, use default Compute Engine service account
if [ -z "${PRIMARY_SERVICE_ACCOUNT}" ] || [ "${PRIMARY_SERVICE_ACCOUNT}" = "default" ]; then
    PROJECT_NUMBER=$(gcloud projects describe "${PROJECT_ID}" --format="value(projectNumber)")
    PRIMARY_SERVICE_ACCOUNT="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
    echo "Using default Compute Engine service account: ${PRIMARY_SERVICE_ACCOUNT}"
else
    echo "Using primary service account: ${PRIMARY_SERVICE_ACCOUNT}"
fi

# Grant invoke permission to primary service
echo "Granting primary service permission to invoke fallback service..."
gcloud run services add-iam-policy-binding "${SERVICE_NAME}" \
    --region "${REGION}" \
    --member "serviceAccount:${PRIMARY_SERVICE_ACCOUNT}" \
    --role "roles/run.invoker" \
    --project "${PROJECT_ID}"

echo "✅ Primary service can now invoke fallback service"

# Verify external service account exists
echo "🔐 Verifying external service account..."
if ! gcloud iam service-accounts describe "${SERVICE_ACCOUNT}@${PROJECT_ID}.iam.gserviceaccount.com" \
    --project "${PROJECT_ID}" &>/dev/null; then
    echo "⚠️  Warning: Service account ${SERVICE_ACCOUNT} does not exist."
    echo "   It will be created by the primary service deployment if needed."
else
    echo "Service account exists: ${SERVICE_ACCOUNT}"
    
    # Grant invoke permission to external service account
    echo "Granting invoke permission to external service account..."
    gcloud run services add-iam-policy-binding "${SERVICE_NAME}" \
        --region "${REGION}" \
        --member "serviceAccount:${SERVICE_ACCOUNT}@${PROJECT_ID}.iam.gserviceaccount.com" \
        --role "roles/run.invoker" \
        --project "${PROJECT_ID}"
    
    echo "✅ External service account configured!"
fi

echo ""
echo "To test locally, run:"
echo "  TOKEN=\$(gcloud auth print-identity-token)"
echo "  curl -H \"Authorization: Bearer \$TOKEN\" ${SERVICE_URL}/health"
echo ""
