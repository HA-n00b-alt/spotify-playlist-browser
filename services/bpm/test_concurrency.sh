#!/bin/bash
set -euo pipefail

# Concurrency stress test - tests worker's ability to handle many URLs in parallel
# This validates the optimized concurrency settings (worker: 16, essentia: 8)

SERVICE_URL="${1:-https://bpm-service-7jlgdaerna-ey.a.run.app}"
MAX_CONFIDENCE="${2:-0.65}"
DEBUG_LEVEL="${3:-minimal}"

# Deezer preview URLs expire quickly (Akamai hdnea tokens). Resolve fresh URLs from track IDs.
fetch_deezer_preview() {
    local track_id="$1"
    curl -s "https://api.deezer.com/track/${track_id}" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('preview') or '')"
}

DEEZER_TRACK_3135556=$(fetch_deezer_preview 3135556)   # Harder, Better, Faster, Stronger
DEEZER_TRACK_3998538191=$(fetch_deezer_preview 3998538191)  # SWEAT

if [ -z "$DEEZER_TRACK_3135556" ] || [ -z "$DEEZER_TRACK_3998538191" ]; then
    echo "Error: Failed to fetch Deezer preview URLs (tracks 3135556, 3998538191)"
    exit 1
fi

# Large batch of test URLs (20 URLs to stress test concurrency)
TEST_URLS=(
    "$DEEZER_TRACK_3135556"
    "https://p.scdn.co/mp3-preview/1c57741674dbcee27add7e06b6086d71da0cff5e"
    "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/37/d8/c9/37d8c9f7-838e-a222-0fe7-141c39e9f51c/mzaf_9144538674023163935.plus.aac.p.m4a"
    "https://p.scdn.co/mp3-preview/0b2426cba10cea8ffdd9d69b78f3f58073da6ab1?cid=18c612430a234d2da59d742217981da8"
    "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview125/v4/6c/45/59/6c4559aa-e474-1366-66e7-9cd5279acd05/mzaf_11210908680488989277.plus.aac.p.m4a"
    "$DEEZER_TRACK_3998538191"
    "$DEEZER_TRACK_3135556"
    "https://p.scdn.co/mp3-preview/1c57741674dbcee27add7e06b6086d71da0cff5e"
    "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/37/d8/c9/37d8c9f7-838e-a222-0fe7-141c39e9f51c/mzaf_9144538674023163935.plus.aac.p.m4a"
    "https://p.scdn.co/mp3-preview/0b2426cba10cea8ffdd9d69b78f3f58073da6ab1?cid=18c612430a234d2da59d742217981da8"
    "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview125/v4/6c/45/59/6c4559aa-e474-1366-66e7-9cd5279acd05/mzaf_11210908680488989277.plus.aac.p.m4a"
    "$DEEZER_TRACK_3998538191"
    "$DEEZER_TRACK_3135556"
    "https://p.scdn.co/mp3-preview/1c57741674dbcee27add7e06b6086d71da0cff5e"
    "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/37/d8/c9/37d8c9f7-838e-a222-0fe7-141c39e9f51c/mzaf_9144538674023163935.plus.aac.p.m4a"
    "https://p.scdn.co/mp3-preview/0b2426cba10cea8ffdd9d69b78f3f58073da6ab1?cid=18c612430a234d2da59d742217981da8"
    "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview125/v4/6c/45/59/6c4559aa-e474-1366-66e7-9cd5279acd05/mzaf_11210908680488989277.plus.aac.p.m4a"
    "$DEEZER_TRACK_3998538191"
    "$DEEZER_TRACK_3135556"
    "https://p.scdn.co/mp3-preview/1c57741674dbcee27add7e06b6086d71da0cff5e"
)

echo "=========================================="
echo "Concurrency Stress Test"
echo "=========================================="
echo "Service URL: $SERVICE_URL"
echo "Number of URLs: ${#TEST_URLS[@]}"
echo "Max Confidence: $MAX_CONFIDENCE"
echo "Debug Level: $DEBUG_LEVEL"
echo ""
echo "This test validates:"
echo "  - Worker concurrency: 16 requests"
echo "  - Essentia threads: 8 concurrent analyses"
echo "  - Fallback service: 2 concurrent + 3 process workers"
echo ""

TOKEN=$(gcloud auth print-identity-token 2>/dev/null)
if [ -z "$TOKEN" ]; then
    echo "Error: Failed to get authentication token"
    exit 1
fi

