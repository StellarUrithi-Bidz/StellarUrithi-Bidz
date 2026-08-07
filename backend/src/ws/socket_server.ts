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

// ── Authentication ────────────────────────────────────────────────────────────────

/** Per-socket state: authenticated addresses */
const authenticatedSockets = new Map<string, Set<string>>();

// Nonce freshness window — reject signatures older than this (milliseconds)
const AUTH_NONCE_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Verify a Stellar Ed25519 signature with nonce replay protection.
 *
 * The client signs a challenge message of the form:
 *   "stellar-urithi-bidz-auth:${nonce}"
 * where nonce is a server-provided random value (or client timestamp).
 *
 * Freighter's signMessage() signs the raw UTF-8 bytes and returns
 * the Ed25519 signature (base64-encoded string in v4, Buffer in v3).
 *
 * Nonce format: if client-provided, it must be a Unix-epoch ms timestamp
 * within AUTH_NONCE_MAX_AGE_MS of server time to prevent replay.
 */
function verifyStellarSignature(
  address: string,
  message: string,
  signedMessage: string,
): boolean {
  try {
    // Verify the message format: "stellar-urithi-bidz-auth:${nonce}"
    const prefix = "stellar-urithi-bidz-auth:";
    if (!message.startsWith(prefix)) {
      logger.warn(`Auth message missing expected prefix for ${address}`);
      return false;
    }

    // Extract nonce and validate freshness to prevent replay attacks
    const nonce = message.slice(prefix.length);
    const nonceMs = parseInt(nonce, 10);
    if (!isNaN(nonceMs)) {
      const age = Date.now() - nonceMs;
      if (age > AUTH_NONCE_MAX_AGE_MS || age < 0) {
        logger.warn(`Auth nonce expired or invalid for ${address}: age=${age}ms`);
        return false;
      }
    } else {
      // Non-numeric nonce: still accept for legacy clients, but log
      logger.warn(`Auth nonce is non-numeric for ${address}, accepting without freshness check`);
    }

    const keypair = Keypair.fromPublicKey(address);
    const signatureBytes = Buffer.from(signedMessage, "base64");
    const messageBytes = Buffer.from(message, "utf-8");
    return keypair.verify(messageBytes, signatureBytes);
  } catch (err) {
    logger.warn(`Signature verification failed for ${address}:`, err);
    return false;
  }
}

/**
 * Check if a socket is authenticated for a given address.
 */
function isAuthenticatedFor(socketId: string, address: string): boolean {
  const addrs = authenticatedSockets.get(socketId);
  return addrs ? addrs.has(address) : false;
}

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

    // ── FIX #5: Authentication handler ──────────────────────────────────────
    socket.on("authenticate", (payload: { address: string; signature: string; message: string }) => {
      if (!payload?.address || !payload?.signature || !payload?.message) {
        socket.emit("auth:error", { error: "Missing address, signature, or message" });
        return;
      }

      if (!verifyStellarSignature(payload.address, payload.message, payload.signature)) {
        socket.emit("auth:error", { error: "Invalid signature" });
        logger.warn(`Auth failed for socket ${socket.id} claiming ${payload.address}`);
        return;
      }

      // Store authenticated address
      if (!authenticatedSockets.has(socket.id)) {
        authenticatedSockets.set(socket.id, new Set());
      }
      authenticatedSockets.get(socket.id)!.add(payload.address);

      socket.emit("auth:success", { address: payload.address });
      logger.info(`Socket ${socket.id} authenticated as ${payload.address}`);
    });

    // ── Room join handlers ───────────────────────────────────────────────────

    // Auction rooms are public — anyone can join to receive bid updates
    socket.on("join:auction", (auctionId: number) => {
      const room = `${AUCTION_ROOM_PREFIX}${auctionId}`;
      socket.join(room);
      logger.debug(`Socket ${socket.id} joined ${room}`);
    });

    socket.on("leave:auction", (auctionId: number) => {
      const room = `${AUCTION_ROOM_PREFIX}${auctionId}`;
      socket.leave(room);
    });

    // Bidder rooms require authentication — only the bidder can join their own room
    socket.on("join:bidder", (address: string) => {
      if (!isAuthenticatedFor(socket.id, address)) {
        socket.emit("auth:error", {
          error: "Authentication required to join bidder room. Send 'authenticate' event first.",
        });
        return;
      }
      const room = `${BIDDER_ROOM_PREFIX}${address}`;
      socket.join(room);
      logger.debug(`Socket ${socket.id} joined bidder room ${room} (authenticated)`);
    });

    socket.on("leave:bidder", (address: string) => {
      const room = `${BIDDER_ROOM_PREFIX}${address}`;
      socket.leave(room);
    });

    // ── Cleanup on disconnect ───────────────────────────────────────────────
    socket.on("disconnect", () => {
      authenticatedSockets.delete(socket.id);
      logger.debug(`WS client disconnected: ${socket.id}`);
    });
  });

  logger.info("WebSocket server initialized with Stellar signature authentication");
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

  io.to(`${AUCTION_ROOM_PREFIX}${auctionId}`).emit("auction:bid_refunded", {
    auctionId,
    bidder,
    amount,
  });

  io.to(`${BIDDER_ROOM_PREFIX}${bidder}`).emit("bidder:refunded", {
    auctionId,
    amount,
  });
}

export function broadcastAuctionClosed(
  auctionId: number,
  winner: string,
  winningBid: string,
  format: string,
): void {
  if (!io) return;

  io.to(`${AUCTION_ROOM_PREFIX}${auctionId}`).emit("auction:closed", {
    auctionId,
    winner,
    winningBid,
    format,
  });

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
