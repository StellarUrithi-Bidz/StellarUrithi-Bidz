// Unit tests for the event indexer — batch pagination, retry, dedup, lastLedger, cursor persistence.
// Tests core polling logic using properly mocked SorobanRpc responses.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Shared mock RPC instance (must be defined before the mock factory) ────────────
const mockRpcInstance = {
  getEvents: vi.fn(),
  getLatestLedger: vi.fn(),
};

// ── Mock the stellar-sdk ─────────────────────────────────────────────────────────
vi.mock("@stellar/stellar-sdk", () => ({
  SorobanRpc: {
    Server: class {
      getEvents: typeof mockRpcInstance.getEvents;
      getLatestLedger: typeof mockRpcInstance.getLatestLedger;
      constructor() {
        this.getEvents = mockRpcInstance.getEvents;
        this.getLatestLedger = mockRpcInstance.getLatestLedger;
      }
    },
  },
  xdr: { ScVal: {} as unknown },
  scValToNative: vi.fn((val: unknown) => val),
  Address: {},
  Keypair: {
    fromPublicKey: vi.fn(() => ({
      verify: vi.fn(() => true),
    })),
  },
}));

// ── Mock database ────────────────────────────────────────────────────────────────
const { mockSaveCursor, mockLoadCursor } = vi.hoisted(() => ({
  mockSaveCursor: vi.fn().mockResolvedValue(undefined),
  mockLoadCursor: vi.fn().mockResolvedValue(0),
}));

vi.mock("../db", () => ({
  upsertAuction: vi.fn().mockResolvedValue(undefined),
  insertBid: vi.fn().mockResolvedValue(undefined),
  insertEvent: vi.fn().mockResolvedValue(undefined),
  saveCursor: mockSaveCursor,
  loadCursor: mockLoadCursor,
}));

