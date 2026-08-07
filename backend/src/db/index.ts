// Database connection pool and query helpers for StellarUrithi-Bidz backend.

import { Pool, PoolClient, QueryResult } from "pg";
import { logger } from "../services/logger";

const pool = new Pool({
  host: process.env.POSTGRES_HOST || "localhost",
  port: parseInt(process.env.POSTGRES_PORT || "5432", 10),
  database: process.env.POSTGRES_DB || "stellar_urithi_bidz",
  user: process.env.POSTGRES_USER || "postgres",
  password: process.env.POSTGRES_PASSWORD || "postgres",
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// ── Initialization ────────────────────────────────────────────────────────────────

export async function initializeDatabase(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS auctions (
        id BIGINT PRIMARY KEY,
        seller VARCHAR(56) NOT NULL,
        original_creator VARCHAR(56) NOT NULL,
        format VARCHAR(20) NOT NULL CHECK (format IN ('english', 'dutch', 'sealed_bid')),
        status VARCHAR(20) NOT NULL DEFAULT 'created'
          CHECK (status IN ('created', 'active', 'ended', 'settled', 'cancelled')),
        item_type VARCHAR(20) NOT NULL CHECK (item_type IN ('digital', 'physical')),
        nft_contract VARCHAR(56),
        token_id BIGINT,
        custodian VARCHAR(56),
        attestation_hash VARCHAR(64),
        payment_token VARCHAR(56) NOT NULL,
        reserve_price NUMERIC(30, 0) NOT NULL,
        royalty_bps INT NOT NULL,
        platform_fee_bps INT NOT NULL,
        start_time BIGINT NOT NULL,
        end_time BIGINT NOT NULL,
        commit_deadline BIGINT,
        reveal_deadline BIGINT,
        metadata_uri TEXT NOT NULL,
        min_increment NUMERIC(30, 0),
        start_price NUMERIC(30, 0),
        price_decay_per_second NUMERIC(30, 0),
        highest_bidder VARCHAR(56),
        highest_bid NUMERIC(30, 0) DEFAULT 0,
        current_dutch_price NUMERIC(30, 0),
        attested BOOLEAN DEFAULT FALSE,
        seller_proceeds NUMERIC(30, 0),
        royalty_amount NUMERIC(30, 0),
        platform_fee_amount NUMERIC(30, 0),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        settled_at TIMESTAMPTZ
      );

      CREATE TABLE IF NOT EXISTS bids (
        id SERIAL PRIMARY KEY,
        auction_id BIGINT NOT NULL REFERENCES auctions(id),
        bidder VARCHAR(56) NOT NULL,
        amount NUMERIC(30, 0) NOT NULL,
        format VARCHAR(20) NOT NULL,
        timestamp BIGINT NOT NULL,
        is_winning BOOLEAN DEFAULT FALSE,
        refunded BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS events (
        id SERIAL PRIMARY KEY,
        event_type VARCHAR(50) NOT NULL,
        auction_id BIGINT NOT NULL,
        data JSONB NOT NULL DEFAULT '{}',
        ledger_sequence BIGINT NOT NULL,
        tx_hash VARCHAR(64),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS attestations (
        id SERIAL PRIMARY KEY,
        auction_id BIGINT NOT NULL REFERENCES auctions(id),
        custodian VARCHAR(56) NOT NULL,
        attestation_hash VARCHAR(64) NOT NULL,
        ipfs_cid TEXT,
        attested_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_bids_auction_id ON bids(auction_id);
      CREATE INDEX IF NOT EXISTS idx_bids_bidder ON bids(bidder);
      CREATE INDEX IF NOT EXISTS idx_auctions_status ON auctions(status);
      CREATE INDEX IF NOT EXISTS idx_auctions_seller ON auctions(seller);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_events_dedup
        ON events(ledger_sequence, event_type, auction_id);
      CREATE INDEX IF NOT EXISTS idx_events_auction_id ON events(auction_id);
      CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
    `);

    logger.info("Database tables initialized successfully");
  } finally {
    client.release();
  }
}

// ── Auction CRUD ──────────────────────────────────────────────────────────────────

export async function upsertAuction(auction: AuctionRecord): Promise<void> {
  await pool.query(
    `INSERT INTO auctions (
      id, seller, original_creator, format, status, item_type,
      nft_contract, token_id, custodian, attestation_hash,
      payment_token, reserve_price, royalty_bps, platform_fee_bps,
      start_time, end_time, commit_deadline, reveal_deadline,
      metadata_uri, min_increment, start_price, price_decay_per_second,
      highest_bidder, highest_bid, current_dutch_price, attested,
      seller_proceeds, royalty_amount, platform_fee_amount
    ) VALUES (
      $1, $2, $3, $4, $5, $6,
      $7, $8, $9, $10,
      $11, $12, $13, $14,
      $15, $16, $17, $18,
      $19, $20, $21, $22,
      $23, $24, $25, $26,
      $27, $28, $29
    ) ON CONFLICT (id) DO UPDATE SET
      status = EXCLUDED.status,
      highest_bidder = EXCLUDED.highest_bidder,
      highest_bid = EXCLUDED.highest_bid,
      current_dutch_price = EXCLUDED.current_dutch_price,
      attested = EXCLUDED.attested,
      seller_proceeds = EXCLUDED.seller_proceeds,
      royalty_amount = EXCLUDED.royalty_amount,
      platform_fee_amount = EXCLUDED.platform_fee_amount,
      settled_at = EXCLUDED.settled_at`,
    [
      auction.id, auction.seller, auction.original_creator, auction.format,
      auction.status, auction.item_type, auction.nft_contract, auction.token_id,
      auction.custodian, auction.attestation_hash, auction.payment_token,
      auction.reserve_price, auction.royalty_bps, auction.platform_fee_bps,
      auction.start_time, auction.end_time, auction.commit_deadline,
      auction.reveal_deadline, auction.metadata_uri, auction.min_increment,
      auction.start_price, auction.price_decay_per_second, auction.highest_bidder,
      auction.highest_bid, auction.current_dutch_price, auction.attested,
      auction.seller_proceeds, auction.royalty_amount, auction.platform_fee_amount,
    ]
  );
}

export async function insertBid(bid: BidRecord): Promise<void> {
  await pool.query(
    `INSERT INTO bids (auction_id, bidder, amount, format, timestamp, is_winning)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [bid.auction_id, bid.bidder, bid.amount, bid.format, bid.timestamp, bid.is_winning]
  );
}

export async function insertEvent(event: EventRecord): Promise<void> {
  // FIX #3: Deduplication — ON CONFLICT DO NOTHING prevents duplicate events
  // when the indexer re-fetches the same ledger range (e.g., during pagination overlap).
  await pool.query(
    `INSERT INTO events (event_type, auction_id, data, ledger_sequence, tx_hash)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (ledger_sequence, event_type, auction_id) DO NOTHING`,
    [event.event_type, event.auction_id, JSON.stringify(event.data),
     event.ledger_sequence, event.tx_hash]
  );
}

// ── Queries ───────────────────────────────────────────────────────────────────────

export async function getAuction(id: number): Promise<AuctionRecord | null> {
  const result = await pool.query("SELECT * FROM auctions WHERE id = $1", [id]);
  return result.rows[0] || null;
}

export async function getAuctions(params: {
  status?: string;
  format?: string;
  seller?: string;
  limit?: number;
  offset?: number;
}): Promise<AuctionRecord[]> {
  const conditions: string[] = [];
  const values: (string | number)[] = [];
  let paramIndex = 1;

  if (params.status) {
    conditions.push(`status = $${paramIndex++}`);
    values.push(params.status);
  }
  if (params.format) {
    conditions.push(`format = $${paramIndex++}`);
    values.push(params.format);
  }
  if (params.seller) {
    conditions.push(`seller = $${paramIndex++}`);
    values.push(params.seller);
  }

  const where = conditions.length > 0
    ? `WHERE ${conditions.join(" AND ")}`
    : "";
  const limit = params.limit || 50;
  const offset = params.offset || 0;

  values.push(limit, offset);

  const result = await pool.query(
    `SELECT * FROM auctions ${where} ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
    values
  );
  return result.rows;
}

export async function getBidsForAuction(auctionId: number): Promise<BidRecord[]> {
  const result = await pool.query(
    "SELECT * FROM bids WHERE auction_id = $1 ORDER BY timestamp DESC",
    [auctionId]
  );
  return result.rows;
}

export async function getBidHistory(params: {
  bidder?: string;
  limit?: number;
  offset?: number;
}): Promise<BidRecord[]> {
  const conditions: string[] = [];
  const values: (string | number)[] = [];
  let paramIndex = 1;

  if (params.bidder) {
    conditions.push(`bidder = $${paramIndex++}`);
    values.push(params.bidder);
  }

  const where = conditions.length > 0
    ? `WHERE ${conditions.join(" AND ")}`
    : "";
  const limit = params.limit || 50;
  const offset = params.offset || 0;

  values.push(limit, offset);

  const result = await pool.query(
    `SELECT * FROM bids ${where} ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
    values
  );
  return result.rows;
}

export async function getAnalytics(): Promise<Analytics> {
  const [auctionCount, totalVolume, activeCount, settledCount] = await Promise.all([
    pool.query("SELECT COUNT(*) FROM auctions"),
    pool.query("SELECT COALESCE(SUM(highest_bid), 0) FROM auctions WHERE status = 'settled'"),
    pool.query("SELECT COUNT(*) FROM auctions WHERE status = 'active'"),
    pool.query("SELECT COUNT(*) FROM auctions WHERE status = 'settled'"),
  ]);

  return {
    total_auctions: parseInt(auctionCount.rows[0].count, 10),
    total_volume: totalVolume.rows[0].coalesce,
    active_auctions: parseInt(activeCount.rows[0].count, 10),
    settled_auctions: parseInt(settledCount.rows[0].count, 10),
  };
}

// ── Types ─────────────────────────────────────────────────────────────────────────

export interface AuctionRecord {
  id: number;
  seller: string;
  original_creator: string;
  format: "english" | "dutch" | "sealed_bid";
  status: "created" | "active" | "ended" | "settled" | "cancelled";
  item_type: "digital" | "physical";
  nft_contract?: string;
  token_id?: number;
  custodian?: string;
  attestation_hash?: string;
  payment_token: string;
  reserve_price: string;
  royalty_bps: number;
  platform_fee_bps: number;
  start_time: number;
  end_time: number;
  commit_deadline?: number;
  reveal_deadline?: number;
  metadata_uri: string;
  min_increment?: string;
  start_price?: string;
  price_decay_per_second?: string;
  highest_bidder?: string;
  highest_bid: string;
  current_dutch_price?: string;
  attested: boolean;
  seller_proceeds?: string;
  royalty_amount?: string;
  platform_fee_amount?: string;
}

export interface BidRecord {
  id?: number;
  auction_id: number;
  bidder: string;
  amount: string;
  format: string;
  timestamp: number;
  is_winning: boolean;
  refunded?: boolean;
}

export interface EventRecord {
  event_type: string;
  auction_id: number;
  data: Record<string, unknown>;
  ledger_sequence: number;
  tx_hash?: string;
}

export interface Analytics {
  total_auctions: number;
  total_volume: string;
  active_auctions: number;
  settled_auctions: number;
}

export { pool };
