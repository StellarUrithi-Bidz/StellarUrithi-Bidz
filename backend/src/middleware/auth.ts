// Stellar Ed25519 signature verification middleware for POST endpoints.
// Validates that the caller controls the Stellar address they claim to own
// by verifying an Ed25519 signature over a challenge message.

import { Request, Response, NextFunction } from "express";
import { Keypair } from "@stellar/stellar-sdk";
import { logger } from "../services/logger";

// Nonce freshness window — 5 minutes
export const AUTH_NONCE_MAX_AGE_MS = 5 * 60 * 1000;

// Replay cache: stores (address + ":" + nonce) -> timestamp
const seenNonces = new Map<string, number>();

// Periodic cleanup of expired replay cache entries (every 60 seconds)
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of seenNonces.entries()) {
    if (now - timestamp > AUTH_NONCE_MAX_AGE_MS) {
      seenNonces.delete(key);
    }
  }
}, 60 * 1000).unref();

export function verifyEd25519Signature(address: string, message: string, signatureBase64: string): boolean {
  try {
    const keypair = Keypair.fromPublicKey(address);
    return keypair.verify(
      Buffer.from(message, "utf-8"),
      Buffer.from(signatureBase64, "base64")
    );
  } catch (err) {
    logger.warn(`Signature verification failed for ${address}:`, err);
    return false;
  }
}

/**
 * Middleware that verifies the X-Stellar-Signature header against
 * the bidder/seller address in the request body.
 *
 * The client must sign a message: "stellar-urithi-bidz-auth:${nonce}"
 * and send:
 *   - X-Stellar-Signature: base64-encoded Ed25519 signature
 *   - X-Stellar-Auth-Message: the signed message
 *
 * The body must contain a "bidder" or "seller" field matching the signer.
 */
export function stellarAuthMiddleware(addressField: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const address = req.body?.[addressField] as string | undefined;
    const signature = req.headers["x-stellar-signature"] as string | undefined;
    const message = req.headers["x-stellar-auth-message"] as string | undefined;

    if (!address || !signature || !message) {
      res.status(401).json({
        success: false,
        error: "Missing Stellar authentication headers or body address field",
      });
      return;
    }

    // Verify message format
    const prefix = "stellar-urithi-bidz-auth:";
    if (!message.startsWith(prefix)) {
      res.status(401).json({ success: false, error: "Invalid auth message format" });
      return;
    }

    const nonce = message.slice(prefix.length).trim();
    if (!nonce) {
      res.status(401).json({ success: false, error: "Auth message missing nonce" });
      return;
    }

    // Extract timestamp: either pure numeric timestamp or "timestamp:random"
    const timestampPart = nonce.split(":")[0];
    const nonceMs = parseInt(timestampPart, 10);
    if (isNaN(nonceMs) || !/^\d+$/.test(timestampPart)) {
      res.status(401).json({ success: false, error: "Invalid auth nonce format — expected timestamp" });
      return;
    }

    // Check freshness window
    const now = Date.now();
    const age = now - nonceMs;
    if (age > AUTH_NONCE_MAX_AGE_MS || age < -30000) { // allow 30s clock skew
      logger.warn(`Auth nonce expired for ${address}: age=${age}ms`);
      res.status(401).json({ success: false, error: "Authentication nonce expired" });
      return;
    }

    // Replay attack prevention check
    const replayKey = `${address}:${nonce}`;
    if (seenNonces.has(replayKey)) {
      logger.warn(`Auth replay detected for ${address}: nonce=${nonce}`);
      res.status(401).json({ success: false, error: "Authentication nonce already used" });
      return;
    }

    // Verify Ed25519 signature
    const valid = verifyEd25519Signature(address, message, signature);
    if (!valid) {
      res.status(401).json({ success: false, error: "Invalid Stellar signature" });
      return;
    }

    // Mark nonce as used
    seenNonces.set(replayKey, now);

    logger.debug(`Stellar auth verified for ${address}`);
    next();
  };
}
