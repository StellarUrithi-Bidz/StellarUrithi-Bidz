#!/usr/bin/env bash
# ============================================================================
# StellarUrithi-Bidz — Interactive Contract Deployment Wizard
# ============================================================================
# Prerequisites: soroban CLI (>= 22.0.0), Rust toolchain, wasm32 target, jq
#
# Usage:
#   ./deploy.sh              Interactive wizard (testnet)
#   ./deploy.sh --mainnet    Interactive wizard (mainnet)
#   ./deploy.sh --verify     Verify an already-deployed contract
#   ./deploy.sh --demo       Run the end-to-end demo sequence
#   ./deploy.sh --help       Show help
#
# Features:
#   - Check prerequisites (Rust, soroban CLI, wasm target, jq)
#   - Generate/fund testnet identity via Friendbot
#   - Build & optimize WASM
#   - Run tests with pass/fail summary
#   - Deploy to testnet or mainnet (JSON output + jq parsing)
#   - Initialize contract with admin config
#   - Verify deployment with query calls
#   - Run end-to-end demo (create auction)
#   - Save contract ID to .contract-id for use by Makefile

set -euo pipefail

# ── Colors ─────────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

# ── Configuration ──────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTRACTS_DIR="$SCRIPT_DIR/contracts"
WASM_SRC="$CONTRACTS_DIR/target/wasm32-unknown-unknown/release/stellar_urithi_auction.wasm"
WASM_OPT="$CONTRACTS_DIR/target/wasm32-unknown-unknown/release/stellar_urithi_auction.optimized.wasm"
CONTRACT_ID_FILE="$SCRIPT_DIR/.contract-id"
DEPLOY_LOG="$SCRIPT_DIR/.deploy-log"

NETWORK="testnet"
DEPLOYER=""
VERIFY_ONLY=false
DEMO_ONLY=false

# ── Banner ─────────────────────────────────────────────────────────────────────────

banner() {
  echo ""
  echo -e "${BOLD}${CYAN}╔═══════════════════════════════════════════════════════════╗${RESET}"
  echo -e "${BOLD}${CYAN}║   StellarUrithi-Bidz — Contract Deployment Wizard         ║${RESET}"
  echo -e "${BOLD}${CYAN}╚═══════════════════════════════════════════════════════════╝${RESET}"
  echo ""
}

section() {
  echo ""
  echo -e "${BOLD}${CYAN}━━━ $1 ━━━${RESET}"
  echo ""
}

success() { echo -e "   ${GREEN}✔${RESET} $1"; }
fail()    { echo -e "   ${RED}✖${RESET} $1"; }
info()    { echo -e "   ${CYAN}ℹ${RESET} $1"; }
warn()    { echo -e "   ${YELLOW}⚠${RESET} $1"; }

# ── Parse Arguments ────────────────────────────────────────────────────────────────

parse_args() {
  for arg in "$@"; do
    case "$arg" in
      --mainnet) NETWORK="mainnet" ;;
      --testnet) NETWORK="testnet" ;;
      --verify)  VERIFY_ONLY=true ;;
      --demo)    DEMO_ONLY=true ;;
      --help|-h)
        echo "Usage: ./deploy.sh [OPTIONS]"
        echo ""
        echo "Options:"
        echo "  --mainnet     Deploy to Stellar mainnet (use with caution)"
        echo "  --testnet     Deploy to Stellar testnet (default)"
        echo "  --verify      Verify an already-deployed contract"
        echo "  --demo        Run end-to-end demo on an existing contract"
        echo "  --help        Show this help"
        exit 0
        ;;
      *)
        echo "Unknown option: $arg. Use --help for usage."
        exit 1
        ;;
    esac
  done
}

# ── Prerequisite Checks ────────────────────────────────────────────────────────────

