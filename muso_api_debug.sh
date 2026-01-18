#!/bin/bash

# This script is designed to help you test the Muso API from the command line.
# The Muso API is deprecated and will be discontinued on January 31, 2024.
# For more information, please refer to the Muso API documentation: https://muso.ai/developers/docs/

# Please replace YOUR_MUSO_API_KEY with your actual Muso API key.
# You can get your API key from the MUSO_API_KEY environment variable in your project's configuration.

echo "--- Testing Muso API: searchProfilesByName ---"
curl -X POST -H "x-api-key: YOUR_MUSO_API_KEY" -H "Content-Type: application/json" \
  "https://api.developer.muso.ai/v4/search" \
  --data '{"keyword":"John Doe","type":["profile"],"limit":5,"offset":0}'
echo -e "\n"

echo "--- Testing Muso API: listProfileCredits ---"
echo "You will need to replace PROFILE_ID with a valid profile ID. You can get a profile ID by running the 'searchProfilesByName' command and extracting the 'id' from the response."
curl -H "x-api-key: YOUR_MUSO_API_KEY" "https://api.developer.muso.ai/v4/profile/PROFILE_ID/credits"
echo -e "\n"

echo "--- Testing Muso API: getTrackDetailsByIsrc ---"
echo "You will need to replace ISRC_CODE with a valid ISRC. You can find ISRCs on the ISRC mismatch page in the application, or from other sources."
curl -H "x-api-key: YOUR_MUSO_API_KEY" "https://api.developer.muso.ai/v4/track/isrc/ISRC_CODE"
echo -e "\n"
