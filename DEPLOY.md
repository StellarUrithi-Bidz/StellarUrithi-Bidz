# 🚀 Deploying StellarUrithi-Bidz to Stellar Testnet

## Quick Deploy (One Command)

```bash
./deploy.sh
```

This interactive wizard will:
1. Check prerequisites (Rust, soroban CLI v22+, wasm32 target, jq)
2. Generate/fund a testnet identity
3. Build & test contracts
4. Optimize WASM
5. Deploy to testnet
6. Initialize contract
7. Verify deployment
8. Save contract ID for frontend/backend

## Prerequisites

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Add wasm target
rustup target add wasm32-unknown-unknown

# Install soroban CLI (v22+)
cargo install soroban-cli

# Install jq
sudo apt install jq  # Linux
brew install jq      # macOS
```

## Manual Deployment Steps

### 1. Build Contracts
```bash
cd contracts
cargo build --target wasm32-unknown-unknown --release
cargo test  # All 16 tests must pass
```

### 2. Setup Identity
```bash
soroban keys generate alice --network testnet --no-fund
soroban keys fund alice --network testnet
```

### 3. Deploy Contract
```bash
soroban contract deploy \
  --wasm contracts/target/wasm32-unknown-unknown/release/stellar_urithi_auction.wasm \
  --source alice \
  --network testnet \
  --fee 100000
```

### 4. Initialize
```bash
CONTRACT_ID="<from-step-3>"
ADMIN=$(soroban keys address alice)

soroban contract invoke \
  --id "$CONTRACT_ID" \
  --source alice \
  --network testnet \
  --fee 100000 \
  -- initialize \
  --admin "$ADMIN" \
  --default_platform_fee_bps 250 \
  --max_royalty_bps 1500 \
  --platform_wallet "$ADMIN"
```

### 5. Verify
```bash
soroban contract invoke \
  --id "$CONTRACT_ID" \
  --source alice \
  --network testnet \
  -- get_auction_count

soroban contract invoke \
  --id "$CONTRACT_ID" \
  --source alice \
  --network testnet \
  -- is_paused
```

## Running the E2E Demo

```bash
./deploy.sh --demo
```

This creates an English auction with:
- Reserve: 100 XLM
- Royalty: 5%
- Duration: ~1 hour

## Environment Variables After Deploy

```bash
# frontend/.env.local
NEXT_PUBLIC_CONTRACT_ID=<your-contract-id>
NEXT_PUBLIC_STELLAR_NETWORK=testnet

# backend/.env
CONTRACT_ID=<your-contract-id>
```

## Docker Quick Start After Deploy

```bash
export CONTRACT_ID=<your-contract-id>
export PINATA_JWT=<your-pinata-jwt>
docker compose up --build
```

- **Frontend:** http://localhost:3000
- **Custodian Portal:** http://localhost:3001
- **Backend API:** http://localhost:4000/api/health

## Contract Verification on Stellar Expert

Visit: `https://stellar.expert/explorer/testnet/contract/<CONTRACT_ID>`

## Mainnet Deployment

⚠️ **Use with extreme caution — this uses REAL XLM.**

```bash
./deploy.sh --mainnet
```

## Test Results Summary

| Layer | Tests | Status |
|-------|-------|--------|
| Contracts | 16 | ✅ All pass |
| Backend | 17 | ✅ All pass |
| Frontend | 106 | ✅ All pass |
| **Total** | **139** | **✅** |

Built with ❤️ for African art and culture. Powered by Stellar.
