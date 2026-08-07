// StellarUrithi-Bidz Backend Indexer & API Server
// Main entry point — initializes database, starts event indexer, WebSocket, and REST API.

import http from "http";
import express from "express";
import cors from "cors";
import { initializeDatabase } from "./db";
import { startIndexer } from "./indexer/event_indexer";
import { initializeWebSocket, broadcastNewBid, broadcastAuctionCreated, broadcastAuctionClosed, broadcastAuctionSettled, broadcastAuctionCancelled, broadcastBidRefunded, broadcastAttestationRecorded } from "./ws/socket_server";
import { logger } from "./services/logger";
import auctionRoutes from "./routes/auctions";
import { defaultRateLimiter } from "./middleware/rateLimiter";

const PORT = parseInt(process.env.PORT || "4000", 10);

async function main(): Promise<void> {
  // ── Database ─────────────────────────────────────────────────────────────
  logger.info("Connecting to PostgreSQL...");
  await initializeDatabase();
  logger.info("Database ready.");

  // ── Express ──────────────────────────────────────────────────────────────
  const app = express();

  app.use(cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
  }));
  app.use(express.json());

  // Rate limiting — 100 req/min per IP by default
  app.use(defaultRateLimiter);

  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      service: "stellar-urithi-bidz-backend",
      timestamp: new Date().toISOString(),
    });
  });

  // Mount routes
  app.use("/api", auctionRoutes);

  // ── HTTP + WebSocket Server ──────────────────────────────────────────────
  const server = http.createServer(app);
  const io = initializeWebSocket(server);

  server.listen(PORT, () => {
    logger.info(`Backend server listening on port ${PORT}`);
  });

  // ── Event Indexer ────────────────────────────────────────────────────────
  // The indexer polls the Stellar network and pushes events to WebSocket clients
  const contractId = process.env.CONTRACT_ID;
  if (!contractId) {
    logger.warn("CONTRACT_ID not set — event indexer will not start.");
    logger.warn("Set CONTRACT_ID env var to the deployed auction contract address.");
  } else {
    await startIndexer(async (eventType, auctionId, data) => {
      // Push events to WebSocket clients in real-time
      switch (eventType) {
        case "auction_created":
          broadcastAuctionCreated({
            id: auctionId,
            seller: data.seller as string,
            format: data.format as string,
            reserve_price: String(data.reserve_price || "0"),
            end_time: data.end_time as number,
            metadata_uri: data.metadata_uri as string,
          });
          break;
        case "bid_placed":
          broadcastNewBid(auctionId, {
            bidder: data.bidder as string,
            amount: String(data.amount || "0"),
            timestamp: data.timestamp as number,
            is_winning: true,
          });
          break;
        case "bid_refunded":
          broadcastBidRefunded(auctionId, data.bidder as string, String(data.amount || "0"));
          break;
        case "auction_closed":
          broadcastAuctionClosed(
            auctionId,
            data.winner as string,
            String(data.winning_bid || "0"),
            data.format as string
          );
          break;
        case "auction_settled":
          broadcastAuctionSettled(auctionId, {
            seller_proceeds: String(data.seller_proceeds || "0"),
            royalty_amount: String(data.royalty_amount || "0"),
            platform_fee: String(data.platform_fee || "0"),
          });
          break;
        case "auction_cancelled":
          broadcastAuctionCancelled(auctionId);
          break;
        case "attestation_recorded":
          broadcastAttestationRecorded(auctionId, data.custodian as string);
          break;
      }
    });
  }

  // ── Graceful shutdown ───────────────────────────────────────────────────
  const shutdown = async () => {
    logger.info("Shutting down gracefully...");
    server.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  logger.error("Failed to start backend:", err);
  process.exit(1);
});