check_prerequisites() {
  section "Checking Prerequisites"

  # Check Rust
  if command -v rustc >/dev/null 2>&1; then
    success "Rust: $(rustc --version)"
  else
    fail "Rust not found. Install from https://rustup.rs"
    exit 1
  fi

  # Check wasm target
  if rustup target list --installed 2>/dev/null | grep -q wasm32-unknown-unknown; then
    success "wasm32-unknown-unknown target installed"
  else
    warn "wasm32-unknown-unknown target not installed"
    info "Installing..."
    rustup target add wasm32-unknown-unknown
    success "wasm32 target installed"
  fi

  # Check soroban CLI
  if command -v soroban >/dev/null 2>&1; then
    SOROBAN_VERSION=$(soroban --version 2>&1 | head -n 1 || echo "unknown")
    success "soroban CLI: $SOROBAN_VERSION"
  else
    fail "soroban CLI not found."
    info "Install: cargo install soroban-cli"
    info "Or visit: https://soroban.stellar.org/docs/getting-started/setup"
    exit 1
  fi

  # Check cargo
  if command -v cargo >/dev/null 2>&1; then
    success "cargo: $(cargo --version)"
  else
    fail "cargo not found"
    exit 1
  fi

  # Check jq (needed for JSON parsing of deploy output)
  if command -v jq >/dev/null 2>&1; then
    success "jq: $(jq --version)"
  else
    fail "jq not found."
    info "Install: brew install jq  /  apt install jq"
    exit 1
  fi

  echo ""
}

# ── Identity Setup ─────────────────────────────────────────────────────────────────

setup_identity() {
  section "Identity Setup"

  if [ -z "$DEPLOYER" ]; then
    echo -e "${GREEN}Enter a name for your deployer identity (e.g., alice):${RESET}"
    read -r DEPLOYER
    DEPLOYER=${DEPLOYER:-alice}
  fi

  # Check if identity exists
  if soroban keys address "$DEPLOYER" >/dev/null 2>&1; then
    ADDR=$(soroban keys address "$DEPLOYER")
    success "Identity '$DEPLOYER' exists: $ADDR"
  else
    info "Generating new identity: $DEPLOYER"
    soroban keys generate "$DEPLOYER" --network testnet
    ADDR=$(soroban keys address "$DEPLOYER")
    success "Generated: $ADDR"
  fi

  # Fund on testnet
  if [ "$NETWORK" = "testnet" ]; then
    info "Funding $DEPLOYER via Friendbot..."
    if soroban keys fund "$DEPLOYER" --network testnet 2>/dev/null; then
      success "Funded $DEPLOYER on testnet"
    else
      warn "Friendbot may have failed. If already funded, ignore."
    fi
  fi

  export DEPLOYER
}

# ── Build & Test ───────────────────────────────────────────────────────────────────

build_and_test() {
  section "Build & Test"

  info "Building contracts (release)..."
  cd "$CONTRACTS_DIR"
  cargo build --target wasm32-unknown-unknown --release 2>&1 | tail -n 3

  if [ -f "$WASM_SRC" ]; then
    success "WASM built: $(ls -lh "$WASM_SRC" | awk '{print $5}')"
  else
    fail "WASM not found at $WASM_SRC"
    exit 1
  fi

  info "Running tests..."
  TEST_OUTPUT=$(cargo test 2>&1)
  TEST_EXIT=$?

  if [ $TEST_EXIT -eq 0 ]; then
    echo "$TEST_OUTPUT" | grep "test result:" | tail -n 1
    success "Tests passed"
  else
    echo "$TEST_OUTPUT" | tail -n 20
    fail "Tests failed"
    echo ""
    echo -e "${YELLOW}Continue anyway? (y/N):${RESET}"
    read -r CONTINUE
    if [ "$CONTINUE" != "y" ] && [ "$CONTINUE" != "Y" ]; then
      exit 1
    fi
    warn "Continuing despite test failures..."
  fi
}

# ── Optimize WASM ──────────────────────────────────────────────────────────────────

