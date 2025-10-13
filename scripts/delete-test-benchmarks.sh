#!/bin/bash

# Script to delete test benchmark gists
# Usage: GITHUB_TOKEN=your_token_here ./scripts/delete-test-benchmarks.sh

if [ -z "$GITHUB_TOKEN" ]; then
  echo "Error: GITHUB_TOKEN environment variable not set"
  echo "Usage: GITHUB_TOKEN=your_token_here ./scripts/delete-test-benchmarks.sh"
  exit 1
fi

echo "Fetching your gists..."

# Get all gists (including private ones)
GISTS=$(curl -s -H "Authorization: token $GITHUB_TOKEN" \
  "https://api.github.com/gists")

# Filter for SignalTree benchmark gists
BENCHMARK_GISTS=$(echo "$GISTS" | jq -r '.[] | select(.description | startswith("SignalTree Realistic Benchmark")) | .id')

if [ -z "$BENCHMARK_GISTS" ]; then
  echo "No SignalTree benchmark gists found."
  exit 0
fi

echo "Found benchmark gists:"
echo "$BENCHMARK_GISTS"
echo ""
echo "Deleting benchmark gists..."

# Delete each gist
for GIST_ID in $BENCHMARK_GISTS; do
  DESCRIPTION=$(echo "$GISTS" | jq -r ".[] | select(.id == \"$GIST_ID\") | .description")
  echo "Deleting: $DESCRIPTION (ID: $GIST_ID)"

  RESPONSE=$(curl -s -X DELETE \
    -H "Authorization: token $GITHUB_TOKEN" \
    -w "%{http_code}" \
    "https://api.github.com/gists/$GIST_ID")

  if [ "$RESPONSE" = "204" ]; then
    echo "  ✓ Deleted successfully"
  else
    echo "  ✗ Failed to delete (HTTP $RESPONSE)"
  fi
done

echo ""
echo "Done!"
