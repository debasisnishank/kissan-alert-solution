#!/bin/bash
# Sync .env secrets to GitHub repository secrets
# Usage: ./scripts/sync-secrets.sh [repo-name]
# Example: ./scripts/sync-secrets.sh ujjwalsittu/compass-deno

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get repo name from argument or git remote
REPO=${1:-$(git remote get-url origin | sed 's/.*github.com[:/]\(.*\)\.git/\1/')}

if [ -z "$REPO" ]; then
  echo -e "${RED}Error: Could not determine repository name${NC}"
  echo "Usage: $0 <owner/repo>"
  exit 1
fi

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
  echo -e "${RED}Error: GitHub CLI (gh) is not installed${NC}"
  echo "Install it from: https://cli.github.com/"
  exit 1
fi

# Check if authenticated
if ! gh auth status &> /dev/null; then
  echo -e "${YELLOW}Not authenticated. Running gh auth login...${NC}"
  gh auth login
fi

# Check if .env exists
if [ ! -f ".env" ]; then
  echo -e "${RED}Error: .env file not found${NC}"
  exit 1
fi

echo -e "${GREEN}Syncing secrets to GitHub repo: $REPO${NC}"
echo ""

# Secrets to sync (add/remove as needed)
SECRETS_TO_SYNC=(
  "DATABASE_URL"
  "GEMINI_API_KEY"
  "SARVAM_API_KEY"
  "DEFAULT_TENANT_ID"
  "APP_SECRET"
  "COPERNICUS_CLIENT_ID"
  "COPERNICUS_CLIENT_SECRET"
  "DATA_GOV_API_KEY"
  "OLA_MAPS_API_KEY"
)

# Read .env and set secrets
count=0
skipped=0

while IFS= read -r line || [ -n "$line" ]; do
  # Skip comments and empty lines
  [[ "$line" =~ ^#.*$ ]] && continue
  [[ -z "$line" ]] && continue
  
  # Extract key and value
  key=$(echo "$line" | cut -d '=' -f 1)
  value=$(echo "$line" | cut -d '=' -f 2-)
  
  # Remove quotes from value
  value=$(echo "$value" | sed 's/^["'\'']//' | sed 's/["'\'']$//')
  
  # Check if this secret should be synced
  if [[ " ${SECRETS_TO_SYNC[*]} " =~ " ${key} " ]]; then
    # Skip empty values
    if [ -z "$value" ]; then
      echo -e "${YELLOW}Skipping $key (empty value)${NC}"
      ((skipped++))
      continue
    fi
    
    echo -n "Setting $key... "
    if gh secret set "$key" --repo "$REPO" --body "$value" 2>/dev/null; then
      echo -e "${GREEN}OK${NC}"
      ((count++))
    else
      echo -e "${RED}FAILED${NC}"
    fi
  fi
done < .env

echo ""
echo -e "${GREEN}Done! Synced $count secrets, skipped $skipped${NC}"
echo ""
echo "To use these in workflows, reference them as:"
echo '  ${{ secrets.DATABASE_URL }}'
echo '  ${{ secrets.GEMINI_API_KEY }}'
echo "  etc."