optimize_wasm() {
  section "WASM Optimization"

  if soroban contract optimize --wasm "$WASM_SRC" --wasm-out "$WASM_OPT" 2>/dev/null; then
    OPT_SIZE=$(ls -lh "$WASM_OPT" | awk '{print $5}')
    success "Optimized WASM: $OPT_SIZE"
  else
    warn "soroban contract optimize not available, using release WASM as-is"
    cp "$WASM_SRC" "$WASM_OPT"
    success "Copied release WASM"
  fi
}

# ── Deploy ─────────────────────────────────────────────────────────────────────────

deploy() {
  section "Deploying Contract"

  # Validate jq is available
  if ! command -v jq >/dev/null 2>&1; then
    fail "jq is required for deployment. Install: brew install jq / apt install jq"
    exit 1
  fi

  if [ "$NETWORK" = "mainnet" ]; then
    echo -e "${RED}${BOLD}⚠️  THIS WILL DEPLOY TO STELLAR MAINNET${RESET}"
    echo -e "${RED}You will use REAL XLM. This action is IRREVERSIBLE.${RESET}"
    echo ""
    echo -e "${RED}Type 'MAINNET' to confirm:${RESET}"
    read -r CONFIRM
    if [ "$CONFIRM" != "MAINNET" ]; then
      echo "Aborted."
      exit 0
    fi
  fi

  echo "   Network:   $NETWORK"
  echo "   Deployer:  $DEPLOYER"
  echo "   WASM:      $WASM_OPT"
  echo ""

  info "Deploying..."
  DEPLOY_OUTPUT=$(soroban contract deploy \
    --wasm "$WASM_OPT" \
    --source-account "$DEPLOYER" \
    --network "$NETWORK" \
    --fee 100000 2>&1)
  DEPLOY_EXIT=$?

  if [ $DEPLOY_EXIT -ne 0 ]; then
    fail "Deployment failed:"
    echo "$DEPLOY_OUTPUT"
    exit 1
  fi

  # Extract contract ID from the last line of output (stellar CLI v27+)
  CONTRACT_ID=$(echo "$DEPLOY_OUTPUT" | tail -n 1 | grep -Eo 'C[A-Z0-9]{55}' || echo "")

  if [ -z "$CONTRACT_ID" ] || [ "$CONTRACT_ID" = "null" ]; then
    fail "Could not extract contract ID from deployment output:"
    echo "$DEPLOY_OUTPUT"
    exit 1
  fi

  echo ""
  success "Contract deployed!"
  echo ""
  echo -e "   ${BOLD}Contract ID: ${GREEN}$CONTRACT_ID${RESET}"
  echo ""

  # Save contract ID
  echo "CONTRACT_ID=$CONTRACT_ID" > "$CONTRACT_ID_FILE"
  success "Contract ID saved to $CONTRACT_ID_FILE"

  # Log deployment
  {
    echo "=== Deployment: $(date -u +"%Y-%m-%dT%H:%M:%SZ") ==="
    echo "Network:     $NETWORK"
    echo "Contract ID: $CONTRACT_ID"
    echo "Deployer:    $DEPLOYER"
    echo "WASM:        $WASM_OPT"
    echo ""
  } >> "$DEPLOY_LOG"

  export CONTRACT_ID
}

# ── Initialize ─────────────────────────────────────────────────────────────────────

