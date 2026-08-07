// REST API routes for auctions and bid history.
// Query parameters validated via Zod schemas for runtime type-safety.

import { Router, Request, Response } from "express";
import {
  getAuction,
  getAuctions,
  getBidsForAuction,
  getBidHistory,
  getAnalytics,
} from "../db";
import { validate } from "../middleware/validate";
import { listAuctionsSchema, bidHistorySchema, auctionIdSchema } from "../schemas/auctions";
import { strictRateLimiter } from "../middleware/rateLimiter";

const router = Router();

// GET /api — List auctions with optional filters
// Query params: status, format, seller, limit, offset
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

// GET /api/bids — Get bid history for a bidder address (MUST come before /:id)
// Require bidder param — validated as valid Stellar address
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

// GET /api/:id — Get single auction detail
// Validate id param via Zod
router.get("/:id", validate(auctionIdSchema, "params"), async (req: Request, res: Response) => {
  try {
    const { id } = req.params as unknown as { id: number };
    const auction = await getAuction(id);
    if (!auction) {
      res.status(404).json({ success: false, error: "Auction not found" });
      return;
    }
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

// DELETE old duplicate /bids route (now moved above /:id)
// GET /api/analytics — Platform-wide analytics
router.get("/analytics", async (_req: Request, res: Response) => {
  try {
    const analytics = await getAnalytics();
    res.json({ success: true, data: analytics });
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to fetch analytics" });
  }
});

export default router;
