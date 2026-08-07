// Zod validation schemas for auction API query parameters.
// Provides runtime type-safety and clear error messages for API consumers.

import { z } from "zod";

// ── Shared constants ──────────────────────────────────────────────────────────────

const AUCTION_STATUSES = ["created", "active", "ended", "settled", "cancelled"] as const;
const AUCTION_FORMATS = ["english", "dutch", "sealed_bid"] as const;

// ── Query schemas ─────────────────────────────────────────────────────────────────

/** GET /api — list auctions with filters */
export const listAuctionsSchema = z.object({
  status: z.enum(AUCTION_STATUSES).optional(),
  format: z.enum(AUCTION_FORMATS).optional(),
  seller: z
    .string()
    .min(56, "Stellar address must be 56 characters")
    .max(56, "Stellar address must be 56 characters")
    .regex(/^G[A-Z2-7]{55}$/, "Invalid Stellar public key")
    .optional(),
  limit: z
    .string()
    .regex(/^\d+$/, "Limit must be a positive integer")
    .transform(Number)
    .pipe(z.number().int().min(1).max(500))
    .optional(),
  offset: z
    .string()
    .regex(/^\d+$/, "Offset must be a non-negative integer")
    .transform(Number)
    .pipe(z.number().int().min(0))
    .optional(),
});

/** GET /bids — bid history (optionally filtered by bidder) */
export const bidHistorySchema = z.object({
  bidder: z
    .string()
    .min(56, "Stellar address must be 56 characters")
    .max(56, "Stellar address must be 56 characters")
    .regex(/^G[A-Z2-7]{55}$/, "Invalid Stellar public key")
    .optional(),
  limit: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .pipe(z.number().int().min(1).max(500))
    .optional(),
  offset: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .pipe(z.number().int().min(0))
    .optional(),
});

/** GET /:id — single auction by ID */
export const auctionIdSchema = z.object({
  id: z
    .string()
    .regex(/^\d+$/, "Auction ID must be a positive integer")
    .transform(Number)
    .pipe(z.number().int().positive()),
});

// ── Inferred types ────────────────────────────────────────────────────────────────

export type ListAuctionsQuery = z.infer<typeof listAuctionsSchema>;
export type BidHistoryQuery = z.infer<typeof bidHistorySchema>;