initialize() {
  section "Initialize Contract"

  if [ -z "${CONTRACT_ID:-}" ]; then
    if [ -f "$CONTRACT_ID_FILE" ]; then
      # Safer sourcing: disable -e temporarily
      set +e; source "$CONTRACT_ID_FILE" 2>/dev/null; set -e
    fi
    if [ -z "${CONTRACT_ID:-}" ]; then
      echo -e "${GREEN}Enter contract ID:${RESET}"
      read -r CONTRACT_ID
    fi
  fi

  echo "   Contract:    $CONTRACT_ID"
  echo ""

  # Admin address
  if [ -z "${ADMIN_ADDRESS:-}" ]; then
    DEFAULT_ADMIN=$(soroban keys address "$DEPLOYER" 2>/dev/null || echo "")
    echo -e "${GREEN}Admin address (default: $DEFAULT_ADMIN):${RESET}"
    read -r ADMIN_ADDRESS
    ADMIN_ADDRESS=${ADMIN_ADDRESS:-$DEFAULT_ADMIN}
  fi

  # Platform wallet
  if [ -z "${PLATFORM_WALLET:-}" ]; then
    echo -e "${GREEN}Platform fee wallet address (default: same as admin):${RESET}"
    read -r PLATFORM_WALLET
    PLATFORM_WALLET=${PLATFORM_WALLET:-$ADMIN_ADDRESS}
  fi

  # Platform fee
  echo -e "${GREEN}Platform fee in basis points (default: 250 = 2.5%):${RESET}"
  read -r FEE_BPS
  FEE_BPS=${FEE_BPS:-250}

  # Max royalty
  echo -e "${GREEN}Max royalty in basis points (default: 1500 = 15%):${RESET}"
  read -r MAX_ROYALTY
  MAX_ROYALTY=${MAX_ROYALTY:-1500}

  echo ""
  echo "   Summary:"
  echo "   ─────────────────────────────────────"
  echo "   Admin:           $ADMIN_ADDRESS"
  echo "   Platform Wallet: $PLATFORM_WALLET"
  echo "   Platform Fee:    $FEE_BPS bps"
  echo "   Max Royalty:     $MAX_ROYALTY bps"
  echo ""

  info "Calling initialize..."
  soroban contract invoke \
    --id "$CONTRACT_ID" \
    --source-account "$DEPLOYER" \
    --network "$NETWORK" \
    --fee 100000 \
    -- \
    initialize \
    --admin "$ADMIN_ADDRESS" \
    --default_platform_fee_bps "$FEE_BPS" \
    --max_royalty_bps "$MAX_ROYALTY" \
    --platform_wallet "$PLATFORM_WALLET"

  success "Contract initialized!"
}

# ── Verify ─────────────────────────────────────────────────────────────────────────

verify() {
  section "Verification"

  if [ -z "${CONTRACT_ID:-}" ]; then
    if [ -f "$CONTRACT_ID_FILE" ]; then
      set +e; source "$CONTRACT_ID_FILE" 2>/dev/null; set -e
    fi
    if [ -z "${CONTRACT_ID:-}" ]; then
      echo -e "${GREEN}Enter contract ID to verify:${RESET}"
      read -r CONTRACT_ID
    fi
  fi

  echo "   Contract: $CONTRACT_ID"
  echo "   Network:  $NETWORK"
  echo ""

  # Check auction count
  info "Checking auction count..."
  AUCTION_COUNT=$(soroban contract invoke \
    --id "$CONTRACT_ID" \
    --source-account "$DEPLOYER" \
    --network "$NETWORK" \
    -- \
    get_auction_count 2>/dev/null || echo "N/A")
  success "Auction count: $AUCTION_COUNT"

  # Check paused state
  info "Checking platform state..."
  IS_PAUSED=$(soroban contract invoke \
    --id "$CONTRACT_ID" \
    --source-account "$DEPLOYER" \
    --network "$NETWORK" \
    -- \
    is_paused 2>/dev/null || echo "N/A")
  success "Platform paused: $IS_PAUSED"

  echo ""

  # Check recent events (portable grep, no -P flag)
  info "Recent events (last 100 ledgers)..."
  LEDGER=$(soroban ledger latest --network "$NETWORK" 2>/dev/null | grep -Eo '[0-9]+' | head -n 1 || echo 0)
  START=$((LEDGER > 100 ? LEDGER - 100 : 0))
  soroban events \
    --start-ledger "$START" \
    --filter "{\"type\":\"contract\",\"contractIds\":[\"$CONTRACT_ID\"]}" \
    --limit 10 \
    --network "$NETWORK" \
    --output pretty 2>/dev/null || warn "No events found (expected for a new contract)"

  echo ""
  success "Verification complete!"
}

