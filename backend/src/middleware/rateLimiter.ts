// In-memory sliding-window rate limiter for the StellarUrithi-Bidz API.
// Protects against abuse without external dependencies (no Redis required for dev).
// Production deployments should swap this for a Redis-backed limiter.

import { Request, Response, NextFunction } from "express";
import { logger } from "../services/logger";

// Redis client — lazy-initialized when REDIS_URL is set
let redisClient: any = null;
const REDIS_URL = process.env.REDIS_URL;

// ── Configuration ─────────────────────────────────────────────────────────────────

interface RateLimitConfig {
  /** Maximum number of requests allowed in the window */
  maxRequests: number;
  /** Window size in milliseconds */
  windowMs: number;
  /** Optional: custom key generator (default: req.ip) */
  keyGenerator?: (req: Request) => string;
}

const DEFAULT_MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX || "100", 10);
const DEFAULT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || "60000", 10); // 1 minute

// ── Store ─────────────────────────────────────────────────────────────────────────

interface ClientBucket {
  timestamps: number[];
}

const store = new Map<string, ClientBucket>();

// Clean up expired entries every 5 minutes
const CLEANUP_INTERVAL = 5 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of store) {
    bucket.timestamps = bucket.timestamps.filter((t) => now - t < DEFAULT_WINDOW_MS);
    if (bucket.timestamps.length === 0) {
      store.delete(key);
    }
  }
}, CLEANUP_INTERVAL).unref(); // Don't keep the process alive

// ── Middleware factory ────────────────────────────────────────────────────────────

/**
 * Creates a rate-limiting middleware for Express.
 *
 * @param config.maxRequests - Max requests per window (default: 100)
 * @param config.windowMs - Time window in milliseconds (default: 60000 = 1 min)
 */
async function initRedis() {
  if (!REDIS_URL) return;
  try {
    const { Redis } = await import("ioredis");
    redisClient = new Redis(REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 3 });
    await redisClient.connect();
    logger.info("Redis rate limiter connected");
  } catch (err) {
    logger.warn("Redis not available, falling back to in-memory limiter:", err);
    redisClient = null;
  }
}

export function createRateLimiter(config?: Partial<RateLimitConfig>) {
  const maxRequests = config?.maxRequests ?? DEFAULT_MAX_REQUESTS;
  const windowMs = config?.windowMs ?? DEFAULT_WINDOW_MS;
  const keyGenerator = config?.keyGenerator ?? defaultKeyGenerator;

  initRedis();

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const key = keyGenerator(req);
    const now = Date.now();

    let bucket = store.get(key);

    if (!bucket) {
      bucket = { timestamps: [] };
      store.set(key, bucket);
    }

    // Remove timestamps outside the window
    bucket.timestamps = bucket.timestamps.filter((t) => now - t < windowMs);

    if (bucket.timestamps.length >= maxRequests) {
      const oldestInWindow = bucket.timestamps[0];
      const retryAfterMs = windowMs - (now - oldestInWindow);
      const retryAfterSec = Math.ceil(retryAfterMs / 1000);

      logger.warn(
        `Rate limit exceeded for ${key}: ${bucket.timestamps.length}/${maxRequests} requests`,
      );

      res.set("Retry-After", String(retryAfterSec));
      res.set("X-RateLimit-Limit", String(maxRequests));
      res.set("X-RateLimit-Remaining", "0");
      res.status(429).json({
        success: false,
        error: "Too many requests. Please slow down.",
        retryAfter: retryAfterSec,
      });
      return;
    }

    bucket.timestamps.push(now);

    res.set("X-RateLimit-Limit", String(maxRequests));
    res.set("X-RateLimit-Remaining", String(maxRequests - bucket.timestamps.length));

    next();
  };
}

// ── Default instance ──────────────────────────────────────────────────────────────

/** Pre-configured rate limiter with sensible defaults for the API */
export const defaultRateLimiter = createRateLimiter();

// ── Presets ───────────────────────────────────────────────────────────────────────

/** Strict limiter for sensitive endpoints (auction creation, bids) */
export const strictRateLimiter = createRateLimiter({
  maxRequests: 20,
  windowMs: 60_000, // 20 req/min
});

// ── Helpers ───────────────────────────────────────────────────────────────────────

function defaultKeyGenerator(req: Request): string {
  // Use X-Forwarded-For for proxied requests, fallback to req.ip
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    return forwarded.split(",")[0].trim();
  }
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
}
