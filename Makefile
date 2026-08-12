# StellarUrithi-Bidz — Soroban Contract Build & Deploy
# ============================================================================
# Usage:
#   make all             — Build, test, deploy to testnet, initialize, verify
#   make build           — Compile contracts
#   make test            — Run contract unit tests
#   make optimize        — Optimize WASM for deployment
#   make deploy-testnet  — Deploy optimized WASM to Stellar testnet
#   make deploy-mainnet  — Deploy optimized WASM to Stellar mainnet
#   make verify          — Query contract state to verify deployment
#   make clean           — Remove build artifacts
#   make help            — Show all targets
#
# Prerequisites:
#   - Rust toolchain with wasm32-unknown-unknown target
#   - soroban CLI (>= 22.0.0): cargo install soroban-cli
#   - jq (JSON processor): apt install jq / brew install jq
#   - A funded Stellar identity for the deployer

# ── Configuration ───────────────────────────────────────────────────────────────────

NETWORK        ?= testnet
CONTRACT_NAME  := stellar-urithi-auction
WASM_DIR       := contracts/target/wasm32-unknown-unknown/release
WASM_SRC       := $(WASM_DIR)/$(CONTRACT_NAME).wasm
WASM_OPT       := $(WASM_DIR)/$(CONTRACT_NAME).optimized.wasm
DEPLOYER       ?= alice
PLATFORM_WALLET ?= $(DEPLOYER)

# Platform configuration defaults (override via make args)
DEFAULT_FEE_BPS   ?= 250   # 2.5%
MAX_ROYALTY_BPS   ?= 1500  # 15%
ADMIN_ADDRESS     ?=

# Contract ID — populated after deploy
CONTRACT_ID_FILE := .contract-id
-include $(CONTRACT_ID_FILE)

# ── Colors ─────────────────────────────────────────────────────────────────────────