# ── Demo ───────────────────────────────────────────────────────────────────────────

run_demo() {
  section "End-to-End Demo"

  if [ -z "${CONTRACT_ID:-}" ]; then
    if [ -f "$CONTRACT_ID_FILE" ]; then
      set +e; source "$CONTRACT_ID_FILE" 2>/dev/null; set -e
    fi
    if [ -z "${CONTRACT_ID:-}" ]; then
      echo -e "${GREEN}Enter contract ID for demo:${RESET}"
      read -r CONTRACT_ID
    fi
  fi

  echo "   Contract: $CONTRACT_ID"
  echo ""

  SELLER=$(soroban keys address "$DEPLOYER")
  NOW=$(date +%s)
  START=$((NOW + 60))
  END=$((NOW + 3660))

  info "Creating English auction..."
  info "   Seller: $SELLER"
  info "   Reserve: 100 XLM (1000000000 stroops)"
  info "   Royalty: 5% (500 bps)"
  info "   Duration: ~1 hour"

  soroban contract invoke \
    --id "$CONTRACT_ID" \
    --source-account "$DEPLOYER" \
    --network "$NETWORK" \
    --fee 100000 \
    -- \
    create_auction \
    --seller "$SELLER" \
    --original_creator "$SELLER" \
    --format '{"English": null}' \
    --item "{\"Digital\": {\"nft_contract\": \"$SELLER\", \"token_id\": 1}}" \
    --payment_token "$SELLER" \
    --reserve_price 1000000000 \
    --royalty_bps 500 \
    --start_time "$START" \
    --end_time "$END" \
    --metadata_uri 'ipfs://bafybeidemo' \
    --min_increment 10000000 \
    --start_price 0 \
    --price_decay_per_second 0 \
    --commit_deadline 0 \
    --reveal_deadline 0

  echo ""
  success "Demo auction created (ID: 0)!"
  echo ""
  info "Verify with: make verify"
  info "Or check events: make verify-events"
  echo ""
}

# ── Generate .env snippet ──────────────────────────────────────────────────────────

generate_env_snippet() {
  if [ -n "${CONTRACT_ID:-}" ]; then
    echo ""
    section "Next Steps"
    echo ""
    echo -e "   ${BOLD}Add this to your frontend/.env.local:${RESET}"
    echo ""
    echo -e "   ${CYAN}NEXT_PUBLIC_CONTRACT_ID=$CONTRACT_ID${RESET}"
    echo ""
    echo -e "   ${BOLD}Add this to your backend/.env:${RESET}"
    echo ""
    echo -e "   ${CYAN}CONTRACT_ID=$CONTRACT_ID${RESET}"
    echo ""
    echo -e "   ${BOLD}Then start the backend and frontend:${RESET}"
    echo ""
    echo -e "   cd backend && npm run dev"
    echo -e "   cd frontend && npm run dev"
    echo ""
  fi
}

# ── Main ───────────────────────────────────────────────────────────────────────────

main() {
  parse_args "$@"
  banner

  if [ "$VERIFY_ONLY" = true ]; then
    setup_identity
    verify
    exit 0
  fi

  if [ "$DEMO_ONLY" = true ]; then
    setup_identity
    run_demo
    exit 0
  fi

  # Full deployment flow
  check_prerequisites
  setup_identity
  build_and_test
  optimize_wasm
  deploy
  initialize
  verify
  generate_env_snippet

  echo ""
  echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════════╗${RESET}"
  echo -e "${BOLD}${GREEN}║   🎉 Deployment complete!                    ║${RESET}"
  echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════════╝${RESET}"
  echo ""
}

main "$@"
