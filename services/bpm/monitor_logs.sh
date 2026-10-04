#!/bin/bash
set -euo pipefail

# Monitor logs from all services in real-time during testing
# Usage: ./monitor_logs.sh [batch_id]
# If batch_id is provided, filter logs for that specific batch

PROJECT_ID="${PROJECT_ID:-delman-site}"
BATCH_ID="${1:-}"

echo "=========================================="
echo "Real-time Log Monitor"
echo "=========================================="
echo "Project: $PROJECT_ID"
if [ -n "$BATCH_ID" ]; then
    echo "Filtering for batch: $BATCH_ID"
fi
echo ""
echo "Press Ctrl+C to stop monitoring"
echo ""

# Function to format and colorize log output
format_logs() {
    local service_name=$1
    local color_code=$2

    while IFS= read -r line; do
        # Extract timestamp and message
        timestamp=$(echo "$line" | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}' | head -1)

        # Color codes
        COLOR_RESET='\033[0m'
        case $color_code in
            "blue")   COLOR='\033[0;34m' ;;
            "green")  COLOR='\033[0;32m' ;;
            "yellow") COLOR='\033[0;33m' ;;
            *)        COLOR='\033[0m' ;;
        esac

        echo -e "${COLOR}[${service_name}]${COLOR_RESET} $line"
    done
}

# Build filter based on batch_id
if [ -n "$BATCH_ID" ]; then
    FILTER="jsonPayload.batch_id=\"$BATCH_ID\" OR textPayload=~\"$BATCH_ID\""
else
    # Show recent logs from all services (last 5 minutes)
    FILTER="timestamp>=\"$(date -u -v-5M '+%Y-%m-%dT%H:%M:%SZ')\" OR timestamp>=\"$(date -u --date='5 minutes ago' '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null)\""
fi

echo "Starting log stream..."
echo ""

# Stream logs from all three services in parallel
(
    gcloud logging tail "resource.type=cloud_run_revision AND resource.labels.service_name=bpm-service AND ($FILTER)" \
        --project="$PROJECT_ID" \
        --format="value(timestamp,textPayload,jsonPayload)" 2>/dev/null | \
        format_logs "MAIN" "blue"
) &

(
    gcloud logging tail "resource.type=cloud_run_revision AND resource.labels.service_name=bpm-worker AND ($FILTER)" \
        --project="$PROJECT_ID" \
        --format="value(timestamp,textPayload,jsonPayload)" 2>/dev/null | \
        format_logs "WORKER" "green"
) &

(
    gcloud logging tail "resource.type=cloud_run_revision AND resource.labels.service_name=bpm-fallback-service AND ($FILTER)" \
        --project="$PROJECT_ID" \
        --format="value(timestamp,textPayload,jsonPayload)" 2>/dev/null | \
        format_logs "FALLBACK" "yellow"
) &

# Wait for all background processes
wait
