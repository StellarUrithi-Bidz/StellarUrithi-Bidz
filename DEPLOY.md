# 🚀 Deploying StellarUrithi-Bidz

This document provides step-by-step instructions for deploying the StellarUrithi-Bidz protocol smart contracts, backend indexer, and web clients to the Stellar Testnet and Mainnet.

---

## 1. Prerequisites

Ensure you have the required toolchains installed:

```bash
# 1. Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 2. Add wasm32 compilation target
rustup target add wasm32-unknown-unknown

# 3. Install Stellar CLI (formerly soroban-cli v22+)
cargo install --locked stellar-cli --features opt

# 4. Install Node.js (v20 LTS recommended) and Docker
node --version
docker --version
```

---

## 2. Smart Contract Deployment

### Step 1: Run Unit Tests
```bash
cd contracts
cargo test
# All 19 tests covering pull refunds, anti-sniping, slippage, and storage must pass.
```

### Step 2: Build & Optimize Release WASM
```bash
cargo build --target wasm32-unknown-unknown --release

# Optimize WASM size
stellar contract optimize \
  --wasm target/wasm32-unknown-unknown/release/stellar_urithi_auction.wasm
```

### Step 3: Configure Deployment Identity
```bash
# Generate keypair (Testnet)
stellar keys generate deployer --network testnet

# Fund keypair via Friendbot
stellar keys fund deployer --network testnet
```

### Step 4: Deploy WASM to Stellar
```bash
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/stellar_urithi_auction.optimized.wasm \
  --source deployer \
  --network testnet
# Outputs: Contract Address (e.g., CB... or CD...)
```

### Step 5: Initialize Platform Configuration
```bash
CONTRACT_ID="<DEPLOYED_CONTRACT_ID>"
ADMIN_ADDRESS=$(stellar keys address deployer)

stellar contract invoke \
  --id "$CONTRACT_ID" \
  --source deployer \
  --network testnet \
  -- initialize \
  --admin "$ADMIN_ADDRESS" \
  --default_platform_fee_bps 250 \
  --max_royalty_bps 1500 \
  --platform_wallet "$ADMIN_ADDRESS"
```

### Step 6: Verify Deployment
```bash
# Query contract pause status (should return false)
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --source deployer \
  --network testnet \
  -- is_paused

# Query initial auction counter (should return 0)
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --source deployer \
  --network testnet \
  -- get_auction_count
```

---

## 3. Backend & Services Configuration

Set environment variables in `backend/.env`:

```env
PORT=4000
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=stellar_urithi_bidz
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_secure_password
STELLAR_RPC_URL=https://soroban-testnet.stellar.org
CONTRACT_ID=<DEPLOYED_CONTRACT_ID>
FRONTEND_URL=http://localhost:3000
POLL_INTERVAL_MS=5000
```

Start the backend:
```bash
cd backend
npm ci
npm run build
npm start
```

---

## 4. Frontend & Custodian Portal Configuration

In `frontend/.env.local`:
```env
NEXT_PUBLIC_CONTRACT_ID=<DEPLOYED_CONTRACT_ID>
NEXT_PUBLIC_STELLAR_NETWORK=testnet
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_WS_URL=http://localhost:4000
NEXT_PUBLIC_PINATA_GATEWAY=https://gateway.pinata.cloud
PINATA_JWT=your_pinata_jwt_token
```

In `custodian-portal/.env.local`:
```env
NEXT_PUBLIC_CONTRACT_ID=<DEPLOYED_CONTRACT_ID>
NEXT_PUBLIC_STELLAR_NETWORK=testnet
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_PINATA_GATEWAY=https://gateway.pinata.cloud
PINATA_JWT=your_pinata_jwt_token
```

Run both services:
```bash
# Frontend
cd frontend && npm run build && npm start

# Custodian Portal
cd custodian-portal && npm run build && npm start
```

---

## 5. Mainnet Deployment Checklist

When deploying to Stellar Public Network (Mainnet):
- [ ] Use a hardware wallet or multi-sig account for the Admin identity.
- [ ] Ensure `max_royalty_bps` and `default_platform_fee_bps` parameters are aligned with platform governance.
- [ ] Set `POSTGRES_SSL=true` and `NODE_ENV=production` on backend containers.
- [ ] Set `NEXT_PUBLIC_STELLAR_NETWORK=mainnet` and RPC URL to `https://soroban.stellar.org`.
- [ ] Verify contract WASM byte code with reproducible builds.
