#!/bin/bash

# Test script to verify fallback service authentication
# This tests if we can generate an ID token and call the fallback service

FALLBACK_SERVICE_URL="https://bpm-fallback-service-7jlgdaerna-ey.a.run.app"
PROJECT_ID="${PROJECT_ID:-delman-site}"

echo "Testing Fallback Service Authentication"
echo "========================================"
echo "Fallback Service URL: ${FALLBACK_SERVICE_URL}"
echo ""

# Test 1: Generate ID token
echo "1. Generating ID token..."
TOKEN=$(gcloud auth print-identity-token --audiences="${FALLBACK_SERVICE_URL}" 2>&1)

if [ $? -ne 0 ]; then
    echo "❌ Error generating token:"
    echo "$TOKEN"
    exit 1
fi

if [ -z "$TOKEN" ]; then
    echo "❌ Error: Empty token generated"
    exit 1
fi

echo "✅ Token generated (length: ${#TOKEN} characters)"
echo ""

# Test 2: Call health endpoint (if it exists) or test endpoint
echo "2. Testing authentication with fallback service..."
echo "   Calling: ${FALLBACK_SERVICE_URL}/health"
echo ""

HTTP_CODE=$(curl -s -w "\n%{http_code}" \
    -H "Authorization: Bearer ${TOKEN}" \
    "${FALLBACK_SERVICE_URL}/health" \
    -o /tmp/fallback_test_response.txt)

STATUS_CODE=$(echo "$HTTP_CODE" | tail -n1)
RESPONSE_BODY=$(head -n -1 /tmp/fallback_test_response.txt 2>/dev/null || cat /tmp/fallback_test_response.txt)

echo "HTTP Status Code: ${STATUS_CODE}"
echo "Response:"
echo "$RESPONSE_BODY" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE_BODY"
echo ""

if [ "$STATUS_CODE" -eq 200 ]; then
    echo "✅ Authentication successful! The token works."
elif [ "$STATUS_CODE" -eq 403 ]; then
    echo "❌ Authentication failed (403 Forbidden)"
    echo ""
    echo "Troubleshooting:"
    echo "1. Verify the service account has permission:"
    echo "   gcloud run services get-iam-policy bpm-fallback-service --region europe-west3 --project ${PROJECT_ID}"
    echo ""
    echo "2. Check if the primary service's service account is in the policy:"
    PROJECT_NUMBER=$(gcloud projects describe "${PROJECT_ID}" --format="value(projectNumber)")
    PRIMARY_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
    echo "   Primary service account: ${PRIMARY_SA}"
    echo ""
    echo "3. Grant permission if missing:"
    echo "   gcloud run services add-iam-policy-binding bpm-fallback-service \\"
    echo "     --region europe-west3 \\"
    echo "     --member \"serviceAccount:${PRIMARY_SA}\" \\"
    echo "     --role \"roles/run.invoker\" \\"
    echo "     --project ${PROJECT_ID}"
else
    echo "⚠️  Unexpected status code: ${STATUS_CODE}"
fi

# Cleanup
rm -f /tmp/fallback_test_response.txt

echo ""
echo "Done!"

