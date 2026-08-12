# StellarUrithi-Bidz  🔨

<div align="center">

**On-Chain Auction Protocol for African Art & Cultural Artifacts on Stellar**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Stellar](https://img.shields.io/badge/Stellar-Soroban-7B61FF)](https://stellar.org)
[![Rust](https://img.shields.io/badge/Rust-soroban--sdk-orange)](https://soroban.stellar.org)

</div>

---

## Overview

**StellarUrithi-Bidz** is an open-source, on-chain auction protocol purpose-built for African art and cultural artifacts. Whether digital (NFTs) or physical (custodian-attested), every item is auctioned transparently on Stellar with escrowed bids and automatic royalty distribution.

### Key Features

- **Three Auction Formats**: English (ascending), Dutch (descending), and Sealed-Bid (commit-reveal)
- **On-Chain Escrow**: All bids are locked in the contract until auction resolution — trustless and transparent
- **Automatic Royalties**: Original creators receive their royalty on every hammer sale — no manual intervention
- **Physical-Item Bridge**: Custodians/galleries attest to physical item possession before an auction opens
- **Real-Time Updates**: WebSocket-powered live bid feed and auction state changes
- **Low Fees**: Settled on Stellar for sub-second, near-zero-fee finality

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Next.js 14)                      │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌───────────────┐  │
│  │ Auctions │  │  Create  │  │  My Bids  │  │  Admin Panel  │  │
│  └──────────┘  └──────────┘  └───────────┘  └───────────────┘  │
│                         │ Freighter Wallet                       │
└─────────────────────────┼──────────────────────────────────────┘
                          │
┌─────────────────────────┼──────────────────────────────────────┐
│                  BACKEND INDEXER (Node.js)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────┐   │
│  │ Event Indexer│  │  WebSocket   │  │    REST API         │   │
│  │ (Soroban RPC)│  │  (Socket.IO) │  │  (Express)          │   │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬──────────┘   │
│         │                 │                      │               │
│         └─────────────────┴──────────────────────┘               │
│                           │ PostgreSQL                           │
└───────────────────────────┼─────────────────────────────────────┘
                            │
┌───────────────────────────┼─────────────────────────────────────┐
│                   STELLAR SOROBAN                                │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                 UrithiAuction Contract                     │  │
│  │  ┌──────────┐  ┌──────────┐  ┌────────────┐  ┌─────────┐ │  │
│  │  │ English  │  │  Dutch   │  │ Sealed-Bid │  │ Escrow  │ │  │
│  │  │  Module  │  │  Module  │  │   Module   │  │ Module  │ │  │
│  │  └──────────┘  └──────────┘  └────────────┘  └─────────┘ │  │
│  │                    ┌──────────────┐                        │  │
│  │                    │Royalty Split │                        │  │
│  │                    │   Module     │                        │  │
│  │                    └──────────────┘                        │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                    CUSTODIAN PORTAL (Next.js)                     │
│  Physical-item attestation — upload IPFS docs, verify possession │
└──────────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
StellarUrithi-Bidz/
├── contracts/                    # Soroban Smart Contracts (Rust)
│   ├── Cargo.toml               # Workspace root
│   └── auction/
│       ├── Cargo.toml
│       └── src/
│           ├── lib.rs           # Contract entry point
│           ├── types.rs         # Data structures & enums
│           ├── english.rs       # English auction logic
│           ├── dutch.rs         # Dutch auction logic
│           ├── sealed_bid.rs    # Sealed-bid logic
│           ├── escrow.rs        # Fund locking & refunds
│           ├── royalty.rs       # Royalty calculation & distribution
│           ├── events.rs        # Event emission helpers
│           └── test.rs          # Comprehensive test suite
│
├── backend/                     # Indexer & API Server
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts             # Main entry point
│       ├── db/
│       │   └── index.ts         # PostgreSQL connection & queries
│       ├── indexer/
│       │   └── event_indexer.ts # Stellar event poller
│       ├── ws/
│       │   └── socket_server.ts # WebSocket manager
│       ├── routes/
│       │   └── auctions.ts      # REST API endpoints
│       └── services/
│           └── logger.ts        # Winston logger
│
├── frontend/                    # Main Web Application
│   ├── package.json
│   ├── next.config.js
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   └── src/
│       ├── app/
│       │   ├── layout.tsx       # Root layout
│       │   ├── page.tsx         # Home — auction listings
│       │   ├── globals.css      # Global styles
│       │   ├── auctions/[id]/   # Auction detail page
│       │   ├── create/          # Create auction page
│       │   ├── my-bids/         # Bid history page
│       │   └── admin/           # Admin panel
│       ├── components/
│       │   ├── auction/
│       │   │   └── AuctionCard.tsx
│       │   └── layout/
│       │       ├── Navbar.tsx
│       │       └── Footer.tsx
│       ├── hooks/
│       │   └── useWebSocket.ts  # Real-time update hooks
│       ├── lib/
│       │   ├── api.ts           # Backend API client
│       │   └── stellar.ts       # Stellar/Soroban helpers
│       └── providers/
│           └── wallet.tsx       # Freighter wallet provider
│
├── custodian-portal/            # Custodian Admin App
│   ├── package.json
│   └── src/
│       └── app/
│           ├── layout.tsx
│           ├── globals.css
│           └── page.tsx         # Attestation dashboard
│
└── README.md
```

---

## Getting Started

### Prerequisites

- **Docker** & **Docker Compose** (for one-command local dev)
- **Rust** (1.75+) with `wasm32-unknown-unknown` target (for contracts)
- **Stellar CLI** (>= 22.0.0): `curl -fsSL https://github.com/stellar/stellar-cli/raw/main/install.sh | sh` or `cargo install --locked stellar-cli`
  - *Note: The CLI was renamed from `soroban-cli` to `stellar-cli` in v27. Both `soroban` and `stellar` commands work.*
- **jq** (JSON processor): `brew install jq` or `apt install jq`
- **Node.js** 18+ (if running services directly)
- **Freighter Wallet** browser extension
- **Pinata** account (for IPFS storage)

### Docker Quick Start (recommended)

One command starts the full stack — PostgreSQL, backend, frontend, and custodian portal:

```bash
# Start all services
docker compose up --build

# Start in detached mode
docker compose up --build -d

# View logs
docker compose logs -f

# Stop everything
docker compose down

# Stop and remove volumes (resets database)
docker compose down -v
```

After startup:
- **Frontend:** http://localhost:3000
- **Custodian Portal:** http://localhost:3001
- **Backend API:** http://localhost:4000/api/health
- **PostgreSQL:** localhost:5432 (user: `postgres`, password: `postgres`, db: `stellar_urithi_bidz`)

> **Note:** Set `CONTRACT_ID` and `PINATA_JWT` in a `.env` file (or export them) before starting. The compose file reads them via `${CONTRACT_ID}` and `${PINATA_JWT}`.

### 🚀 Live Testnet Contract

**Contract ID:** `CD5HJY47FHBLTI5NQLUF6UM2ZYMNVG5OSCUANUME7DMVYC3FGLJWQTJV`  
**Network:** Stellar Testnet | **WASM:** 26 KB | **Tests:** 16/16  
**Explorer:** [Stellar Lab](https://lab.stellar.org/r/testnet/contract/CD5HJY47FHBLTI5NQLUF6UM2ZYMNVG5OSCUANUME7DMVYC3FGLJWQTJV) | [Stellar Expert](https://stellar.expert/explorer/testnet/contract/CD5HJY47FHBLTI5NQLUF6UM2ZYMNVG5OSCUANUME7DMVYC3FGLJWQTJV)

> Set `NEXT_PUBLIC_CONTRACT_ID` and `CONTRACT_ID` to the above ID in your `.env` files.

### 1. Smart Contracts

#### Quick Deploy (recommended)

```bash
# Interactive deployment wizard — guides you through everything
./deploy.sh

# Or use the Makefile directly
make all
```

Both will: check prerequisites → build → test → deploy to testnet → initialize → verify.

#### Manual Steps

```bash
cd contracts

# Build contracts
make build-release

# Run tests
make test

# Generate identity & fund (testnet)
make keys   # generates 'alice' identity
make fund   # funds via Friendbot

# Optimize WASM
make optimize

# Deploy to Stellar testnet
make deploy-testnet

# Initialize the contract
make initialize

# Verify deployment
make verify
```

#### Available Make Targets

| Target | Description |
|--------|-------------|
| `make help` | Show all targets and variables |
| `make build` | Compile debug |
| `make build-release` | Compile release (optimized) |
| `make test` | Run all tests |
| `make test-verbose` | Run tests with full output |
| `make optimize` | Strip & optimize WASM |
| `make keys` | Generate testnet identity |
| `make fund` | Fund via Friendbot |
| `make deploy-testnet` | Deploy to testnet |
| `make deploy-mainnet` | Deploy to mainnet ⚠️ |
| `make initialize` | Initialize contract on-chain |
| `make verify` | Query contract state |
| `make verify-events` | Check emitted events |
| `make demo` | Run end-to-end demo |
| `make lint` | Clippy lint |
| `make fmt` | Format code |
| `make clean` | Remove build artifacts |
| `make all` | Full pipeline |

### 2. Backend Indexer

```bash
cd backend

# Install dependencies
npm install

# Set environment variables
cp .env.example .env
# Edit .env with your Postgres credentials and contract ID

# Start the indexer and API server
npm run dev
```

### 3. Frontend

```bash
cd frontend

# Install dependencies
npm install

# Set environment variables
cp .env.example .env.local

# Start the development server
npm run dev
```

Visit `http://localhost:3000` — connect your Freighter wallet and start bidding!

### 4. Custodian Portal

```bash
cd custodian-portal

npm install
npm run dev
```

Visit `http://localhost:3001`

---

## Environment Variables

### Backend (`backend/.env.example`)

```bash
PORT=4000
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=stellar_urithi_bidz
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
STELLAR_RPC_URL=https://soroban-testnet.stellar.org
CONTRACT_ID=<deployed_contract_address>
FRONTEND_URL=http://localhost:3000
```

### Frontend (`frontend/.env.example`)

```bash
NEXT_PUBLIC_CONTRACT_ID=<deployed_contract_address>
NEXT_PUBLIC_STELLAR_NETWORK=testnet
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_WS_URL=http://localhost:4000
NEXT_PUBLIC_PINATA_GATEWAY=https://gateway.pinata.cloud
```

---

## Auction Formats

| Format | How It Works | Best For |
|--------|-------------|----------|
| **English** | Ascending bids. Highest bidder wins when timer expires. | Popular, well-known format. |
| **Dutch** | Price drops over time. First to "buy now" wins instantly. | Quick sales, price discovery. |
| **Sealed-Bid** | Bids are hidden (commit-reveal). Highest valid bid revealed at close. | High-value items, privacy-sensitive. |

## Royalty Flow

Every hammer sale automatically distributes proceeds:

```
Winning Bid (100%)
├── Seller receives   (net after fees)
├── Creator royalty   (royalty_bps / 10000 × bid)
└── Platform fee      (platform_fee_bps / 10000 × bid)
```

Example: 1000 XLM bid with 5% royalty (500 bps) and 2.5% platform fee (250 bps):
- Seller: **925 XLM**
- Creator: **50 XLM**
- Platform: **25 XLM**

---

## Physical Item Bridge

For physical artifacts, the flow includes a custodian attestation step:

1. Seller lists item with `item_type: Physical` and assigns a custodian address
2. Custodian inspects the physical item, uploads documentation (photos, condition report) to IPFS
3. Custodian calls `attest_physical_item` on the contract with the IPFS hash
4. Auction activates — bidding begins

This ensures physical items are verified by a trusted third party before funds are committed.

---

## License

MIT © StellarUrithi-Bidz Contributors

Built with ❤️ for African art and culture. Powered by Stellar.
