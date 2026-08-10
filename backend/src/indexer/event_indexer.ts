// Stellar Soroban Event Indexer with type-safe topic parsing.
// Handles Address, Symbol, String, and scalar topic values correctly.

import { SorobanRpc, xdr, scValToNative, Address } from "@stellar/stellar-sdk";
import { upsertAuction, insertBid, insertEvent, saveCursor, loadCursor, AuctionRecord, BidRecord } from "../db";
import { logger } from "../services/logger";

interface IndexerConfig { rpcUrl: string; contractId: string; pollIntervalMs: number; batchSize: number; maxRetries: number; }
const config: IndexerConfig = {
  rpcUrl: process.env.STELLAR_RPC_URL || "https://soroban-testnet.stellar.org",
  contractId: process.env.CONTRACT_ID || "",
  pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || "5000", 10),
  batchSize: parseInt(process.env.EVENT_BATCH_SIZE || "100", 10),
  maxRetries: parseInt(process.env.INDEXER_MAX_RETRIES || "3", 10),
};

let lastLedger = 0; let isRunning = false;

async function withRetry<T>(fn: () => Promise<T>, label: string, maxRetries: number = config.maxRetries): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try { return await fn(); }
    catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 30000);
        logger.warn(`[retry] ${label} attempt ${attempt}/${maxRetries} failed, retrying in ${delay}ms: ${lastError.message}`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

// Type-safe topic value extraction
function extractTopicValue(scVal: unknown): string | number {
  const native = scValToNative(scVal as xdr.ScVal);
  if (typeof native === "string") return native;
  if (typeof native === "number" || typeof native === "bigint") return Number(native);
  if (typeof native === "object" && native !== null) {
    // Handle Address objects from Soroban events
    const obj = native as Record<string, unknown>;
    if (typeof obj.toString === "function" && obj.constructor?.name === "Address") {
      return String(obj);
    }
    return JSON.stringify(native);
  }
  return String(native ?? "0");
}

type EventHandler = (auctionId: number, data: Record<string, unknown>, ledgerSeq: number, txHash?: string) => Promise<void>;

const handlers: Record<string, EventHandler> = {
  auction_created: async (auctionId, data, ledgerSeq, txHash) => {
    const record: AuctionRecord = {
      id: auctionId, seller: (data.seller as string)||"", original_creator: (data.original_creator as string)||"",
      format: mapFormat(data.format as string), status: "created",
      item_type: ((data.item_type as string)||"digital") as "digital"|"physical",
      nft_contract: (data.nft_contract as string)||undefined, token_id: (data.token_id as number)||undefined,
      custodian: (data.custodian as string)||undefined, attestation_hash: (data.attestation_hash as string)||undefined,
      payment_token: (data.payment_token as string)||"", reserve_price: String(data.reserve_price||"0"),
      royalty_bps: (data.royalty_bps as number)||0, platform_fee_bps: (data.platform_fee_bps as number)||250,
      start_time: (data.start_time as number)||0, end_time: (data.end_time as number)||0,
      commit_deadline: (data.commit_deadline as number)||undefined, reveal_deadline: (data.reveal_deadline as number)||undefined,
      metadata_uri: (data.metadata_uri as string)||"", min_increment: String(data.min_increment||"0"),
      start_price: String(data.start_price||"0"), price_decay_per_second: String(data.price_decay_per_second||"0"),
      highest_bidder: undefined, highest_bid: "0", current_dutch_price: String(data.start_price||"0"), attested: false,
    };
    await upsertAuction(record);
    await insertEvent({ event_type: "auction_created", auction_id: auctionId, data: record as unknown as Record<string,unknown>, ledger_sequence: ledgerSeq, tx_hash: txHash });
  },
  bid_placed: async (auctionId, data, ledgerSeq, txHash) => {
    const bid: BidRecord = { auction_id: auctionId, bidder: (data.bidder as string)||"", amount: String(data.amount||"0"), format: mapFormat(data.format as string), timestamp: (data.timestamp as number)||Date.now(), is_winning: true };
    await insertBid(bid);
    await insertEvent({ event_type: "bid_placed", auction_id: auctionId, data: bid as unknown as Record<string,unknown>, ledger_sequence: ledgerSeq, tx_hash: txHash });
  },
  bid_refunded: async (auctionId, data, ledgerSeq, txHash) => { await insertEvent({ event_type: "bid_refunded", auction_id: auctionId, data, ledger_sequence: ledgerSeq, tx_hash: txHash }); },
  auction_closed: async (auctionId, data, ledgerSeq, txHash) => { await insertEvent({ event_type: "auction_closed", auction_id: auctionId, data, ledger_sequence: ledgerSeq, tx_hash: txHash }); },
  auction_settled: async (auctionId, data, ledgerSeq, txHash) => { await insertEvent({ event_type: "auction_settled", auction_id: auctionId, data, ledger_sequence: ledgerSeq, tx_hash: txHash }); },
  auction_cancelled: async (auctionId, data, ledgerSeq, txHash) => { await insertEvent({ event_type: "auction_cancelled", auction_id: auctionId, data, ledger_sequence: ledgerSeq, tx_hash: txHash }); },
  attestation_recorded: async (auctionId, data, ledgerSeq, txHash) => { await insertEvent({ event_type: "attestation_recorded", auction_id: auctionId, data, ledger_sequence: ledgerSeq, tx_hash: txHash }); },
};

async function fetchEventBatch(rpc: SorobanRpc.Server, startLedger: number): Promise<any> {
  return withRetry(() => rpc.getEvents({ startLedger, filters: [{ type: "contract", contractIds: [config.contractId], topics: [["*", "*", "*"]] }], limit: config.batchSize }), `getEvents(startLedger=${startLedger})`);
}

async function fetchLatestLedger(rpc: SorobanRpc.Server): Promise<number> {
  const latest = await withRetry(() => rpc.getLatestLedger(), "getLatestLedger");
  return latest.sequence;
}

async function pollEvents(rpc: SorobanRpc.Server, onEvent?: (eventType: string, auctionId: number, data: Record<string, unknown>) => void): Promise<void> {
  if (lastLedger === 0) {
    try { const persisted = await loadCursor(); if (persisted > 0) { lastLedger = persisted; return; } } catch { logger.warn("Could not load persisted cursor"); }
    try { const latestSeq = await fetchLatestLedger(rpc); lastLedger = Math.max(0, latestSeq - 100); } catch { lastLedger = 0; }
    return;
  }
  let batchCount = 0, totalProcessed = 0, cursorLedger = lastLedger + 1;
  while (true) {
    batchCount++;
    const response = await fetchEventBatch(rpc, cursorLedger);
    const events = response.events ?? [];
    if (events.length === 0) {
      try { lastLedger = await fetchLatestLedger(rpc); } catch {}
      break;
    }
    for (const event of events) {
      try { await processEvent(event, onEvent); totalProcessed++; } catch (err) { logger.error(`Event processing failed at ledger ${event.ledger}:`, err); }
      lastLedger = Math.max(lastLedger, event.ledger);
    }
    if (events.length < config.batchSize) break;
    cursorLedger = lastLedger;
  }
  if (totalProcessed > 0) logger.info(`Processed ${totalProcessed} events across ${batchCount} batch(es). Last ledger: ${lastLedger}`);
  try { await saveCursor(lastLedger); } catch (err) { logger.error("Failed to persist cursor:", err); }
}

type SorobanEvent = any;

async function processEvent(event: SorobanEvent, onEvent?: (eventType: string, auctionId: number, data: Record<string, unknown>) => void): Promise<void> {
  const value = event.value;
  const topics = value.topics();
  if (topics.length < 2) return;

  const eventType = scValToNative(topics[0]) as string;
  // Type-safe auction ID extraction — handles Address, scalar, and string topics
  const auctionIdRaw = extractTopicValue(topics[1]);
  const auctionId = typeof auctionIdRaw === "number" ? auctionIdRaw : parseInt(String(auctionIdRaw), 10);
  if (isNaN(auctionId)) { logger.warn(`Skipping event with unparseable auction ID: ${auctionIdRaw}`); return; }

  const data = scValToNative(value.data());
  const handler = handlers[eventType];
  if (handler) {
    const txHash = event.txHash?.toXDR?.() || undefined;
    await handler(auctionId, data as Record<string, unknown>, event.ledger, txHash);
  }
  if (onEvent) onEvent(eventType, auctionId, data as Record<string, unknown>);
}

export async function startIndexer(onEvent?: (eventType: string, auctionId: number, data: Record<string, unknown>) => void): Promise<void> {
  if (isRunning) return; isRunning = true;
  const rpc = new SorobanRpc.Server(config.rpcUrl);
  let polling = false;
  const poll = async () => {
    if (!isRunning) return;
    if (polling) { setTimeout(poll, config.pollIntervalMs); return; }
    polling = true;
    try { await pollEvents(rpc, onEvent); } catch (err) { logger.error("Poll cycle failed:", err); }
    finally { polling = false; setTimeout(poll, config.pollIntervalMs); }
  };
  poll();
}

export function stopIndexer(): void { isRunning = false; }
export function resetIndexerCursor(toLedger?: number): void { lastLedger = toLedger ?? 0; }
export function getIndexerConfig(): IndexerConfig { return { ...config }; }

function mapFormat(format?: string): "english"|"dutch"|"sealed_bid" {
  switch (format) { case "english": return "english"; case "dutch": return "dutch"; case "sealed_bid": return "sealed_bid"; default: return "english"; }
}
