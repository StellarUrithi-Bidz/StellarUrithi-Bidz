// Stellar Soroban Event Indexer
// Polls the Soroban RPC for contract events emitted by the UrithiAuction contract
// and syncs them to PostgreSQL for querying and real-time updates.
//
// Fixes applied:
//  1. Batch pagination — loops until all events in the ledger range are consumed
//  2. Retry logic — exponential backoff on RPC failures (3 attempts)
//  3. Deduplication — unique constraint + ON CONFLICT DO NOTHING on event inserts
//  4. Fixed lastLedger heuristic — advances to latestLedger directly when empty

import { SorobanRpc, xdr, scValToNative, Address } from "@stellar/stellar-sdk";
import { upsertAuction, insertBid, insertEvent, AuctionRecord, BidRecord } from "../db";
import { logger } from "../services/logger";

interface IndexerConfig {
  rpcUrl: string;
  contractId: string;
  pollIntervalMs: number;
  batchSize: number;
  maxRetries: number;
}

const config: IndexerConfig = {
  rpcUrl: process.env.STELLAR_RPC_URL || "https://soroban-testnet.stellar.org",
  contractId: process.env.CONTRACT_ID || "",
  pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || "5000", 10),
  batchSize: parseInt(process.env.EVENT_BATCH_SIZE || "100", 10),
  maxRetries: parseInt(process.env.INDEXER_MAX_RETRIES || "3", 10),
};

let lastLedger = 0;
let isRunning = false;

// ── Retry helper ──────────────────────────────────────────────────────────────────

async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxRetries: number = config.maxRetries,
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 30000);
        logger.warn(
          `[retry] ${label} attempt ${attempt}/${maxRetries} failed, retrying in ${delay}ms: ${lastError.message}`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

// ── Event Handlers ────────────────────────────────────────────────────────────────

type EventHandler = (
  auctionId: number,
  data: Record<string, unknown>,
  ledgerSeq: number,
  txHash?: string,
) => Promise<void>;

const handlers: Record<string, EventHandler> = {
  auction_created: async (auctionId, data, ledgerSeq, txHash) => {
    const record: AuctionRecord = {
      id: auctionId,
      seller: (data.seller as string) || "",
      original_creator: (data.original_creator as string) || "",
      format: mapFormat(data.format as string),
      status: "created",
      item_type: ((data.item_type as string) || "digital") as "digital" | "physical",
      nft_contract: (data.nft_contract as string) || undefined,
      token_id: (data.token_id as number) || undefined,
      custodian: (data.custodian as string) || undefined,
      attestation_hash: (data.attestation_hash as string) || undefined,
      payment_token: (data.payment_token as string) || "",
      reserve_price: String(data.reserve_price || "0"),
      royalty_bps: (data.royalty_bps as number) || 0,
      platform_fee_bps: (data.platform_fee_bps as number) || 250,
      start_time: (data.start_time as number) || 0,
      end_time: (data.end_time as number) || 0,
      commit_deadline: (data.commit_deadline as number) || undefined,
      reveal_deadline: (data.reveal_deadline as number) || undefined,
      metadata_uri: (data.metadata_uri as string) || "",
      min_increment: String(data.min_increment || "0"),
      start_price: String(data.start_price || "0"),
      price_decay_per_second: String(data.price_decay_per_second || "0"),
      highest_bidder: undefined,
      highest_bid: "0",
      current_dutch_price: String(data.start_price || "0"),
      attested: false,
    };

    await upsertAuction(record);
    logger.info(`Auction ${auctionId} indexed — ${record.format}`);

    await insertEvent({
      event_type: "auction_created",
      auction_id: auctionId,
      data: record as unknown as Record<string, unknown>,
      ledger_sequence: ledgerSeq,
      tx_hash: txHash,
    });
  },

  bid_placed: async (auctionId, data, ledgerSeq, txHash) => {
    const bid: BidRecord = {
      auction_id: auctionId,
      bidder: (data.bidder as string) || "",
      amount: String(data.amount || "0"),
      format: mapFormat(data.format as string),
      timestamp: (data.timestamp as number) || Date.now(),
      is_winning: true,
    };

    await insertBid(bid);
    logger.info(`Bid placed: ${bid.amount} by ${bid.bidder} on auction ${auctionId}`);

    await insertEvent({
      event_type: "bid_placed",
      auction_id: auctionId,
      data: bid as unknown as Record<string, unknown>,
      ledger_sequence: ledgerSeq,
      tx_hash: txHash,
    });
  },

  bid_refunded: async (auctionId, data, ledgerSeq, txHash) => {
    logger.info(`Bid refunded on auction ${auctionId} for ${data.bidder}`);

    await insertEvent({
      event_type: "bid_refunded",
      auction_id: auctionId,
      data,
      ledger_sequence: ledgerSeq,
      tx_hash: txHash,
    });
  },

  auction_closed: async (auctionId, data, ledgerSeq, txHash) => {
    logger.info(`Auction ${auctionId} closed — winner: ${data.winner}`);

    await insertEvent({
      event_type: "auction_closed",
      auction_id: auctionId,
      data,
      ledger_sequence: ledgerSeq,
      tx_hash: txHash,
    });
  },

  auction_settled: async (auctionId, data, ledgerSeq, txHash) => {
    logger.info(`Auction ${auctionId} settled`);

    await insertEvent({
      event_type: "auction_settled",
      auction_id: auctionId,
      data,
      ledger_sequence: ledgerSeq,
      tx_hash: txHash,
    });
  },

  auction_cancelled: async (auctionId, data, ledgerSeq, txHash) => {
    logger.info(`Auction ${auctionId} cancelled`);

    await insertEvent({
      event_type: "auction_cancelled",
      auction_id: auctionId,
      data,
      ledger_sequence: ledgerSeq,
      tx_hash: txHash,
    });
  },

  attestation_recorded: async (auctionId, data, ledgerSeq, txHash) => {
    logger.info(`Attestation recorded for auction ${auctionId}`);

    await insertEvent({
      event_type: "attestation_recorded",
      auction_id: auctionId,
      data,
      ledger_sequence: ledgerSeq,
      tx_hash: txHash,
    });
  },
};

// ── Event Polling ─────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchEventBatch(
  rpc: SorobanRpc.Server,
  startLedger: number,
): Promise<any> {
  return withRetry(
    () =>
      rpc.getEvents({
        startLedger,
        filters: [
          {
            type: "contract",
            contractIds: [config.contractId],
            topics: [["*", "*", "*"]],
          },
        ],
        limit: config.batchSize,
      }),
    `getEvents(startLedger=${startLedger})`,
  );
}

