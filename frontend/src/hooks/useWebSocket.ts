// Custom hook for real-time WebSocket updates from the backend.
// Uses a singleton socket connection shared across all hooks to prevent connection leaks.
//
// Updated: Support for Stellar Ed25519 signature authentication for bidder rooms.
// Auction rooms remain public; bidder rooms require authentication.

"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { io, Socket } from "socket.io-client";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "http://localhost:4000";

// Singleton socket reference — shared across all hook instances
let sharedSocket: Socket | null = null;
function getSocket(): Socket {
  if (!sharedSocket || !sharedSocket.connected) {
    sharedSocket = io(WS_URL, {
      transports: ["websocket", "polling"],
    });
  }
  return sharedSocket;
}

// ── Authentication helpers ─────────────────────────────────────────────────────

/** Sign a challenge message using Freighter and authenticate the WebSocket */
export async function authenticateSocket(
  socket: Socket,
  address: string,
  signMessageFn: (message: string) => Promise<string>,
): Promise<boolean> {
  const message = `stellar-urithi-bidz-auth:${Date.now()}`;
  try {
    const signature = await signMessageFn(message);
    return new Promise((resolve) => {
      socket.emit("authenticate", { address, signature, message });
      socket.once("auth:success", () => resolve(true));
      socket.once("auth:error", () => resolve(false));
      // Timeout after 10s
      setTimeout(() => resolve(false), 10000);
    });
  } catch {
    return false;
  }
}

/** Check if the socket is already authenticated for an address */
let cachedAuth: { address: string; socketId: string } | null = null;
export function isSocketAuthenticated(address: string): boolean {
  return cachedAuth?.address === address && cachedAuth?.socketId === sharedSocket?.id;
}

// ── Event types ──────────────────────────────────────────────────────────────────

export interface BidEvent {
  auctionId: number;
  bidder: string;
  amount: string;
  timestamp: number;
  is_winning: boolean;
}

export interface AuctionClosedEvent {
  auctionId: number;
  winner: string;
  winningBid: string;
  format: string;
}

export interface AuctionSettledEvent {
  auctionId: number;
  seller_proceeds: string;
  royalty_amount: string;
  platform_fee: string;
}

export interface AuctionCreatedEvent {
  id: number;
  seller: string;
  format: string;
  reserve_price: string;
  end_time: number;
  metadata_uri: string;
}

// ── Hooks ───────────────────────────────────────────────────────────────────────

export function useAuctionSocket(auctionId: number | null) {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [latestBid, setLatestBid] = useState<BidEvent | null>(null);
  const [auctionClosed, setAuctionClosed] = useState<AuctionClosedEvent | null>(null);
  const [auctionSettled, setAuctionSettled] = useState<AuctionSettledEvent | null>(null);

  useEffect(() => {
    if (!auctionId) return;

    const socket = getSocket();
    socketRef.current = socket;

    const onConnect = () => {
      setIsConnected(true);
      socket.emit("join:auction", auctionId);
    };

    const onDisconnect = () => setIsConnected(false);

    const onNewBid = (data: BidEvent) => {
      setLatestBid(data);
    };

    const onClosed = (data: AuctionClosedEvent) => {
      setAuctionClosed(data);
    };

    const onSettled = (data: AuctionSettledEvent) => {
      setAuctionSettled(data);
    };

    const onCancelled = () => {
      setAuctionClosed({
        auctionId,
        winner: "",
        winningBid: "0",
        format: "english",
      });
    };

    if (socket.connected) {
      onConnect();
    }
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("auction:new_bid", onNewBid);
    socket.on("auction:closed", onClosed);
    socket.on("auction:settled", onSettled);
    socket.on("auction:cancelled", onCancelled);

    return () => {
      socket.emit("leave:auction", auctionId);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("auction:new_bid", onNewBid);
      socket.off("auction:closed", onClosed);
      socket.off("auction:settled", onSettled);
      socket.off("auction:cancelled", onCancelled);
    };
  }, [auctionId]);

  const clearLatestBid = useCallback(() => setLatestBid(null), []);

  return { isConnected, latestBid, auctionClosed, auctionSettled, clearLatestBid };
}

export function useBidderSocket(address: string | null) {
  const [notification, setNotification] = useState<{
    type: string;
    auctionId: number;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!address) return;

    const socket = getSocket();

    const onConnect = () => {
      socket.emit("join:bidder", address);
    };

    const onRefunded = (data: { auctionId: number; amount: string }) => {
      setNotification({
        type: "refunded",
        auctionId: data.auctionId,
        message: `You've been refunded ${data.amount} stroops — you were outbid!`,
      });
    };

    const onWon = (data: { auctionId: number; winningBid: string }) => {
      setNotification({
        type: "won",
        auctionId: data.auctionId,
        message: `You won auction #${data.auctionId} with a bid of ${data.winningBid} stroops!`,
      });
    };

    if (socket.connected) {
      onConnect();
    }
    socket.on("connect", onConnect);
    socket.on("bidder:refunded", onRefunded);
    socket.on("bidder:won", onWon);

    return () => {
      socket.off("connect", onConnect);
      socket.off("bidder:refunded", onRefunded);
      socket.off("bidder:won", onWon);
    };
  }, [address]);

  const clearNotification = useCallback(() => setNotification(null), []);

  return { notification, clearNotification };
}
