// REST API routes for auctions and bid history.
import { Router, Request, Response } from "express";
import {
  getAuction,
  getAuctions,
  getBidsForAuction,
  getBidHistory,
  getAnalytics,
} from "../db";

const router = Router();

// GET /api/auctions — List auctions with optional filters
// Query params: status, format, seller, limit, offset
router.get("/", async (req: Request, res: Response) => {
  try {
    const auctions = await getAuctions({
      status: req.query.status as string | undefined,
      format: req.query.format as string | undefined,
      seller: req.query.seller as string | undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined,
    });
    res.json({ success: true, data: auctions });
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to fetch auctions" });
  }
});

// GET /api/bids — Get bid history for a bidder address (MUST come before /:id)
// Query params: bidder, limit, offset
router.get("/bids", async (req: Request, res: Response) => {
  try {
    const bids = await getBidHistory({
      bidder: req.query.bidder as string | undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined,
    });
    res.json({ success: true, data: bids });
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to fetch bid history" });
  }
});

// GET /api/:id — Get single auction detail
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ success: false, error: "Invalid auction ID" });
      return;
    }
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
router.get("/:id/bids", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ success: false, error: "Invalid auction ID" });
      return;
    }
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
