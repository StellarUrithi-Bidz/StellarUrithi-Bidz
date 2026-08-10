# Changelog

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

## [0.1.0] — Initial release
- English, Dutch, Sealed-Bid auctions
- On-chain escrow + royalty distribution
- Physical-item custodian attestation
- WebSocket real-time updates
- Next.js 14 frontend
- Docker Compose deployment
