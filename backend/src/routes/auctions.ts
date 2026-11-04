// REST API routes for auctions and bid history.
// Query parameters and POST bodies validated via Zod schemas.
// POST endpoints require Stellar Ed25519 signature authentication.

import { Router, Request, Response } from "express";
import {
  getAuction, getAuctions, getBidsForAuction,
  getBidHistory, getAnalytics, checkDatabaseHealth,
} from "../db";
import { logger } from "../services/logger";
import { validate } from "../middleware/validate";
import { stellarAuthMiddleware } from "../middleware/auth";
import {
  listAuctionsSchema, bidHistorySchema, auctionIdSchema,
  createAuctionBodySchema, placeBidBodySchema,
} from "../schemas/auctions";
import { strictRateLimiter } from "../middleware/rateLimiter";

const router = Router();

// GET /api/health — Service and database health check
router.get("/health", async (_req: Request, res: Response) => {
  const dbHealthy = await checkDatabaseHealth();
  const status = dbHealthy ? 200 : 503;
  res.status(status).json({
    status: dbHealthy ? "healthy" : "unhealthy",
    database: dbHealthy ? "connected" : "disconnected",
    timestamp: new Date().toISOString(),
  });
});

// GET /api — List auctions with optional filters
router.get("/", validate(listAuctionsSchema), async (req: Request, res: Response) => {
  try {
    const auctions = await getAuctions({
      status: req.query.status as string | undefined,
      format: req.query.format as string | undefined,
      seller: req.query.seller as string | undefined,
      limit: req.query.limit as number | undefined,
      offset: req.query.offset as number | undefined,
    });
    res.json({ success: true, data: auctions });
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to fetch auctions" });
  }
});

// GET /api/bids — Get bid history for a bidder
router.get("/bids", validate(bidHistorySchema), async (req: Request, res: Response) => {
  try {
    const bids = await getBidHistory({
      bidder: req.query.bidder as string,
      limit: req.query.limit as number | undefined,
      offset: req.query.offset as number | undefined,
    });
    res.json({ success: true, data: bids });
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to fetch bid history" });
  }
});

// GET /api/analytics — Platform-wide analytics (must come before /:id)
router.get("/analytics", async (_req: Request, res: Response) => {
  try {
    const analytics = await getAnalytics();
    res.json({ success: true, data: analytics });
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to fetch analytics" });
  }
});

// POST /api/simulate-create — Pre-flight parameter validation and fee breakdown
router.post("/simulate-create", validate(createAuctionBodySchema, "body"), async (req: Request, res: Response) => {
  try {
    const body = req.body;
    const royaltyBps = body.royalty_bps || 0;
    const platformFeeBps = body.platform_fee_bps || 250;

    if (royaltyBps + platformFeeBps > 10_000) {
      res.status(400).json({
        success: false,
        error: "Combined royalty and platform fee exceeds 10,000 basis points (100%)",
      });
      return;
    }

    const sellerProceedsBps = 10_000 - (royaltyBps + platformFeeBps);
    res.json({
      success: true,
      simulation: {
        valid: true,
        royalty_bps: royaltyBps,
        platform_fee_bps: platformFeeBps,
        seller_proceeds_bps: sellerProceedsBps,
        estimated_start_time: body.start_time,
        estimated_end_time: body.end_time,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to simulate auction creation" });
  }
});

// GET /api/:id — Get single auction detail
router.get("/:id", validate(auctionIdSchema, "params"), async (req: Request, res: Response) => {
  try {
    const { id } = req.params as unknown as { id: number };
    const auction = await getAuction(id);
    if (!auction) { res.status(404).json({ success: false, error: "Auction not found" }); return; }
    res.json({ success: true, data: auction });
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to fetch auction" });
  }
});

// GET /api/:id/bids — Get bid history for an auction
router.get("/:id/bids", validate(auctionIdSchema, "params"), async (req: Request, res: Response) => {
  try {
    const { id } = req.params as unknown as { id: number };
    const bids = await getBidsForAuction(id);
    res.json({ success: true, data: bids });
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to fetch bids" });
  }
});

// POST /api/:id/simulate-bid — Pre-flight validation for a prospective bid
router.post("/:id/simulate-bid", validate(auctionIdSchema, "params"), validate(placeBidBodySchema, "body"), async (req: Request, res: Response) => {
  try {
    const { id } = req.params as unknown as { id: number };
    const body = req.body;
    const auction = await getAuction(id);
    if (!auction) {
      res.status(404).json({ success: false, error: "Auction not found" });
      return;
    }

    if (auction.status !== "active" && auction.status !== "created") {
      res.status(400).json({ success: false, error: `Auction is ${auction.status}, bids not accepted` });
      return;
    }

    const currentHighest = BigInt(auction.highest_bid || "0");
    const reservePrice = BigInt(auction.reserve_price || "0");
    const minIncrement = BigInt(auction.min_increment || "0");
    const proposedBid = BigInt(body.bid_amount);

    const minRequired = currentHighest === 0n ? reservePrice : currentHighest + minIncrement;
    if (proposedBid < minRequired) {
      res.status(400).json({
        success: false,
        error: `Bid too low. Minimum required: ${minRequired.toString()}`,
        current_highest: currentHighest.toString(),
        minimum_required: minRequired.toString(),
      });
      return;
    }

    res.json({
      success: true,
      simulation: {
        valid: true,
        proposed_bid: proposedBid.toString(),
        previous_highest: currentHighest.toString(),
        outbid_address: auction.highest_bidder || null,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to simulate bid" });
  }
});

// POST /api — Create auction (auth required, rate-limited)
router.post("/", strictRateLimiter, validate(createAuctionBodySchema, "body"),
  stellarAuthMiddleware("seller"),
  async (req: Request, res: Response) => {
    try {
      const body = req.body;
      const auctionId = Date.now();
      logger.info(`Auction creation validated — seller: ${body.seller}, format: ${body.format}`);
      res.status(201).json({
        success: true,
        data: { id: auctionId, message: "Auction creation validated. Submit on-chain transaction.", validated: body },
      });
    } catch (err) {
      logger.error("Failed to create auction:", err);
      res.status(500).json({ success: false, error: "Failed to create auction" });
    }
});

// POST /api/:id/bids — Place bid (auth required, rate-limited)
router.post("/:id/bids", strictRateLimiter,
  validate(auctionIdSchema, "params"),
  validate(placeBidBodySchema, "body"),
  stellarAuthMiddleware("bidder"),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params as unknown as { id: number };
      const body = req.body;
      const auction = await getAuction(id);
      if (!auction) { res.status(404).json({ success: false, error: "Auction not found" }); return; }
      logger.info(`Bid validated — auction: ${id}, bidder: ${body.bidder}, amount: ${body.bid_amount}`);
      res.status(201).json({
        success: true,
        data: { auction_id: id, message: "Bid validated. Submit on-chain transaction.", validated: body },
      });
    } catch (err) {
      logger.error("Failed to place bid:", err);
      res.status(500).json({ success: false, error: "Failed to place bid" });
    }
});

export default router;