async function fetchLatestLedger(rpc: SorobanRpc.Server): Promise<number> {
  const latest = await withRetry(
    () => rpc.getLatestLedger(),
    "getLatestLedger",
  );
  return latest.sequence;
}

/**
 * Poll for events using a cursor-based pagination loop.
 *
 * FIX #1 (batch pagination): We loop until we receive fewer than batchSize events,
 * meaning all events from startLedger up to the latest are consumed. If a full
 * batch is returned, we continue from the highest ledger we processed to catch
 * any remaining events at that same ledger.
 *
 * FIX #2 (retry): All RPC calls go through withRetry() with exponential backoff,
 * up to maxRetries attempts.
 *
 * FIX #4 (lastLedger heuristic): When no events are found in the range, we
 * advance lastLedger to latestLedger directly — not latestLedger - 10.
 */
async function pollEvents(
  rpc: SorobanRpc.Server,
  onEvent?: (eventType: string, auctionId: number, data: Record<string, unknown>) => void,
): Promise<void> {
  // Initialize cursor on first run
  if (lastLedger === 0) {
    try {
      const latestSeq = await fetchLatestLedger(rpc);
      // Start 100 ledgers back to catch any events since last run
      lastLedger = Math.max(0, latestSeq - 100);
      logger.info(`Indexer initialized — starting from ledger ${lastLedger} (latest: ${latestSeq})`);
    } catch (err) {
      logger.warn("Could not fetch latest ledger, starting from 0");
      lastLedger = 0;
    }
    return; // Wait for next poll cycle to fetch events
  }

  // Pagination loop: keep fetching until we exhaust all events in the range
  let batchCount = 0;
  let totalProcessed = 0;
  let cursorLedger = lastLedger + 1;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    batchCount++;
    const response = await fetchEventBatch(rpc, cursorLedger);

    const events = response.events ?? [];

    if (events.length === 0) {
      // FIX #4: No more events in range — advance to latest ledger directly
      try {
        const latestSeq = await fetchLatestLedger(rpc);
        lastLedger = latestSeq;
      } catch {
        // If we can't fetch latest, don't advance (will retry next cycle)
      }
      break;
    }

    // Process each event in the batch
    for (const event of events) {
      try {
        await processEvent(event, onEvent);
        totalProcessed++;
      } catch (err) {
        logger.error(`Failed to process event at ledger ${event.ledger}:`, err);
      }
      // Track the highest ledger we've processed
      lastLedger = Math.max(lastLedger, event.ledger);
    }

    // FIX #1: If we got a full batch, there may be more events at/after this ledger.
    // Continue the loop using the last processed ledger as the new start point.
    // Deduplication (FIX #3) will handle any overlap.
    if (events.length < config.batchSize) {
      break;
    }

    cursorLedger = lastLedger;
    logger.debug(
      `Batch ${batchCount}: ${events.length} events (full batch), continuing from ledger ${cursorLedger}`,
    );
  }

  if (totalProcessed > 0) {
    logger.info(
      `Processed ${totalProcessed} events across ${batchCount} batch(es). Last ledger: ${lastLedger}`,
    );
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SorobanEvent = any;

async function processEvent(
  event: SorobanEvent,
  onEvent?: (eventType: string, auctionId: number, data: Record<string, unknown>) => void,
): Promise<void> {
  const value = event.value;

  const topics = value.topics();
  if (topics.length < 2) return;

  const eventType = scValToNative(topics[0]) as string;
  const auctionId = parseInt(String(scValToNative(topics[1])) || "0", 10);

  const data = scValToNative(value.data());

  const handler = handlers[eventType];
  if (handler) {
    const txHash = event.txHash?.toXDR?.() || undefined;
    await handler(auctionId, data as Record<string, unknown>, event.ledger, txHash);
  }
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────────

export async function startIndexer(onEvent?: (eventType: string, auctionId: number, data: Record<string, unknown>) => void): Promise<void> {
  if (isRunning) return;
  isRunning = true;

  const rpc = new SorobanRpc.Server(config.rpcUrl);

  logger.info(`Starting event indexer — RPC: ${config.rpcUrl}, Contract: ${config.contractId}`);

  // Poll for events
  const poll = async () => {
    if (!isRunning) return;
    await fetchEvents(rpc);
    setTimeout(poll, config.pollIntervalMs);
  };

  poll();
}

export function stopIndexer(): void {
  isRunning = false;
}

export function getIndexerConfig(): IndexerConfig {
  return { ...config };
}

// ── Helpers ───────────────────────────────────────────────────────────────────────

function mapFormat(format?: string): "english" | "dutch" | "sealed_bid" {
  switch (format) {
    case "english": return "english";
    case "dutch": return "dutch";
    case "sealed_bid": return "sealed_bid";
    default: return "english";
  }
}