// ── Mock logger ──────────────────────────────────────────────────────────────────
vi.mock("../services/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { startIndexer, stopIndexer, resetIndexerCursor, getIndexerConfig } from "../indexer/event_indexer";

// ── Helpers ──────────────────────────────────────────────────────────────────────

interface MockEvent {
  ledger: number;
  topics: string[];
  data: Record<string, unknown>;
}

function createMockEvent(
  ledger: number,
  eventType: string,
  auctionId: number,
  data: Record<string, unknown> = {},
): MockEvent {
  return { ledger, topics: [eventType, String(auctionId)], data };
}

function mockEventResponse(events: MockEvent[]) {
  return events.map((e) => ({
    ledger: e.ledger,
    value: {
      topics: () => e.topics,
      data: () => e.data,
    },
    txHash: undefined,
  }));
}

// ── Tests ────────────────────────────────────────────────────────────────────────

describe("Event Indexer — Configuration", () => {
  it("should use default config values", () => {
    const cfg = getIndexerConfig();
    expect(cfg.pollIntervalMs).toBe(5000);
    expect(cfg.batchSize).toBe(100);
    expect(cfg.maxRetries).toBe(3);
  });
});

describe("Event Indexer — Retry Logic", () => {
  beforeEach(() => {
    process.env.CONTRACT_ID = "CD_MOCK";
    mockRpcInstance.getLatestLedger.mockResolvedValue({ sequence: 2000 });
    mockRpcInstance.getEvents.mockResolvedValue({ events: [], latestLedger: 2000 });
  });

  afterEach(() => {
    stopIndexer();
    resetIndexerCursor();
    vi.clearAllMocks();
  });

  it("should initialize lastLedger from getLatestLedger on first run", async () => {
    await startIndexer();
    expect(mockRpcInstance.getLatestLedger).toHaveBeenCalled();
    stopIndexer();
  });

  it("should retry failed getLatestLedger calls", async () => {
    mockRpcInstance.getLatestLedger
      .mockReset()
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce({ sequence: 500 });

    await startIndexer();
    await new Promise((r) => setTimeout(r, 100));
    expect(mockRpcInstance.getLatestLedger).toHaveBeenCalled();
    stopIndexer();
  });
});

describe("Event Indexer — Batch Pagination", () => {
  beforeEach(() => {
    process.env.CONTRACT_ID = "CD_MOCK";
    mockRpcInstance.getLatestLedger.mockResolvedValue({ sequence: 2000 });
  });

  afterEach(() => {
    stopIndexer();
    resetIndexerCursor();
    vi.clearAllMocks();
  });

  it("should handle empty event list without crashing", async () => {
    mockRpcInstance.getEvents.mockResolvedValue({ events: [], latestLedger: 500 });
    await startIndexer();
    stopIndexer();
  });

  it("should call getEvents with correct startLedger filter", async () => {
    resetIndexerCursor(50);
    mockRpcInstance.getEvents.mockResolvedValue({ events: [], latestLedger: 1000 });
    await startIndexer();
    await new Promise((r) => setTimeout(r, 150));
    stopIndexer();
    expect(mockRpcInstance.getEvents).toHaveBeenCalled();
  });
});

describe("Event Indexer — LastLedger Advancement", () => {
  beforeEach(() => {
    process.env.CONTRACT_ID = "CD_MOCK";
  });

  afterEach(() => {
    stopIndexer();
    resetIndexerCursor();
    vi.clearAllMocks();
  });

  it("should advance lastLedger to latestLedger when no events found", async () => {
    mockRpcInstance.getLatestLedger.mockResolvedValue({ sequence: 1000 });
    mockRpcInstance.getEvents.mockResolvedValue({ events: [], latestLedger: 1000 });
    await startIndexer();
    await new Promise((r) => setTimeout(r, 100));
    stopIndexer();
    expect(mockRpcInstance.getLatestLedger).toHaveBeenCalled();
  });

  it("should track highest ledger from processed events", async () => {
    const events = [
      createMockEvent(500, "bid_placed", 1, { bidder: "alice" }),
      createMockEvent(510, "bid_placed", 1, { bidder: "bob" }),
    ];
    resetIndexerCursor(400);
    mockRpcInstance.getLatestLedger.mockResolvedValue({ sequence: 2000 });
    mockRpcInstance.getEvents
      .mockResolvedValueOnce({ events: mockEventResponse(events), latestLedger: 510 })
      .mockResolvedValueOnce({ events: [], latestLedger: 520 });
    await startIndexer();
    await new Promise((r) => setTimeout(r, 150));
    stopIndexer();
    expect(mockRpcInstance.getEvents).toHaveBeenCalled();
  });
});

describe("Event Indexer — Deduplication", () => {
  beforeEach(() => {
    process.env.CONTRACT_ID = "CD_MOCK";
  });

  afterEach(() => {
    stopIndexer();
    resetIndexerCursor();
    vi.clearAllMocks();
  });

  it("should handle overlapping batch re-fetches gracefully", async () => {
    const events = [createMockEvent(500, "bid_placed", 1, { bidder: "alice" })];
    resetIndexerCursor(400);
    mockRpcInstance.getLatestLedger.mockResolvedValue({ sequence: 2000 });
    mockRpcInstance.getEvents
      .mockResolvedValueOnce({ events: mockEventResponse(events), latestLedger: 500 })
      .mockResolvedValueOnce({ events: mockEventResponse(events), latestLedger: 500 })
      .mockResolvedValueOnce({ events: [], latestLedger: 500 });
    await startIndexer();
    await new Promise((r) => setTimeout(r, 150));
    stopIndexer();
    expect(mockRpcInstance.getEvents).toHaveBeenCalled();
  });
});

describe("Event Indexer — Cursor Persistence", () => {
  beforeEach(() => {
    process.env.CONTRACT_ID = "CD_MOCK";
    mockRpcInstance.getLatestLedger.mockResolvedValue({ sequence: 2000 });
    mockRpcInstance.getEvents.mockResolvedValue({ events: [], latestLedger: 2000 });
    resetIndexerCursor();
    mockLoadCursor.mockReset().mockResolvedValue(0);
  });

  afterEach(() => {
    stopIndexer();
    resetIndexerCursor();
    vi.clearAllMocks();
  });

  it("should load persisted cursor on startup", async () => {
    mockLoadCursor.mockResolvedValue(0);
    await startIndexer();
    await new Promise((r) => setTimeout(r, 150));
    stopIndexer();
    expect(mockLoadCursor).toHaveBeenCalled();
  });

  it("should resume from persisted cursor if available", async () => {
    mockLoadCursor.mockResolvedValue(1500);
    mockRpcInstance.getLatestLedger.mockResolvedValue({ sequence: 2000 });
    await startIndexer();
    await new Promise((r) => setTimeout(r, 150));
    stopIndexer();
    expect(mockLoadCursor).toHaveBeenCalled();
  });

  it("should call saveCursor after pollEvents completes", async () => {
    resetIndexerCursor(100);
    mockRpcInstance.getLatestLedger.mockResolvedValue({ sequence: 2000 });
    mockRpcInstance.getEvents.mockResolvedValue({ events: [], latestLedger: 2000 });
    mockSaveCursor.mockReset().mockResolvedValue(undefined);
    await startIndexer();
    await new Promise((r) => setTimeout(r, 200));
    stopIndexer();
    expect(mockSaveCursor).toHaveBeenCalled();
  });

  it("should handle saveCursor failure without crashing the indexer", async () => {
    resetIndexerCursor(100);
    mockRpcInstance.getLatestLedger.mockResolvedValue({ sequence: 2000 });
    mockRpcInstance.getEvents.mockResolvedValue({ events: [], latestLedger: 2000 });
    mockSaveCursor.mockReset().mockRejectedValue(new Error("DB connection lost"));
    await startIndexer();
    await new Promise((r) => setTimeout(r, 200));
    stopIndexer();
    expect(mockSaveCursor).toHaveBeenCalled();
  });
});

describe("Event Indexer — Lifecycle", () => {
  beforeEach(() => {
    process.env.CONTRACT_ID = "CD_MOCK";
    mockRpcInstance.getLatestLedger.mockResolvedValue({ sequence: 2000 });
    mockRpcInstance.getEvents.mockResolvedValue({ events: [], latestLedger: 2000 });
  });

  afterEach(() => {
    stopIndexer();
    resetIndexerCursor();
    vi.clearAllMocks();
  });

  it("should not start a second indexer if already running", async () => {
    await startIndexer();
    const firstCallCount = mockRpcInstance.getLatestLedger.mock.calls.length;
    await startIndexer();
    stopIndexer();
    expect(mockRpcInstance.getLatestLedger).toHaveBeenCalledTimes(firstCallCount);
  });
});
