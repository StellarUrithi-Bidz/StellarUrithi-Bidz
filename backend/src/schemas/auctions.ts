// Zod validation schemas for auction API query parameters and POST bodies.
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

// ── POST body schemas ────────────────────────────────────────────────────────────

/** POST /api/auctions — create auction form body */
export const createAuctionBodySchema = z.object({
  seller: z
    .string()
    .min(56, "Seller address must be 56 characters")
    .max(56)
    .regex(/^G[A-Z2-7]{55}$/, "Invalid Stellar public key"),
  original_creator: z
    .string()
    .min(56)
    .max(56)
    .regex(/^G[A-Z2-7]{55}$/, "Invalid Stellar public key"),
  format: z.enum(AUCTION_FORMATS, {
    errorMap: () => ({ message: "Format must be english, dutch, or sealed_bid" }),
  }),
  item_type: z.enum(["digital", "physical"]),
  nft_contract: z
    .string()
    .regex(/^C[A-Z2-7]{55}$/, "Invalid Stellar contract address")
    .optional(),
  token_id: z.number().int().positive().optional(),
  custodian: z
    .string()
    .regex(/^G[A-Z2-7]{55}$/, "Invalid custodian address")
    .optional(),
  payment_token: z
    .string()
    .min(1, "Payment token is required"),
  reserve_price: z
    .string()
    .regex(/^\d+$/, "Reserve price must be a positive integer")
    .refine((v) => BigInt(v) > 0n, "Reserve price must be positive"),
  royalty_bps: z.number().int().min(0).max(10000, "Max 100% royalty"),
  start_time: z.number().int().positive("Start time must be a future timestamp"),
  end_time: z.number().int().positive("End time must be a future timestamp"),
  metadata_uri: z.string().min(1, "Metadata URI is required"),
  // English-specific
  min_increment: z.string().regex(/^\d+$/).optional(),
  // Dutch-specific
  start_price: z.string().regex(/^\d+$/).optional(),
  price_decay_per_second: z.string().regex(/^\d+$/).optional(),
  // Sealed-bid-specific
  commit_deadline: z.number().int().positive().optional(),
  reveal_deadline: z.number().int().positive().optional(),
  max_bidders: z.number().int().min(1).max(1000).optional(),
}).refine(
  (data) => data.end_time > data.start_time,
  { message: "End time must be after start time", path: ["end_time"] },
);

/** POST /api/auctions/:id/bids — place bid body */
export const placeBidBodySchema = z.object({
  bidder: z
    .string()
    .min(56)
    .max(56)
    .regex(/^G[A-Z2-7]{55}$/, "Invalid Stellar public key"),
  bid_amount: z
    .string()
    .regex(/^\d+$/, "Bid amount must be a positive integer in stroops")
    .refine((v) => BigInt(v) > 0n, "Bid amount must be positive"),
  format: z.enum(AUCTION_FORMATS),
});

// ── Inferred types ────────────────────────────────────────────────────────────────

export type ListAuctionsQuery = z.infer<typeof listAuctionsSchema>;
export type BidHistoryQuery = z.infer<typeof bidHistorySchema>;
export type CreateAuctionBody = z.infer<typeof createAuctionBodySchema>;
export type PlaceBidBody = z.infer<typeof placeBidBodySchema>;
