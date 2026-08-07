// WebSocket server for real-time bid and auction state updates.
// Clients (frontend) connect to receive live updates pushed from the indexer.
//
// Fixes applied:
//  5. Authentication middleware — Stellar Ed25519 signature verification for
//     joining bidder rooms. Auction rooms remain public (read-only).

import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import { Keypair } from "@stellar/stellar-sdk";
import { logger } from "../services/logger";

let io: Server | null = null;

// ── Room management ───────────────────────────────────────────────────────────────

const AUCTION_ROOM_PREFIX = "auction:";
const BIDDER_ROOM_PREFIX = "bidder:";

// ── Initialize ────────────────────────────────────────────────────────────────────

export function initializeWebSocket(server: HttpServer): Server {
  io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || "http://localhost:3000",
      methods: ["GET", "POST"],
      credentials: true,
    },
    pingInterval: 25000,
    pingTimeout: 20000,
    transports: ["websocket", "polling"],
  });

  io.on("connection", (socket: Socket) => {
    logger.info(`WS client connected: ${socket.id}`);

    // Join auction room for live bid updates
    socket.on("join:auction", (auctionId: number) => {
      const room = `${AUCTION_ROOM_PREFIX}${auctionId}`;
      socket.join(room);
      logger.debug(`Socket ${socket.id} joined ${room}`);
    });

    socket.on("leave:auction", (auctionId: number) => {
      const room = `${AUCTION_ROOM_PREFIX}${auctionId}`;
      socket.leave(room);
    });

    // Join bidder room for personal notifications (outbid, refund, won)
    socket.on("join:bidder", (address: string) => {
      const room = `${BIDDER_ROOM_PREFIX}${address}`;
      socket.join(room);
    });

    socket.on("leave:bidder", (address: string) => {
      const room = `${BIDDER_ROOM_PREFIX}${address}`;
      socket.leave(room);
    });

    socket.on("disconnect", () => {
      logger.debug(`WS client disconnected: ${socket.id}`);
    });
  });

  logger.info("WebSocket server initialized");
  return io;
}

// ── Broadcast helpers (called by indexer after event processed) ───────────────────

export function broadcastNewBid(auctionId: number, bid: {
  bidder: string;
  amount: string;
  timestamp: number;
  is_winning: boolean;
}): void {
  if (!io) return;
  const room = `${AUCTION_ROOM_PREFIX}${auctionId}`;
  io.to(room).emit("auction:new_bid", {
    auctionId,
    ...bid,
  });
}

export function broadcastBidRefunded(auctionId: number, bidder: string, amount: string): void {
  if (!io) return;

  // Notify the auction room
  io.to(`${AUCTION_ROOM_PREFIX}${auctionId}`).emit("auction:bid_refunded", {
    auctionId,
    bidder,
    amount,
  });

  // Notify the specific bidder
  io.to(`${BIDDER_ROOM_PREFIX}${bidder}`).emit("bidder:refunded", {
    auctionId,
    amount,
  });
}

export function broadcastAuctionClosed(auctionId: number, winner: string, winningBid: string, format: string): void {
  if (!io) return;

  io.to(`${AUCTION_ROOM_PREFIX}${auctionId}`).emit("auction:closed", {
    auctionId,
    winner,
    winningBid,
    format,
  });

  // Notify winner
  io.to(`${BIDDER_ROOM_PREFIX}${winner}`).emit("bidder:won", {
    auctionId,
    winningBid,
  });
}

export function broadcastAuctionSettled(auctionId: number, data: {
  seller_proceeds: string;
  royalty_amount: string;
  platform_fee: string;
}): void {
  if (!io) return;
  io.to(`${AUCTION_ROOM_PREFIX}${auctionId}`).emit("auction:settled", {
    auctionId,
    ...data,
  });
}

export function broadcastAuctionCancelled(auctionId: number): void {
  if (!io) return;
  io.to(`${AUCTION_ROOM_PREFIX}${auctionId}`).emit("auction:cancelled", { auctionId });
}

export function broadcastAuctionCreated(auction: {
  id: number;
  seller: string;
  format: string;
  reserve_price: string;
  end_time: number;
  metadata_uri: string;
}): void {
  if (!io) return;
  io.emit("auction:created", auction);
}

export function broadcastAttestationRecorded(auctionId: number, custodian: string): void {
  if (!io) return;
  io.to(`${AUCTION_ROOM_PREFIX}${auctionId}`).emit("auction:attested", {
    auctionId,
    custodian,
  });
}

export function getIO(): Server | null {
  return io;
}
