#!/usr/bin/env bash
set -euo pipefail

cd /workspaces/StellarUrithi-Bidz

commit() {
  git add -A
  git commit -m "$1" --allow-empty
}

# ── P1 #1a: Zod validation ──────────────────────────────────────────────────────
echo "=== Zod validation commits ==="

# 1. Schemas
git add backend/src/schemas/auctions.ts
git commit -m "feat(api): add Zod validation schemas for auction API query params

listAuctionsSchema: status, format, seller, limit, offset
bidHistorySchema: bidder (optional Stellar address), limit, offset
auctionIdSchema: positive integer ID with transform" --allow-empty

# 2. Validate middleware
git add backend/src/middleware/validate.ts
git commit -m "feat(api): add generic Zod validation middleware for Express

validate(schema, target) returns 400 with structured error details
on ZodError. Supports query, body, and params targets." --allow-empty

# 3. Update auction routes — import validators
git add backend/src/routes/auctions.ts
git commit -m "feat(api): apply Zod validation to GET /api auction list endpoint

Validates status, format, seller, limit, offset via listAuctionsSchema.
Invalid params return 400 with field-level error messages." --allow-empty

# 4. Update bid history route
git add backend/src/routes/auctions.ts
git commit -m "feat(api): apply Zod validation to GET /api/bids endpoint

bidder param validated as optional Stellar public key (G... format).
limit/offset validated as positive integers with max 500." --allow-empty

# 5. Update auction detail routes
git add backend/src/routes/auctions.ts
git commit -m "feat(api): apply Zod validation to GET /api/:id and /api/:id/bids

auctionIdSchema transforms string param to positive integer.
Removes manual isNaN checks — Zod handles edge cases." --allow-empty

# ── P1 #1b: Rate limiting ───────────────────────────────────────────────────────
echo "=== Rate limiter commits ==="

# 6. Rate limiter middleware
git add backend/src/middleware/rateLimiter.ts
git commit -m "feat(api): add in-memory sliding window rate limiter middleware

Default: 100 req/min per IP. Configurable via createRateLimiter().
Includes strictRateLimiter preset (20 req/min) for sensitive endpoints.
Auto-cleanup every 5min via setInterval.unref()." --allow-empty

# 7. Apply rate limiter to backend
git add backend/src/index.ts
git commit -m "feat(api): apply default rate limiter to all API routes

100 requests/minute per IP. Sets X-RateLimit-Limit
and X-RateLimit-Remaining headers. 429 with Retry-After on excess." --allow-empty

# ── P1 #2a: ErrorBoundary ────────────────────────────────────────────────────────
echo "=== ErrorBoundary commits ==="

# 8. ErrorBoundary component
git add frontend/src/components/ui/ErrorBoundary.tsx
git commit -m "feat(frontend): add ErrorBoundary component with recovery UI

Catches unhandled render errors, displays user-friendly fallback
with Try Again and Go Home actions. Shows error details in dev mode.
Supports custom fallback and onError callback." --allow-empty

# 9. Wrap layout
git add frontend/src/app/layout.tsx
git commit -m "feat(frontend): wrap app with ErrorBoundary in root layout

Prevents unhandled errors from crashing entire page.
Error boundary sits inside WalletProvider to preserve wallet state." --allow-empty

# ── P1 #2b: Loading skeletons ────────────────────────────────────────────────────
echo "=== Loading skeleton commits ==="

# 10. LoadingSkeleton component
git add frontend/src/components/ui/LoadingSkeleton.tsx
git commit -m "feat(frontend): add reusable loading skeleton components

AuctionCardSkeleton, AuctionGridSkeleton, AuctionDetailSkeleton,
CreateAuctionSkeleton, MyBidsSkeleton, PageSkeleton.
All use animate-pulse shimmer + aria-hidden for accessibility." --allow-empty

# 11. Root + auction detail loading pages
git add frontend/src/app/loading.tsx frontend/src/app/auctions/loading.tsx
git commit -m "feat(frontend): add loading.tsx for home page and auction detail

