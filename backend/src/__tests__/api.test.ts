import { describe, it, expect, vi, beforeEach } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";

vi.mock("../db", () => ({
  getAuctions: vi.fn().mockResolvedValue([{ id: 1, seller: "GA...", format: "english", status: "active" }]),
  getAuction: vi.fn().mockImplementation((id: number) => {
    if (id === 1) {
      return Promise.resolve({
        id: 1,
        seller: "GA...",
        format: "english",
        status: "active",
        reserve_price: "100",
        min_increment: "10",
        highest_bid: "150",
        highest_bidder: "GB...",
      });
    }
    return Promise.resolve(null);
  }),
  getBidsForAuction: vi.fn().mockResolvedValue([]),
  getBidHistory: vi.fn().mockResolvedValue([]),
  getAnalytics: vi.fn().mockResolvedValue({ total_auctions: 10, total_volume: "5000", active_auctions: 3, settled_auctions: 7 }),
  checkDatabaseHealth: vi.fn().mockResolvedValue(true),
}));

vi.mock("../middleware/rateLimiter", () => ({
  defaultRateLimiter: (_: any, __: any, n: any) => n(),
  strictRateLimiter: (_: any, __: any, n: any) => n(),
}));

vi.mock("../services/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import express from "express";
import request from "supertest";
import auctionRoutes from "../routes/auctions";
import { stellarAuthMiddleware, verifyEd25519Signature } from "../middleware/auth";

describe("Auction API Routes", () => {
  let app: express.Express;
  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use("/api", auctionRoutes);
  });

  it("GET /api/health returns 200 when database is healthy", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("healthy");
    expect(res.body.database).toBe("connected");
  });

  it("GET /api returns auction list", async () => {
    const res = await request(app).get("/api");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it("GET /api/:id returns single auction detail", async () => {
    const res = await request(app).get("/api/1");
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(1);
  });

  it("GET /api/999 returns 404 for non-existent auction", async () => {
    const res = await request(app).get("/api/999");
    expect(res.status).toBe(404);
  });

  it("GET /api/analytics returns platform statistics", async () => {
    const res = await request(app).get("/api/analytics");
    expect(res.status).toBe(200);
    expect(res.body.data.total_auctions).toBe(10);
  });

  it("POST /api/simulate-create validates valid fee configuration", async () => {
    const res = await request(app).post("/api/simulate-create").send({
      seller: "GBZXN7PIRZGNMHGA728V3U2D5KOCG6YQ5QU55GU2TVGNM3456789ABCD",
      format: "english",
      item_type: "digital",
      payment_token: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
      reserve_price: "100",
      royalty_bps: 500,
      platform_fee_bps: 250,
      start_time: Math.floor(Date.now() / 1000) + 60,
      end_time: Math.floor(Date.now() / 1000) + 3600,
      metadata_uri: "ipfs://valid",
      min_increment: "10",
    });
    expect(res.status).toBe(200);
    expect(res.body.simulation.valid).toBe(true);
    expect(res.body.simulation.seller_proceeds_bps).toBe(9250);
  });

  it("POST /api/simulate-create rejects combined fee overflow > 10,000 bps", async () => {
    const res = await request(app).post("/api/simulate-create").send({
      seller: "GBZXN7PIRZGNMHGA728V3U2D5KOCG6YQ5QU55GU2TVGNM3456789ABCD",
      format: "english",
      item_type: "digital",
      payment_token: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
      reserve_price: "100",
      royalty_bps: 9800,
      platform_fee_bps: 300,
      start_time: Math.floor(Date.now() / 1000) + 60,
      end_time: Math.floor(Date.now() / 1000) + 3600,
      metadata_uri: "ipfs://overflow",
      min_increment: "10",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Combined royalty and platform fee exceeds");
  });

  it("POST /api/:id/simulate-bid rejects bids below minimum increment", async () => {
    const res = await request(app).post("/api/1/simulate-bid").send({
      bidder: "GBZXN7PIRZGNMHGA728V3U2D5KOCG6YQ5QU55GU2TVGNM3456789ABCD",
      bid_amount: "155", // Highest is 150, min increment is 10, requires 160
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Bid too low");
  });

  it("POST /api/:id/simulate-bid accepts bids meeting increment", async () => {
    const res = await request(app).post("/api/1/simulate-bid").send({
      bidder: "GBZXN7PIRZGNMHGA728V3U2D5KOCG6YQ5QU55GU2TVGNM3456789ABCD",
      bid_amount: "165",
    });
    expect(res.status).toBe(200);
    expect(res.body.simulation.valid).toBe(true);
  });
});

describe("Ed25519 Auth Middleware Security", () => {
  let app: express.Express;
  const keypair = Keypair.random();
  const address = keypair.publicKey();

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.post("/test-auth", stellarAuthMiddleware("bidder"), (req, res) => {
      res.json({ success: true, user: req.body.bidder });
    });
  });

  it("rejects requests missing auth headers", async () => {
    const res = await request(app).post("/test-auth").send({ bidder: address });
    expect(res.status).toBe(401);
    expect(res.body.error).toContain("Missing Stellar authentication headers");
  });

  it("rejects non-numeric nonce to prevent expiration bypass", async () => {
    const message = "stellar-urithi-bidz-auth:static_string_bypass";
    const signature = keypair.sign(Buffer.from(message, "utf-8")).toString("base64");

    const res = await request(app)
      .post("/test-auth")
      .set("x-stellar-signature", signature)
      .set("x-stellar-auth-message", message)
      .send({ bidder: address });

    expect(res.status).toBe(401);
    expect(res.body.error).toContain("Invalid auth nonce format");
  });

  it("rejects expired nonce timestamps (> 5 minutes old)", async () => {
    const expiredTimestamp = Date.now() - 6 * 60 * 1000;
    const message = `stellar-urithi-bidz-auth:${expiredTimestamp}`;
    const signature = keypair.sign(Buffer.from(message, "utf-8")).toString("base64");

    const res = await request(app)
      .post("/test-auth")
      .set("x-stellar-signature", signature)
      .set("x-stellar-auth-message", message)
      .send({ bidder: address });

    expect(res.status).toBe(401);
    expect(res.body.error).toContain("Authentication nonce expired");
  });

  it("accepts valid signed message with fresh timestamp", async () => {
    const freshTimestamp = Date.now() - 5000;
    const message = `stellar-urithi-bidz-auth:${freshTimestamp}`;
    const signature = keypair.sign(Buffer.from(message, "utf-8")).toString("base64");

    const res = await request(app)
      .post("/test-auth")
      .set("x-stellar-signature", signature)
      .set("x-stellar-auth-message", message)
      .send({ bidder: address });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("rejects replay attacks using the same fresh nonce", async () => {
    const nonce = `${Date.now() - 2000}:replay_test`;
    const message = `stellar-urithi-bidz-auth:${nonce}`;
    const signature = keypair.sign(Buffer.from(message, "utf-8")).toString("base64");

    // First request should succeed
    const firstRes = await request(app)
      .post("/test-auth")
      .set("x-stellar-signature", signature)
      .set("x-stellar-auth-message", message)
      .send({ bidder: address });
    expect(firstRes.status).toBe(200);

    // Second request with exact same message/nonce must be rejected as replay
    const secondRes = await request(app)
      .post("/test-auth")
      .set("x-stellar-signature", signature)
      .set("x-stellar-auth-message", message)
      .send({ bidder: address });
    expect(secondRes.status).toBe(401);
    expect(secondRes.body.error).toContain("already used");
  });

  it("rejects signature signed by a different keypair", async () => {
    const otherKeypair = Keypair.random();
    const freshTimestamp = Date.now();
    const message = `stellar-urithi-bidz-auth:${freshTimestamp}`;
    const fakeSignature = otherKeypair.sign(Buffer.from(message, "utf-8")).toString("base64");

    const res = await request(app)
      .post("/test-auth")
      .set("x-stellar-signature", fakeSignature)
      .set("x-stellar-auth-message", message)
      .send({ bidder: address });

    expect(res.status).toBe(401);
    expect(res.body.error).toContain("Invalid Stellar signature");
  });
});