# Build JSON payload
JSON_PAYLOAD="{\"urls\": ["
for i in "${!TEST_URLS[@]}"; do
    if [ $i -gt 0 ]; then
        JSON_PAYLOAD+=", "
    fi
    JSON_PAYLOAD+="\"${TEST_URLS[$i]}\""
done
JSON_PAYLOAD+="], \"max_confidence\": $MAX_CONFIDENCE, \"debug_level\": \"$DEBUG_LEVEL\"}"

# Submit batch
echo "Submitting batch of ${#TEST_URLS[@]} URLs..."
START_TIME=$(date +%s)

RESPONSE=$(curl -s -X POST "${SERVICE_URL}/analyze/batch" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "$JSON_PAYLOAD")

BATCH_ID=$(echo "$RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin)['batch_id'])" 2>/dev/null)

if [ -z "$BATCH_ID" ]; then
    echo "❌ Error: Could not submit batch"
    echo "Response: $RESPONSE"
    exit 1
fi

echo "✅ Batch submitted: $BATCH_ID"
echo ""
echo "Streaming results..."
echo ""

# Track timing metrics
FIRST_PARTIAL_TIME=""
FIRST_FINAL_TIME=""
RESULTS_COUNT=0
PARTIALS_COUNT=0

curl -s -N --max-time 600 -X GET "${SERVICE_URL}/stream/${BATCH_ID}" \
    -H "Authorization: Bearer $TOKEN" | while IFS= read -r line; do
    if [ -z "$line" ]; then
        continue
    fi

    CURRENT_TIME=$(date +%s)
    ELAPSED=$((CURRENT_TIME - START_TIME))

    TYPE=$(echo "$line" | python3 -c "import sys, json; print(json.load(sys.stdin).get('type', 'unknown'))" 2>/dev/null)

    case "$TYPE" in
        "result")
            STATUS_FIELD=$(echo "$line" | python3 -c "import sys, json; print(json.load(sys.stdin).get('status', 'final'))" 2>/dev/null)
            INDEX=$(echo "$line" | python3 -c "import sys, json; print(json.load(sys.stdin).get('index', '?'))" 2>/dev/null)

            if [ "$STATUS_FIELD" = "partial" ]; then
                PARTIALS_COUNT=$((PARTIALS_COUNT + 1))
                if [ -z "$FIRST_PARTIAL_TIME" ]; then
                    FIRST_PARTIAL_TIME=$ELAPSED
                    echo "[${ELAPSED}s] ⚡ First partial result! (Time to first result: ${ELAPSED}s)"
                fi
                echo "[${ELAPSED}s] ⏳ Partial #${INDEX} (total partials: ${PARTIALS_COUNT})"
            else
                RESULTS_COUNT=$((RESULTS_COUNT + 1))
                if [ -z "$FIRST_FINAL_TIME" ]; then
                    FIRST_FINAL_TIME=$ELAPSED
                    echo "[${ELAPSED}s] 🎯 First final result! (Time to first final: ${ELAPSED}s)"
                fi
                echo "[${ELAPSED}s] ✅ Final #${INDEX} (completed: ${RESULTS_COUNT}/${#TEST_URLS[@]})"
            fi
            ;;
        "complete")
            TOTAL_ELAPSED=$((CURRENT_TIME - START_TIME))
            echo ""
            echo "=========================================="
            echo "✅ Test Complete!"
            echo "=========================================="
            echo "Total URLs: ${#TEST_URLS[@]}"
            echo "Time to first partial: ${FIRST_PARTIAL_TIME}s"
            echo "Time to first final: ${FIRST_FINAL_TIME}s"
            echo "Total processing time: ${TOTAL_ELAPSED}s"
            echo "Average per URL: $((TOTAL_ELAPSED / ${#TEST_URLS[@]}))s"
            echo "Throughput: $(echo "scale=2; ${#TEST_URLS[@]} / $TOTAL_ELAPSED" | bc) URLs/second"
            echo ""

            if [ "$TOTAL_ELAPSED" -lt 120 ]; then
                echo "🚀 Excellent! Completed in under 2 minutes"
            elif [ "$TOTAL_ELAPSED" -lt 180 ]; then
                echo "✅ Good! Completed in under 3 minutes"
            else
                echo "⚠️  Slower than expected (>3 minutes for 20 URLs)"
            fi
            exit 0
            ;;
        "error")
            ERROR=$(echo "$line" | python3 -c "import sys, json; print(json.load(sys.stdin).get('message', 'Unknown error'))" 2>/dev/null)
            echo "[${ELAPSED}s] ❌ Error: $ERROR"
            ;;
    esac
done

echo ""
echo "Test finished or timed out"
