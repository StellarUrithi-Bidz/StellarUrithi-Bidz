# Changelog

All notable changes to the StellarUrithi-Bidz project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.3.0] — 2026-11-04

### Smart Contracts (Soroban)
- **Persistent Storage Migration:** Switched dynamic records (`StorageKey::Auction(id)`, `StorageKey::Refund(id, bidder)`, `StorageKey::Commitment(...)`) from instance storage to `persistent()` storage with proactive TTL bumping (`PERSISTENT_LIFETIME = 518,400` ledgers, threshold = `17,280` ledgers), preventing ledger size limits and inadvertent state eviction.
- **Pull Over Push Escrow Pattern:** Replaced immediate outbid push transfers with a pull-payment model using `StorageKey::Refund(auction_id, bidder)` and `withdraw_refund()`, completely eliminating Denial of Service (DoS) attack vectors caused by failing transfers.
- **Anti-Sniping Soft-Close Window:** Added dynamic 5-minute extension to English auctions when bids are placed within 300 seconds of scheduled end time, emitting `auc_ext` events.
- **Dutch Slippage Protection:** Added optional `max_price` parameter to `buy_now` protecting buyers against execution at unacceptable prices.
- **Sealed-Bid Replay & DoS Fixes:** Eliminated unbounded push loops during finalization by recording pull refunds, and enforced `bidder.require_auth()` in `refund_unrevealed()`.
- **Combined Fee Validation:** Verified `royalty_bps + platform_fee_bps <= 10_000` on auction creation to prevent seller proceeds underflow.
- **Ledger Sequence Expiration Fix:** Corrected `approve_nft_transfer()` to compute live ledger expiration sequence (`env.ledger().sequence() + 34_560`) rather than timestamp seconds.
- **Expanded Test Suite:** 19 comprehensive unit tests passing with Soroban SDK v22 covering all edge cases.

### Backend Indexer & REST API
- **Lifecycle Event Sync:** Synchronized `auctions` table status, winner, and leading bid on `bid_placed`, `auction_closed`, `auction_settled`, `auction_cancelled`, and `attestation_recorded`.
- **Ed25519 Auth Security Patches:** Fixed critical nonce parsing bypass in auth middleware where non-numeric nonces bypassed age checks; added memory-bounded replay cache rejecting reused nonces.
- **WebSocket Replay & Leak Patches:** Implemented periodic eviction of expired server nonces, patched client fallback nonce parsing, and added real-time broadcast for anti-sniping extension events.
- **Pre-Flight Simulation Endpoints:** Added `POST /api/simulate-create` and `POST /api/:id/simulate-bid` with reserve price and minimum increment validation.
- **Database Resilience:** Added connection health checks and automatic transaction rollback on failure.

### Frontend Web3 & Custodian Portal
- **On-Chain Auction Creation:** Connected `create/page.tsx` to Soroban `create_auction` via Freighter wallet with format-specific parameter serializations.
- **On-Chain Bidding & Pull Refunds:** Implemented real Soroban invocations for English bidding, Dutch `buy_now`, and pull-refund withdrawal via `withdraw_refund`.
- **Sealed-Bid Commit-Reveal:** Implemented client-side 32-byte salt generation, HMAC-SHA256 commitment computation, local storage persistence, and one-click `reveal_bid` flow.
- **Custodian Attestation Flow:** Replaced hardcoded mock arrays with live API data fetching, computed verifiable SHA-256 inspection document hashes, and submitted on-chain `attest_physical_item` transactions.
- **WebSocket Connection Leak Fix:** Fixed singleton initialization in `useWebSocket.ts` to prevent duplicate connections during handshake, with full support for `auction:extended` events.
- **IPFS Upload Rate Limiting:** Added IP rate limiting (30 req/min) and strict MIME/size boundary validation to the Pinata upload proxy.

### DevOps, CI/CD & Governance
- **Docker Compose Startup Fixes:** Configured explicit `command: ["npm", "run", "dev"]` across all Node.js services and healthchecks.
- **Non-Root Docker Permissions:** Pre-created and chowned Next.js `.next` directories to ensure unprivileged container runtime operation.
- **PostgreSQL CI Service:** Added PostgreSQL 16 service container to GitHub Actions `backend-ci.yml`.
- **Playwright & Custodian CI:** Added Custodian Portal build/typecheck and Playwright E2E browser automation to `frontend-ci.yml`.
- **Open-Source Hygiene:** Removed synthetic commit generator bash scripts (`build-*.sh`) from root.
- **Security & Community Standards:** Added comprehensive `SECURITY.md`, Contributor Covenant `CODE_OF_CONDUCT.md`, GitHub PR template, and issue templates.

---

## [0.2.0] — 2025-08-10

### Fixed
- All 16 contract tests passing with soroban-sdk v22
- Remove duplicate require_auth() from escrow::lock_bid
- Dutch auction test timing corrected
- Settlement tests: NFT SAC, pre-approval, seller mint
- approve_nft_transfer: safe saturating_add for u32
- Event indexer: type-safe topic parsing
- WebSocket auth: server-provided random nonces
- PostgreSQL: SSL/TLS support via POSTGRES_SSL
- docker-compose: env-var-based DB credentials

### Added
- Freighter sign-and-submit in invokeContract()
- Stellar Ed25519 auth middleware for POST endpoints
- Server-nonce WebSocket auth flow
- Redis-backed rate limiter with memory fallback
- .env.example files (backend, frontend, custodian)
- Custodian portal test suite
- Backend API integration tests
- CHANGELOG.md and CONTRIBUTING.md
- Shared IPFS upload module
- GitHub issue templates

### Changed
- Custodian portal: real Freighter API
- Rate limiter: auto-detects Redis
- AuctionCard: fallback gateway URL

---

## [0.1.0] — Initial release
- English, Dutch, Sealed-Bid auctions
- On-chain escrow + royalty distribution
- Physical-item custodian attestation
- WebSocket real-time updates
- Next.js 14 frontend
- Docker Compose deployment
