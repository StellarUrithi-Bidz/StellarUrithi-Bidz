-- StellarUrithi-Bidz — PostgreSQL Schema Initialization
-- Runs automatically on first container start via docker-entrypoint-initdb.d

-- Auctions table — core auction data indexed from Soroban events
CREATE TABLE IF NOT EXISTS auctions (
    id              BIGINT PRIMARY KEY,
    seller          VARCHAR(56)  NOT NULL,
    original_creator VARCHAR(56) NOT NULL,
    format          VARCHAR(20)  NOT NULL CHECK (format IN ('english', 'dutch', 'sealed_bid')),
    status          VARCHAR(20)  NOT NULL DEFAULT 'created'
                    CHECK (status IN ('created', 'active', 'ended', 'settled', 'cancelled')),
    item_type       VARCHAR(20)  NOT NULL CHECK (item_type IN ('digital', 'physical')),
    nft_contract    VARCHAR(56),
    token_id        BIGINT,
    custodian       VARCHAR(56),
    attestation_hash VARCHAR(64),
    payment_token   VARCHAR(56)  NOT NULL,
    reserve_price   NUMERIC(30, 0) NOT NULL,
    royalty_bps     INT          NOT NULL,
    platform_fee_bps INT         NOT NULL,
    start_time      BIGINT       NOT NULL,
    end_time        BIGINT       NOT NULL,
    commit_deadline BIGINT,
    reveal_deadline BIGINT,
    metadata_uri    TEXT         NOT NULL,
    min_increment   NUMERIC(30, 0),
    start_price     NUMERIC(30, 0),
    price_decay_per_second NUMERIC(30, 0),
    highest_bidder  VARCHAR(56),
    highest_bid     NUMERIC(30, 0) DEFAULT 0,
    current_dutch_price NUMERIC(30, 0),
    attested        BOOLEAN      DEFAULT FALSE,
    seller_proceeds NUMERIC(30, 0),
    royalty_amount  NUMERIC(30, 0),
    platform_fee_amount NUMERIC(30, 0),
    created_at      TIMESTAMPTZ  DEFAULT NOW(),
    settled_at      TIMESTAMPTZ
);

-- Bids table — all bids placed across all auctions
CREATE TABLE IF NOT EXISTS bids (
    id          SERIAL PRIMARY KEY,
    auction_id  BIGINT       NOT NULL REFERENCES auctions(id),
    bidder      VARCHAR(56)  NOT NULL,
    amount      NUMERIC(30, 0) NOT NULL,
    format      VARCHAR(20)  NOT NULL,
    timestamp   BIGINT       NOT NULL,
    is_winning  BOOLEAN      DEFAULT FALSE,
    refunded    BOOLEAN      DEFAULT FALSE,
    created_at  TIMESTAMPTZ  DEFAULT NOW()
);

-- Events table — raw Soroban contract events for audit trail
CREATE TABLE IF NOT EXISTS events (
    id               SERIAL PRIMARY KEY,
    event_type       VARCHAR(50)  NOT NULL,
    auction_id       BIGINT       NOT NULL,
    data             JSONB        NOT NULL DEFAULT '{}',
    ledger_sequence  BIGINT       NOT NULL,
    tx_hash          VARCHAR(64),
    created_at       TIMESTAMPTZ  DEFAULT NOW()
);

-- Attestations table — physical-item custodian verifications
CREATE TABLE IF NOT EXISTS attestations (
    id               SERIAL PRIMARY KEY,
    auction_id       BIGINT       NOT NULL REFERENCES auctions(id),
    custodian        VARCHAR(56)  NOT NULL,
    attestation_hash VARCHAR(64)  NOT NULL,
    ipfs_cid         TEXT,
    attested_at      TIMESTAMPTZ  DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_bids_auction_id   ON bids(auction_id);
CREATE INDEX IF NOT EXISTS idx_bids_bidder       ON bids(bidder);
CREATE INDEX IF NOT EXISTS idx_bids_timestamp    ON bids(auction_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_auctions_status   ON auctions(status);
CREATE INDEX IF NOT EXISTS idx_auctions_seller   ON auctions(seller);
CREATE INDEX IF NOT EXISTS idx_auctions_format   ON auctions(format);
CREATE INDEX IF NOT EXISTS idx_events_auction_id ON events(auction_id);
CREATE INDEX IF NOT EXISTS idx_events_type       ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_ledger     ON events(ledger_sequence);