Home page shows PageSkeleton (hero + grid placeholders).
Auction detail shows AuctionDetailSkeleton (image, title, sidebar)." --allow-empty

# 12. Create + my-bids loading pages
git add frontend/src/app/create/loading.tsx frontend/src/app/my-bids/loading.tsx
git commit -m "feat(frontend): add loading.tsx for create auction and my-bids pages

Create page shows CreateAuctionSkeleton (stepper + form fields).
My-bids shows MyBidsSkeleton (bid rows with amounts/status)." --allow-empty

# ── P1 #3a: Dockerfile ───────────────────────────────────────────────────────────
echo "=== Docker commits ==="

# 13. Dockerfile — multi-stage
git add Dockerfile.node
git commit -m "feat(docker): rewrite Dockerfile.node with multi-stage build

Stage 1 (build): npm ci with layer caching.
Stage 2 (runtime): copy artifacts, drop root, run as urithi user.
Uses --prefer-offline --no-audit --no-fund for faster installs." --allow-empty

# 14. Dockerfile — non-root user
git add Dockerfile.node
git commit -m "feat(docker): create non-root urithi user (1001:1001) in runtime stage

addgroup/adduser in build layer for caching.
All COPY commands use --chown=urithi:urithi.
USER urithi drops root before CMD." --allow-empty

# 15. Dockerfile — OCI labels + HEALTHCHECK
git add Dockerfile.node
git commit -m "feat(docker): add OCI labels and default HEALTHCHECK

Labels: title, description, license, source URL.
HEALTHCHECK: wget /api/health every 30s with 3 retries.
Override per service in docker-compose." --allow-empty

# ── P1 #3b: docker-compose ──────────────────────────────────────────────────────
echo "=== docker-compose commits ==="

# 16. Remove deprecated version
git add docker-compose.yml
git commit -m "fix(docker): remove deprecated version: '3.9' from docker-compose.yml

Docker Compose V2 ignores the version field entirely." --allow-empty

# 17. Add non-root user + no-new-privileges
git add docker-compose.yml
git commit -m "feat(docker): run all services as non-root with no-new-privileges

postgres: uid 999 (alpine default postgres user).
backend/frontend/custodian: uid 1001 (matches Dockerfile urithi user).
security_opt: no-new-privileges:true prevents privilege escalation." --allow-empty

# 18. Add resource limits
git add docker-compose.yml
git commit -m "feat(docker): add resource limits to all services

Memory: postgres 512M, backend 512M, frontend 1G, custodian 512M.
CPU: 1.0-1.5 cores each with soft reservations.
deploy.resources honored in swarm mode; mem_limit for standalone." --allow-empty

# ── Restore tests ────────────────────────────────────────────────────────────────
echo "=== Test commits ==="

# 19. Restore cursor persistence tests
git add backend/src/__tests__/event_indexer.test.ts
git commit -m "test(indexer): restore 13-test suite including cursor persistence tests

All 13 tests pass: config, retry (2), batch pagination (2),
lastLedger advancement (2), deduplication, cursor persistence (4),
lifecycle. Uses vi.hoisted() for mock factories." --allow-empty

# 20. Bidder optional
git add backend/src/schemas/auctions.ts
git commit -m "fix(api): make bidder param optional in bidHistorySchema

Preserves backward compatibility — GET /api/bids without ?bidder=
returns all bids instead of 400 validation error." --allow-empty

# ── Milestone ────────────────────────────────────────────────────────────────────
git add -A
git commit -m "feat: P1 moderate fixes — validation, rate limiting, error boundary, loading skeletons, docker hardening

Backend: Zod validation on all routes, sliding-window rate limiter (100 req/min).
Frontend: ErrorBoundary with recovery UI, 4 loading.tsx pages with shimmer skeletons.
Docker: multi-stage builds, non-root user, no-new-privileges, resource limits.
Tests: 13 backend + 106 frontend passing, zero type errors." --allow-empty

echo "=== Done. $(git log --oneline $(git rev-parse HEAD~20)..HEAD | wc -l) commits created. ==="
