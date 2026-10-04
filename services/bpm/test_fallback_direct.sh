#!/bin/bash

# Test the fallback service directly using gcloud identity token
# This tests if the fallback service is working and accessible

FALLBACK_SERVICE_URL="https://bpm-fallback-service-7jlgdaerna-ey.a.run.app"

echo "Testing Fallback Service Directly"
echo "=================================="
echo "Fallback Service URL: ${FALLBACK_SERVICE_URL}"
echo ""

# Get identity token (this works for user authentication)
echo "1. Getting identity token..."
TOKEN=$(gcloud auth print-identity-token 2>&1)

if [ $? -ne 0 ] || [ -z "$TOKEN" ]; then
    echo "❌ Error: Failed to get identity token"
    echo "$TOKEN"
    exit 1
fi

echo "✅ Token obtained (length: ${#TOKEN} characters)"
echo ""

# Test 2: Call health endpoint
echo "2. Testing fallback service health endpoint..."
echo "   Calling: ${FALLBACK_SERVICE_URL}/health"
echo ""

HTTP_CODE=$(curl -s -w "\n%{http_code}" \
    -H "Authorization: Bearer ${TOKEN}" \
    "${FALLBACK_SERVICE_URL}/health" \
    -o /tmp/fallback_health_response.txt)

STATUS_CODE=$(echo "$HTTP_CODE" | tail -n1)
RESPONSE_BODY=$(head -n -1 /tmp/fallback_health_response.txt 2>/dev/null || cat /tmp/fallback_health_response.txt)

echo "HTTP Status Code: ${STATUS_CODE}"
echo "Response:"
echo "$RESPONSE_BODY" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE_BODY"
echo ""

if [ "$STATUS_CODE" -eq 200 ]; then
    echo "✅ Fallback service is accessible and working!"
elif [ "$STATUS_CODE" -eq 403 ]; then
    echo "❌ Authentication failed (403 Forbidden)"
    echo ""
    echo "This means:"
    echo "  - The service is deployed and running"
    echo "  - But authentication is required and your token isn't accepted"
    echo ""
    echo "This is expected - we need to test with the service account token"
elif [ "$STATUS_CODE" -eq 404 ]; then
    echo "⚠️  Endpoint not found (404)"
    echo "   The /health endpoint might not exist on the fallback service"
else
    echo "⚠️  Unexpected status code: ${STATUS_CODE}"
fi

# Cleanup
rm -f /tmp/fallback_health_response.txt

echo ""
echo "Done!"









