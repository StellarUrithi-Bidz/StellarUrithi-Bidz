import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db", () => ({
  getAuctions: vi.fn().mockResolvedValue([{ id: 1, seller: "GA...", format: "english", status: "active" }]),
  getAuction: vi.fn().mockResolvedValue({ id: 1, seller: "GA...", format: "english" }),
  getBidsForAuction: vi.fn().mockResolvedValue([]),
  getBidHistory: vi.fn().mockResolvedValue([]),
  getAnalytics: vi.fn().mockResolvedValue({ total_auctions: 10, total_volume: "5000", active_auctions: 3, settled_auctions: 7 }),
}));

vi.mock("../middleware/rateLimiter", () => ({
  defaultRateLimiter: (_: any, __: any, n: any) => n(),
  strictRateLimiter: (_: any, __: any, n: any) => n(),
}));

vi.mock("../middleware/auth", () => ({
  stellarAuthMiddleware: () => (_: any, __: any, n: any) => n(),
}));

vi.mock("../services/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import express from "express";
import request from "supertest";
import auctionRoutes from "../routes/auctions";

describe("Auction API", () => {
  let app: express.Express;
  beforeEach(() => { app = express(); app.use(express.json()); app.use("/api", auctionRoutes); });

  it("GET /api returns auctions", async () => {
    const res = await request(app).get("/api");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("GET /api/:id returns single auction", async () => {
    const res = await request(app).get("/api/1");
    expect(res.status).toBe(200);
  });

  it("GET /api/analytics returns stats", async () => {
    const res = await request(app).get("/api/analytics");
    expect(res.status).toBe(200);
    expect(res.body.data.total_auctions).toBe(10);
  });

  it("POST /api validates body", async () => {
    const res = await request(app).post("/api").send({});
    expect(res.status).toBe(400);
  });
});