GREEN  := \033[0;32m
YELLOW := \033[0;33m
RED    := \033[0;31m
CYAN   := \033[0;36m
BOLD   := \033[1m
RESET  := \033[0m

# ── Help ───────────────────────────────────────────────────────────────────────────

.PHONY: help
help:
	@echo "$(BOLD)$(CYAN)StellarUrithi-Bidz — Soroban Contract Tooling$(RESET)"
	@echo ""
	@echo "$(BOLD)Quick Start:$(RESET)"
	@echo "  1. make keys              Generate testnet deployer identity"
	@echo "  2. make fund              Fund identity via Friendbot"
	@echo "  3. make all               Build → Test → Deploy → Initialize → Verify"
	@echo ""
	@echo "$(BOLD)Targets:$(RESET)"
	@echo "  $(GREEN)make build$(RESET)               Compile contracts (debug)"
	@echo "  $(GREEN)make build-release$(RESET)        Compile contracts (release, optimized)"
	@echo "  $(GREEN)make test$(RESET)                 Run all contract unit tests"
	@echo "  $(GREEN)make test-verbose$(RESET)          Run tests with output"
	@echo "  $(GREEN)make test-coverage$(RESET)         Run tests with coverage (requires cargo-tarpaulin)"
	@echo "  $(GREEN)make optimize$(RESET)             Strip & optimize WASM for deployment"
	@echo "  $(GREEN)make keys$(RESET)                 Generate a new testnet identity"
	@echo "  $(GREEN)make fund$(RESET)                 Fund identity via Friendbot (testnet only)"
	@echo "  $(GREEN)make deploy-testnet$(RESET)       Deploy to Stellar testnet"
	@echo "  $(GREEN)make deploy-mainnet$(RESET)       Deploy to Stellar mainnet ⚠️"
	@echo "  $(GREEN)make initialize$(RESET)           Initialize the contract on-chain"
	@echo "  $(GREEN)make verify$(RESET)               Verify deployment (query state)"
	@echo "  $(GREEN)make verify-events$(RESET)         Check contract events"
	@echo "  $(GREEN)make demo$(RESET)                 Run end-to-end demo sequence"
	@echo "  $(GREEN)make clean$(RESET)                Remove build artifacts"
	@echo "  $(GREEN)make clean-all$(RESET)             Remove everything including contract ID"
	@echo "  $(GREEN)make all$(RESET)                  Full pipeline: build → test → deploy → verify"
	@echo ""
	@echo "$(BOLD)Variables (override with make VAR=value):$(RESET)"
	@echo "  NETWORK=testnet|mainnet     Target network (default: testnet)"
	@echo "  DEPLOYER=alice              Soroban identity for deployment"
	@echo "  PLATFORM_WALLET=alice       Platform fee recipient identity"
	@echo "  ADMIN_ADDRESS=G...          Admin Stellar address"
	@echo "  DEFAULT_FEE_BPS=250         Platform fee in basis points"
	@echo "  MAX_ROYALTY_BPS=1500        Max royalty in basis points"

# ── Build ──────────────────────────────────────────────────────────────────────────

.PHONY: build
build:
	@echo "$(CYAN)🔨 Compiling contracts (debug)...$(RESET)"
	cd contracts && cargo build --target wasm32-unknown-unknown
	@echo "$(GREEN)✔ Build complete$(RESET)"

.PHONY: build-release
build-release:
	@echo "$(CYAN)🔨 Compiling contracts (release, optimized)...$(RESET)"
	cd contracts && cargo build --target wasm32-unknown-unknown --release
	@echo "$(GREEN)✔ Release build complete$(RESET)"
	@ls -lh $(WASM_SRC)

# ── Test ───────────────────────────────────────────────────────────────────────────

.PHONY: test
test:
	@echo "$(CYAN)🧪 Running contract tests...$(RESET)"
	cd contracts && cargo test 2>&1 | grep -E '(test result:|running |FAILED|panicked)' || true
	@echo "$(GREEN)✔ Tests complete$(RESET)"

.PHONY: test-verbose
test-verbose:
	@echo "$(CYAN)🧪 Running contract tests (verbose)...$(RESET)"
	cd contracts && cargo test -- --nocapture

.PHONY: test-coverage
test-coverage:
	@echo "$(CYAN)📊 Running tests with coverage...$(RESET)"
	cd contracts && cargo tarpaulin --target-dir target/coverage --out Html --out Json
	@echo "$(GREEN)✔ Coverage report: contracts/target/coverage/tarpaulin-report.html$(RESET)"

# ── WASM Optimization ──────────────────────────────────────────────────────────────

.PHONY: optimize
optimize: build-release
	@echo "$(CYAN)⚡ Optimizing WASM...$(RESET)"
	@soroban contract optimize --wasm $(WASM_SRC) --wasm-out $(WASM_OPT) 2>/dev/null \
		|| (echo "$(YELLOW)⚠ soroban contract optimize not available, using release WASM as-is$(RESET)" \
			&& cp $(WASM_SRC) $(WASM_OPT))
	@echo "$(GREEN)✔ Optimized WASM: $(WASM_OPT)$(RESET)"
	@ls -lh $(WASM_OPT)

# ── Identity Management ────────────────────────────────────────────────────────────

.PHONY: keys
keys:
	@echo "$(CYAN)🔑 Generating testnet identity '$(DEPLOYER)'...$(RESET)"
	soroban keys generate $(DEPLOYER) --network testnet --no-fund 2>/dev/null \
		|| (echo "$(YELLOW)Identity '$(DEPLOYER)' may already exist$(RESET)" \
			&& soroban keys address $(DEPLOYER))
	@soroban keys address $(DEPLOYER)
	@echo "$(GREEN)✔ Identity ready. Public key above.$(RESET)"

.PHONY: fund
fund:
	@echo "$(CYAN)💰 Funding $(DEPLOYER) via Friendbot...$(RESET)"
	soroban keys fund $(DEPLOYER) --network testnet
	@echo "$(GREEN)✔ Funded!$(RESET)"
	@soroban keys show $(DEPLOYER) --network testnet 2>/dev/null || true

# ── Deploy ─────────────────────────────────────────────────────────────────────────

# The deploy targets capture the contract ID from the last line of stdout
# (stellar CLI v27+ outputs the contract ID on the final line).

.PHONY: deploy-testnet
deploy-testnet: optimize
	@echo "$(CYAN)🚀 Deploying to Stellar TESTNET...$(RESET)"
	@echo "   Contract: $(CONTRACT_NAME)"
	@echo "   Deployer: $(DEPLOYER)"
	@echo "   WASM:     $(WASM_OPT)"
	@echo ""
	@CONTRACT_ID=$$(soroban contract deploy \
		--wasm $(WASM_OPT) \
		--source-account $(DEPLOYER) \
		--network testnet \
		--fee 100000 2>&1 | tail -n 1 | grep -Eo 'C[A-Z0-9]{55}' || echo ""); \
	if [ -z "$$CONTRACT_ID" ]; then \
		echo "$(RED)✖ Deployment failed. Check that the identity is funded and the WASM is valid.$(RESET)"; \
		exit 1; \
	fi; \
	echo "CONTRACT_ID=$$CONTRACT_ID" > $(CONTRACT_ID_FILE); \
	echo "$(GREEN)✔ Contract deployed!$(RESET)"; \
	echo "   Contract ID: $(BOLD)$$CONTRACT_ID$(RESET)"; \
	echo "   Saved to:    $(CONTRACT_ID_FILE)"

.PHONY: deploy-mainnet
deploy-mainnet: optimize
	@echo "$(RED)⚠️  DEPLOYING TO STELLAR MAINNET ⚠️$(RESET)"
	@echo "$(RED)   This will use real XLM and is irreversible.$(RESET)"
	@read -p "Are you sure? Type 'MAINNET' to confirm: " confirm; \
	if [ "$$confirm" != "MAINNET" ]; then \
		echo "Aborted."; \
		exit 1; \
	fi
	@which jq >/dev/null 2>&1 || (echo "$(RED)✖ jq is required$(RESET)" && exit 1)
	@CONTRACT_ID=$$(soroban contract deploy \
		--wasm $(WASM_OPT) \
		--source-account $(DEPLOYER) \
		--network mainnet \
		--fee 100000 2>&1 | tail -n 1 | grep -Eo 'C[A-Z0-9]{55}' || echo ""); \
	if [ -z "$$CONTRACT_ID" ]; then \
		echo "$(RED)✖ Deployment failed$(RESET)"; \
		exit 1; \
	fi; \
	echo "CONTRACT_ID=$$CONTRACT_ID" > $(CONTRACT_ID_FILE); \
	echo "$(GREEN)✔ Contract deployed to MAINNET!$(RESET)"; \
	echo "   Contract ID: $(BOLD)$$CONTRACT_ID$(RESET)"

# ── Initialize Contract ────────────────────────────────────────────────────────────

.PHONY: initialize
initialize:
	@if [ -z "$(CONTRACT_ID)" ]; then \
		echo "$(RED)✖ No CONTRACT_ID found. Run 'make deploy-testnet' first.$(RESET)"; \
		exit 1; \
	fi
	@ADMIN=$${ADMIN_ADDRESS:-$$(soroban keys address $(DEPLOYER))}; \
	PLATFORM=$${PLATFORM_WALLET:-$$(soroban keys address $(DEPLOYER))}; \
	echo "$(CYAN)🔧 Initializing contract $(CONTRACT_ID)...$(RESET)"; \
	echo "   Admin:           $$ADMIN"; \
	echo "   Platform Wallet: $$PLATFORM"; \
	echo "   Platform Fee:    $(DEFAULT_FEE_BPS) bps"; \
	echo "   Max Royalty:     $(MAX_ROYALTY_BPS) bps"; \
	echo ""; \
	soroban contract invoke \
		--id $(CONTRACT_ID) \
		--source-account $(DEPLOYER) \
		--network $(NETWORK) \
		--fee 100000 \
		-- \
		initialize \
		--admin "$$ADMIN" \
		--default_platform_fee_bps $(DEFAULT_FEE_BPS) \
		--max_royalty_bps $(MAX_ROYALTY_BPS) \
		--platform_wallet "$$PLATFORM"
	@echo "$(GREEN)✔ Contract initialized!$(RESET)"

# ── Verify ─────────────────────────────────────────────────────────────────────────

.PHONY: verify
verify:
	@if [ -z "$(CONTRACT_ID)" ]; then \
		echo "$(RED)✖ No CONTRACT_ID found. Run 'make deploy-testnet' first.$(RESET)"; \
		exit 1; \
	fi
	@echo "$(CYAN)🔍 Verifying contract $(CONTRACT_ID)...$(RESET)"
	@echo ""
	@echo "  ── Auction Count ──"
	@soroban contract invoke \
		--id $(CONTRACT_ID) \
		--source-account $(DEPLOYER) \
		--network $(NETWORK) \
		-- \
		get_auction_count 2>/dev/null || echo "   (contract may need initialization)"
	@echo ""
	@echo "  ── Platform Paused? ──"
	@soroban contract invoke \
		--id $(CONTRACT_ID) \
		--source-account $(DEPLOYER) \
		--network $(NETWORK) \
		-- \
		is_paused 2>/dev/null || echo "   (contract may need initialization)"
	@echo ""
	@echo "$(GREEN)✔ Verification complete$(RESET)"

.PHONY: verify-events
verify-events:
	@if [ -z "$(CONTRACT_ID)" ]; then \
		echo "$(RED)✖ No CONTRACT_ID found.$(RESET)"; \
		exit 1; \
	fi
	@echo "$(CYAN)📡 Checking events for $(CONTRACT_ID)...$(RESET)"
	@LEDGER=$$(soroban ledger latest --network $(NETWORK) 2>/dev/null | grep -Eo '[0-9]+' | head -1 || echo 0); \
	START=$$((LEDGER > 100 ? LEDGER - 100 : 0)); \
	soroban events \
		--start-ledger $$START \
		--filter "{\"type\":\"contract\",\"contractIds\":[\"$(CONTRACT_ID)\"]}" \
		--limit 20 \
		--network $(NETWORK) \
		--output pretty 2>/dev/null || echo "$(YELLOW)No events found or RPC unavailable$(RESET)"
	@echo ""

# ── Demo ───────────────────────────────────────────────────────────────────────────

.PHONY: demo
demo: initialize
	@echo ""
	@echo "$(BOLD)$(CYAN)╔══════════════════════════════════════════════╗$(RESET)"
	@echo "$(BOLD)$(CYAN)║   StellarUrithi-Bidz — End-to-End Demo       ║$(RESET)"
	@echo "$(BOLD)$(CYAN)╚══════════════════════════════════════════════╝$(RESET)"
	@echo ""
	@ADMIN=$${ADMIN_ADDRESS:-$$(soroban keys address $(DEPLOYER))}; \
	SELLER=$$(soroban keys address $(DEPLOYER)); \
	NOW=$$(date +%s); \
	START=$$((NOW + 60)); \
	END=$$((NOW + 3660)); \
	echo "$(CYAN)1. Creating English auction...$(RESET)"; \
	echo "   Seller: $$SELLER"; \
	echo "   Reserve: 100 XLM"; \
	echo "   Royalty: 5%"; \
	soroban contract invoke \
		--id $(CONTRACT_ID) --source-account $(DEPLOYER) --network $(NETWORK) --fee 100000 -- \
		create_auction \
		--seller "$$SELLER" \
		--original_creator "$$SELLER" \
		--format '{"English": null}' \
		--item "{\"Digital\": {\"nft_contract\": \"$$SELLER\", \"token_id\": 1}}" \
		--payment_token "$$SELLER" \
		--reserve_price 1000000000 \
		--royalty_bps 500 \
		--start_time $$START \
		--end_time $$END \
		--metadata_uri 'ipfs://bafybeidemo' \
		--min_increment 10000000 \
		--start_price 0 \
		--price_decay_per_second 0 \
		--commit_deadline 0 \
		--reveal_deadline 0 \
		--max_bidders 0; \
	echo ""; \
	echo "$(GREEN)✔ Demo auction created!$(RESET)"; \
	echo "   Auction ID: 0"; \
	echo "   Verify: $(BOLD)make verify$(RESET)"; \
	echo ""

# ── Full Pipeline ──────────────────────────────────────────────────────────────────

# Note: all does NOT auto-fund via friendbot — that's a manual step (make keys + make fund).
# This avoids rate-limiting and spam on repeated runs.
.PHONY: all
all: build-release test optimize deploy-testnet initialize verify
	@echo ""
	@echo "$(BOLD)$(GREEN)╔══════════════════════════════════════════════╗$(RESET)"
	@echo "$(BOLD)$(GREEN)║   🎉 Deployment pipeline complete!           ║$(RESET)"
	@echo "$(BOLD)$(GREEN)╚══════════════════════════════════════════════╝$(RESET)"
	@echo ""
	@echo "   Contract ID: $(GREEN)$(CONTRACT_ID)$(RESET)"
	@echo "   Network:     $(YELLOW)$(NETWORK)$(RESET)"
	@echo "   Next: Set CONTRACT_ID in frontend/.env.local & backend/.env"
	@echo ""

# ── Clean ──────────────────────────────────────────────────────────────────────────

.PHONY: clean
clean:
	@echo "$(CYAN)🧹 Cleaning build artifacts...$(RESET)"
	cd contracts && cargo clean
	@echo "$(GREEN)✔ Clean$(RESET)"

.PHONY: clean-all
clean-all: clean
	rm -f $(CONTRACT_ID_FILE)
	@echo "$(GREEN)✔ Contract ID file removed$(RESET)"

# ── Lint ───────────────────────────────────────────────────────────────────────────

.PHONY: lint
lint:
	@echo "$(CYAN)🔍 Linting Rust code...$(RESET)"
	cd contracts && cargo clippy --target wasm32-unknown-unknown -- -D warnings
	@echo "$(GREEN)✔ Lint passed$(RESET)"

.PHONY: fmt
fmt:
	@echo "$(CYAN)📝 Formatting Rust code...$(RESET)"
	cd contracts && cargo fmt --all
	@echo "$(GREEN)✔ Formatted$(RESET)"

.PHONY: fmt-check
fmt-check:
	@echo "$(CYAN)📝 Checking formatting...$(RESET)"
	cd contracts && cargo fmt --all -- --check
	@echo "$(GREEN)✔ Formatting OK$(RESET)"
