# Security Policy

## Reporting a Vulnerability

The StellarUrithi-Bidz team takes the security of our smart contracts, backend services, and web applications seriously. We welcome responsible disclosures from security researchers and the community.

**Please do not report security vulnerabilities through public GitHub issues or discussions.**

Instead, report vulnerabilities privately by emailing:
`security@stellarurithi.org`

Include in your report:
- A clear description of the vulnerability and its potential impact.
- Step-by-step instructions or Proof of Concept (PoC) code to reproduce the issue.
- Affected contracts, modules, or endpoints.
- Any suggested mitigations.

We will acknowledge receipt within 24 hours and provide an initial assessment within 72 hours.

---

## Supported Versions

| Component | Version / Target | Supported |
| :--- | :--- | :--- |
| Soroban Contracts | `stellar-urithi-auction` (v0.1.0+) | :white_check_mark: |
| Backend Indexer & API | Node.js 20 LTS | :white_check_mark: |
| Frontend Web App | Next.js 14 App Router | :white_check_mark: |
| Custodian Portal | Next.js 14 App Router | :white_check_mark: |

---

## Threat Model & Security Architecture

### 1. Soroban Smart Contracts
- **Pull Over Push Escrow Pattern:** Contract balances are never pushed automatically in loops or during outbid events. Outbid bidders and losers receive claimable balances stored under `StorageKey::Refund(auction_id, bidder)` and must call `withdraw_refund()` to withdraw funds. This eliminates Denial of Service (DoS) vectors caused by malicious recipient contracts or unexpected transfer panics.
- **Persistent Storage & State TTLs:** All dynamic records (`StorageKey::Auction(id)`, `StorageKey::Refund(id, bidder)`, `StorageKey::Commitment(...)`) are maintained in Soroban `persistent()` storage with proactive TTL extension (`PERSISTENT_LIFETIME = 518,400` ledgers, threshold = `17,280` ledgers). This prevents contract instance storage overflow (64KB ledger limit) and inadvertent state eviction.
- **Anti-Sniping Soft-Close Window:** English auctions feature a 5-minute soft-close extension. If a valid bid is placed within 5 minutes of the auction's end, `end_time` is dynamically extended by 300 seconds to allow all market participants to respond and mitigate MEV/front-running sniping.
- **Slippage Protection in Dutch Auctions:** Buyers can specify an optional `max_price` parameter when executing `buy_now`. If the on-chain decaying price exceeds `max_price`, the transaction reverts to prevent execution at an unacceptable price.
- **Cross-Auction Replay Prevention:** Sealed-bid commitments use HMAC-SHA256 where the message strictly binds `auction_id`, `bidder`, and `amount` with a 32-byte secret salt. Commitments cannot be replayed across different auctions or stolen by other bidders.
- **Fee Overflow Guards:** Total combined royalty basis points (`royalty_bps`) and platform fee basis points (`platform_fee_bps`) are strictly checked to ensure they never exceed 10,000 bps (100%), preventing negative seller proceeds or balance underflow.

### 2. Backend & Indexer
- **Ed25519 Replay Prevention:** Authenticated REST endpoints and WebSocket channels verify Stellar Ed25519 signatures over challenge messages with strict numeric timestamps. Nonces are bounded to a 5-minute freshness window, and a replay cache ensures no nonce can be reused.
- **Rate Limiting:** Public endpoints are protected with strict and default express-rate-limit instances to mitigate denial-of-service and brute-force attacks.
- **Idempotent Event Ingestion:** The Soroban event indexer maintains a persistent cursor in PostgreSQL and utilizes database transactions with unique event constraints `(ledger_sequence, event_type, auction_id)` to ensure exactly-once ingestion semantics.

### 3. Container & Infrastructure Security
- **Non-Root Containers:** All Docker containers run as unprivileged users (`urithi:urithi`, UID 1001 or Alpine `postgres:postgres` 999:999) with `no-new-privileges:true`.
- **Secret Isolation:** Production secrets (`PINATA_JWT`, database passwords, private keys) are injected exclusively via environment variables and never checked into source control.
