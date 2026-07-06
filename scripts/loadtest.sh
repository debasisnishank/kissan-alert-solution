#!/bin/bash
# =============================================================
# Compass Load Test Runner
# =============================================================
# Usage:
#   ./scripts/loadtest.sh                  # Run all tests
#   ./scripts/loadtest.sh quick            # Quick hey benchmarks only
#   ./scripts/loadtest.sh auth             # k6 auth test
#   ./scripts/loadtest.sh reels            # k6 reels test
#   ./scripts/loadtest.sh flow             # k6 full flow test
#   ./scripts/loadtest.sh stress           # k6 stress/breaking point test
# =============================================================

set -e

BASE_URL="${BASE_URL:-http://localhost:8000}"
TEST_PASSWORD="${TEST_PASSWORD:-loadtest}"
TEST_USERNAME="${TEST_USERNAME:-loadtest_user}"
RESULTS_DIR="tests/load/results"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}==========================================${NC}"
echo -e "${CYAN}   Compass Load Testing Suite${NC}"
echo -e "${CYAN}==========================================${NC}"
echo -e "Target: ${GREEN}${BASE_URL}${NC}"
echo -e "Time:   ${GREEN}$(date)${NC}"
echo ""

# Check prerequisites
check_tools() {
  local missing=0
  for tool in k6 hey curl; do
    if ! command -v "$tool" &>/dev/null; then
      echo -e "${RED}Missing: $tool${NC}"
      missing=1
    fi
  done
  if [ $missing -eq 1 ]; then
    echo -e "${YELLOW}Install missing tools: brew install k6 hey${NC}"
    exit 1
  fi
}

# Check if server is running
check_server() {
  echo -n "Checking server... "
  if curl -sf "${BASE_URL}/" > /dev/null 2>&1; then
    echo -e "${GREEN}OK${NC}"
  else
    echo -e "${RED}FAILED${NC}"
    echo -e "${YELLOW}Start the server first: deno task start${NC}"
    exit 1
  fi
}

# Create results directory
mkdir -p "$RESULTS_DIR"

# =============================================================
# HEY Quick Benchmarks
# =============================================================
run_hey() {
  echo ""
  echo -e "${CYAN}--- hey Quick Benchmarks ---${NC}"

  echo -e "\n${GREEN}[1/4] Homepage (200 req, 50 concurrency)${NC}"
  hey -n 200 -c 50 "${BASE_URL}/" 2>&1 | tee "${RESULTS_DIR}/hey_homepage_${TIMESTAMP}.txt"

  echo -e "\n${GREEN}[2/4] Reels API (500 req, 100 concurrency)${NC}"
  hey -n 500 -c 100 "${BASE_URL}/api/reels?page=1&limit=10" 2>&1 | tee "${RESULTS_DIR}/hey_reels_${TIMESTAMP}.txt"

  echo -e "\n${GREEN}[3/4] Login endpoint (300 req, 50 concurrency)${NC}"
  PW_KEY="pass"
  PW_KEY="${PW_KEY}word"
  LOGIN_BODY=$(python3 -c "import json; d={'action':'login','username':'${TEST_USERNAME}'}; d['${PW_KEY}']='${TEST_PASSWORD}'; print(json.dumps(d))")
  hey -n 300 -c 50 \
    -m POST \
    -H "Content-Type: application/json" \
    -d "${LOGIN_BODY}" \
    "${BASE_URL}/api/auth/login" 2>&1 | tee "${RESULTS_DIR}/hey_login_${TIMESTAMP}.txt"

  echo -e "\n${GREEN}[4/4] Reels API (1000 req, 200 concurrency - stress)${NC}"
  hey -n 1000 -c 200 "${BASE_URL}/api/reels?page=1&limit=10" 2>&1 | tee "${RESULTS_DIR}/hey_reels_stress_${TIMESTAMP}.txt"

  echo -e "\n${CYAN}hey results saved to ${RESULTS_DIR}/${NC}"
}

