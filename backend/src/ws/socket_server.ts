// WebSocket server with Stellar Ed25519 signature authentication.
// Uses server-provided random nonces for replay protection (stronger
// than client-timestamp nonces).

import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import { Keypair } from "@stellar/stellar-sdk";
import { randomUUID } from "crypto";
import { logger } from "../services/logger";

let io: Server | null = null;

const AUCTION_ROOM_PREFIX = "auction:";
const BIDDER_ROOM_PREFIX = "bidder:";
const authenticatedSockets = new Map<string, Set<string>>();

// Server-provided nonces — stronger than client timestamps
const serverNonces = new Map<string, { nonce: string; expires: number }>();
const AUTH_NONCE_MAX_AGE_MS = 5 * 60 * 1000;

// Periodic cleanup of expired server nonces to prevent unbounded memory growth
setInterval(() => {
  const now = Date.now();
  for (const [address, entry] of serverNonces.entries()) {
    if (now > entry.expires) {
      serverNonces.delete(address);
    }
  }
}, 60 * 1000).unref();

function verifyStellarSignature(address: string, message: string, signedMessage: string): boolean {
  try {
    const prefix = "stellar-urithi-bidz-auth:";
    if (!message.startsWith(prefix)) { logger.warn(`Auth message missing prefix for ${address}`); return false; }
    const nonce = message.slice(prefix.length).trim();
    if (!nonce) { logger.warn(`Auth message missing nonce for ${address}`); return false; }

    // Server nonce check
    const serverNonce = serverNonces.get(address);
    if (serverNonce) {
      if (Date.now() > serverNonce.expires) { logger.warn(`Server nonce expired for ${address}`); serverNonces.delete(address); return false; }
      if (nonce !== serverNonce.nonce) { logger.warn(`Server nonce mismatch for ${address}`); return false; }
      serverNonces.delete(address);
    } else {
      // Fallback: client timestamp nonce with freshness check
      const timestampPart = nonce.split(":")[0];
      const nonceMs = parseInt(timestampPart, 10);
      if (isNaN(nonceMs) || !/^\d+$/.test(timestampPart)) {
        logger.warn(`Auth nonce invalid format for ${address}: ${nonce}`);
        return false;
      }
      const age = Date.now() - nonceMs;
      if (age > AUTH_NONCE_MAX_AGE_MS || age < -30000) {
        logger.warn(`Auth nonce expired for ${address}: age=${age}ms`);
        return false;
      }
    }
    const keypair = Keypair.fromPublicKey(address);
    return keypair.verify(Buffer.from(message, "utf-8"), Buffer.from(signedMessage, "base64"));
  } catch (err) { logger.warn(`Signature verification failed:`, err); return false; }
}

function isAuthenticatedFor(socketId: string, address: string): boolean {
  const addrs = authenticatedSockets.get(socketId);
  return addrs ? addrs.has(address) : false;
}

export function initializeWebSocket(server: HttpServer): Server {
  io = new Server(server, {
    cors: { origin: process.env.FRONTEND_URL || "http://localhost:3000", methods: ["GET", "POST"], credentials: true },
    pingInterval: 25000, pingTimeout: 20000, transports: ["websocket", "polling"],
  });

  io.on("connection", (socket: Socket) => {
    logger.info(`WS client connected: ${socket.id}`);

    // Request server nonce — stronger than client-side timestamps
    socket.on("auth:request_nonce", (payload: { address: string }) => {
      if (!payload?.address) { socket.emit("auth:error", { error: "Missing address" }); return; }
      const nonce = randomUUID();
      serverNonces.set(payload.address, { nonce, expires: Date.now() + AUTH_NONCE_MAX_AGE_MS });
      socket.emit("auth:nonce", { nonce, message: `stellar-urithi-bidz-auth:${nonce}` });
    });

    socket.on("authenticate", (payload: { address: string; signature: string; message: string }) => {
      if (!payload?.address || !payload?.signature || !payload?.message) {
        socket.emit("auth:error", { error: "Missing address, signature, or message" }); return;
      }
      if (!verifyStellarSignature(payload.address, payload.message, payload.signature)) {
        socket.emit("auth:error", { error: "Invalid signature" }); return;
      }
      if (!authenticatedSockets.has(socket.id)) authenticatedSockets.set(socket.id, new Set());
      authenticatedSockets.get(socket.id)!.add(payload.address);
      socket.emit("auth:success", { address: payload.address });
      logger.info(`Socket ${socket.id} authenticated as ${payload.address}`);
    });

    socket.on("join:auction", (auctionId: number) => { socket.join(`${AUCTION_ROOM_PREFIX}${auctionId}`); });
    socket.on("leave:auction", (auctionId: number) => { socket.leave(`${AUCTION_ROOM_PREFIX}${auctionId}`); });

    socket.on("join:bidder", (address: string) => {
      if (!isAuthenticatedFor(socket.id, address)) { socket.emit("auth:error", { error: "Authentication required. Send authenticate event first." }); return; }
      socket.join(`${BIDDER_ROOM_PREFIX}${address}`);
    });
    socket.on("leave:bidder", (address: string) => { socket.leave(`${BIDDER_ROOM_PREFIX}${address}`); });
    socket.on("disconnect", () => { authenticatedSockets.delete(socket.id); });
  });

  logger.info("WebSocket server initialized with server-nonce Stellar auth");
  return io;
}

export function broadcastNewBid(auctionId: number, bid: { bidder: string; amount: string; timestamp: number; is_winning: boolean }): void {
  if (!io) return; io.to(`${AUCTION_ROOM_PREFIX}${auctionId}`).emit("auction:new_bid", { auctionId, ...bid });
}
export function broadcastBidRefunded(auctionId: number, bidder: string, amount: string): void {
  if (!io) return; io.to(`${AUCTION_ROOM_PREFIX}${auctionId}`).emit("auction:bid_refunded", { auctionId, bidder, amount });
  io.to(`${BIDDER_ROOM_PREFIX}${bidder}`).emit("bidder:refunded", { auctionId, amount });
}
export function broadcastAuctionExtended(auctionId: number, newEndTime: number): void {
  if (!io) return; io.to(`${AUCTION_ROOM_PREFIX}${auctionId}`).emit("auction:extended", { auctionId, newEndTime });
}
export function broadcastAuctionClosed(auctionId: number, winner?: string, finalPrice?: string): void {
  if (!io) return; io.to(`${AUCTION_ROOM_PREFIX}${auctionId}`).emit("auction:closed", { auctionId, winner, finalPrice });
}
export function broadcastAuctionSettled(auctionId: number): void {
  if (!io) return; io.to(`${AUCTION_ROOM_PREFIX}${auctionId}`).emit("auction:settled", { auctionId });
}
