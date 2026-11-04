# StellarUrithi-Bidz  🔨

<div align="center">

**On-Chain Auction Protocol for African Art & Cultural Artifacts on Stellar**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Stellar](https://img.shields.io/badge/Stellar-Soroban-7B61FF)](https://stellar.org)
[![Rust](https://img.shields.io/badge/Rust-soroban--sdk-orange)](https://soroban.stellar.org)
[![CI](https://github.com/StellarUrithi-Bidz/StellarUrithi-Bidz/actions/workflows/contracts-build-and-test.yml/badge.svg)](https://github.com/StellarUrithi-Bidz/StellarUrithi-Bidz/actions)

</div>

---

## Overview

**StellarUrithi-Bidz** is an open-source, on-chain auction protocol purpose-built for African art and cultural artifacts. Whether digital (NFTs) or physical (custodian-attested), every item is auctioned transparently on Stellar with escrowed bids and automatic royalty distribution.

### Key Features & Protocol Security

- **Three Auction Formats**: English (ascending), Dutch (descending), and Sealed-Bid (commit-reveal).
- **Pull-Payment Escrow Security**: Outbid bidders and losers receive claimable balances via `withdraw_refund()`, eliminating push-payment loops and reentrancy/DoS vectors.
- **Anti-Sniping Soft-Close Window**: Dynamic 5-minute extension when bids are placed near expiration to eliminate front-running sniping.
- **Dutch Slippage Protection**: Optional `max_price` parameter in `buy_now` protecting buyers against execution at unacceptable prices.
- **Cross-Auction Bound Commitments**: Sealed-bid commitments bind `(auction_id, bidder, amount, salt)` via HMAC-SHA256, preventing cross-auction replay attacks.
- **Proactive State TTL Management**: Contract state is stored in Soroban `persistent()` storage with automatic TTL bumps (`518,400` ledgers) avoiding 64KB instance storage limits.
- **Automatic Royalties**: Original creators receive royalties on every hammer sale directly from on-chain escrow.
- **Physical-Item Bridge**: Authorized custodians cryptographically attest possession with SHA-256 document hashing before physical listings activate.
- **Real-Time Updates**: WebSocket server with replay-protected Ed25519 signature authentication.

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
│  Physical-item attestation — upload IPFS docs, SHA-256 hashing   │
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
│           ├── lib.rs           # Contract entry point & pull-refund escrow
│           ├── types.rs         # Data structures, storage keys & TTL constants
│           ├── english.rs       # English ascending auction & anti-sniping
│           ├── dutch.rs         # Dutch descending auction & slippage guard
│           ├── sealed_bid.rs    # Sealed-bid commit-reveal logic
│           ├── escrow.rs        # Fund locking & accounting
│           ├── royalty.rs       # Royalty calculation & distribution
│           ├── events.rs        # Typed Soroban event emitters
│           └── test.rs          # 19 comprehensive unit test suites
│
├── backend/                     # Indexer & API Server
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts             # Main entry point
│       ├── db/
│       │   └── index.ts         # PostgreSQL connection & query helpers
│       ├── indexer/
│       │   └── event_indexer.ts # Stellar Soroban RPC event listener
│       ├── routes/
│       │   └── auctions.ts      # REST API endpoints & simulation
│       ├── ws/
│       │   └── socket_server.ts # WebSocket server with Ed25519 auth
│       └── middleware/
│           ├── auth.ts          # Ed25519 signature & replay cache
│           └── rateLimiter.ts   # Request rate-limiting
│
├── frontend/                    # Main Auction UI (Next.js 14)
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx         # Auction marketplace feed
│   │   │   ├── create/page.tsx  # On-chain auction creation
│   │   │   └── auctions/[id]/   # Detail page (bid, buy now, commit/reveal)
│   │   ├── lib/
│   │   │   ├── stellar.ts       # Soroban RPC & Freighter invocation
│   │   │   └── crypto.ts        # HMAC-SHA256 & salt utilities
│   │   └── hooks/
│   │       └── useWebSocket.ts  # Singleton live update hooks
│
└── custodian-portal/            # Physical Item Attestation UI (Next.js)
    └── src/
        ├── app/page.tsx         # Physical artifact inspection & verification
        └── lib/stellar.ts       # Attestation contract caller & document hasher
```

---

## Getting Started

### 1. Smart Contracts

```bash
cd contracts

# Run the 19 unit tests
cargo test

# Build release WASM for Soroban
cargo build --target wasm32-unknown-unknown --release
```

### 2. Full-Stack with Docker Compose

```bash
# Starts PostgreSQL, Backend, Frontend, and Custodian Portal
docker compose up --build
```

Ports:
- `:3000` — Main Frontend
- `:3001` — Custodian Portal
- `:4000` — Backend API & WebSocket
- `:5432` — PostgreSQL

---

## Verification & Testing

| Suite | Command | Details |
| :--- | :--- | :--- |
| **Contracts** | `cargo test --manifest-path contracts/Cargo.toml` | 19 tests passing: anti-sniping, slippage, pull refunds, fee overflow, sealed replay. |
| **Backend** | `cd backend && npm test` | Vitest API, simulation, and Ed25519 replay protection tests. |
| **Frontend** | `cd frontend && npm test` | Vitest components and utilities. |
| **E2E** | `cd frontend && npm run test:e2e` | Playwright browser automated workflows. |
| **Custodian** | `cd custodian-portal && npm test` | Custodian portal unit tests. |

---

## Security

Please review [SECURITY.md](SECURITY.md) for responsible disclosure guidelines, bug bounty information, and our complete threat model.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for commit conventions, style guides, and PR requirements.

## Code of Conduct

See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for community standards adhering to Contributor Covenant v2.1.

---

## License

MIT © StellarUrithi-Bidz Contributors
Built with ❤️ for African art and culture. Powered by Stellar.