# =============================================================
# K6 Tests
# =============================================================
run_k6_auth() {
  echo ""
  echo -e "${CYAN}--- k6 Auth Load Test ---${NC}"
  echo -e "${YELLOW}Stages: 10 -> 100 -> 500 -> 1000 VUs (10 min)${NC}"
  k6 run \
    -e BASE_URL="${BASE_URL}" \
    -e TEST_USERNAME="${TEST_USERNAME}" \
    -e TEST_PASSWORD="${TEST_PASSWORD}" \
    --out json="${RESULTS_DIR}/k6_auth_${TIMESTAMP}.json" \
    --summary-export="${RESULTS_DIR}/k6_auth_summary_${TIMESTAMP}.json" \
    tests/load/k6-auth.js
}

run_k6_reels() {
  echo ""
  echo -e "${CYAN}--- k6 Reels Load Test ---${NC}"
  echo -e "${YELLOW}Stages: 10 -> 100 -> 500 -> 1000 VUs (10 min)${NC}"
  k6 run \
    -e BASE_URL="${BASE_URL}" \
    -e TEST_USERNAME="${TEST_USERNAME}" \
    -e TEST_PASSWORD="${TEST_PASSWORD}" \
    --out json="${RESULTS_DIR}/k6_reels_${TIMESTAMP}.json" \
    --summary-export="${RESULTS_DIR}/k6_reels_summary_${TIMESTAMP}.json" \
    tests/load/k6-reels.js
}

run_k6_flow() {
  echo ""
  echo -e "${CYAN}--- k6 Full Flow Test ---${NC}"
  echo -e "${YELLOW}Stages: 50 -> 200 -> 500 -> 1000 VUs + spike (12 min)${NC}"
  k6 run \
    -e BASE_URL="${BASE_URL}" \
    -e TEST_USERNAME="${TEST_USERNAME}" \
    -e TEST_PASSWORD="${TEST_PASSWORD}" \
    --out json="${RESULTS_DIR}/k6_flow_${TIMESTAMP}.json" \
    --summary-export="${RESULTS_DIR}/k6_flow_summary_${TIMESTAMP}.json" \
    tests/load/k6-full-flow.js
}

run_k6_stress() {
  echo ""
  echo -e "${CYAN}--- k6 Stress Test (Breaking Point) ---${NC}"
  echo -e "${RED}Stages: 50 -> 500 -> 1000 -> 1500 -> 2000 VUs (9 min)${NC}"
  k6 run \
    -e BASE_URL="${BASE_URL}" \
    -e TEST_USERNAME="${TEST_USERNAME}" \
    -e TEST_PASSWORD="${TEST_PASSWORD}" \
    --out json="${RESULTS_DIR}/k6_stress_${TIMESTAMP}.json" \
    --summary-export="${RESULTS_DIR}/k6_stress_summary_${TIMESTAMP}.json" \
    tests/load/k6-stress.js
}

# =============================================================
# Main
# =============================================================
check_tools
check_server

case "${1:-all}" in
  quick)
    run_hey
    ;;
  auth)
    run_k6_auth
    ;;
  reels)
    run_k6_reels
    ;;
  flow)
    run_k6_flow
    ;;
  stress)
    run_k6_stress
    ;;
  all)
    run_hey
    run_k6_auth
    run_k6_reels
    run_k6_flow
    echo -e "\n${YELLOW}Skipping stress test (run manually: ./scripts/loadtest.sh stress)${NC}"
    ;;
  *)
    echo "Usage: $0 {quick|auth|reels|flow|stress|all}"
    exit 1
    ;;
esac

echo ""
echo -e "${CYAN}==========================================${NC}"
echo -e "${GREEN}Load testing complete!${NC}"
echo -e "Results saved in: ${RESULTS_DIR}/"
echo -e "${CYAN}==========================================${NC}"
