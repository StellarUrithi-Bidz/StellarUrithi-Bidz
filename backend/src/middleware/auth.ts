// Stellar Ed25519 signature verification middleware for POST endpoints.
// Validates that the caller controls the Stellar address they claim to own
// by verifying an Ed25519 signature over a challenge message.
// Uses the same verification logic as the WebSocket auth module.

import { Request, Response, NextFunction } from "express";
import { Keypair } from "@stellar/stellar-sdk";
import { logger } from "../services/logger";

// Nonce freshness window — 5 minutes
const AUTH_NONCE_MAX_AGE_MS = 5 * 60 * 1000;

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

    // Verify message format and nonce freshness
    const prefix = "stellar-urithi-bidz-auth:";
    if (!message.startsWith(prefix)) {
      res.status(401).json({ success: false, error: "Invalid auth message format" });
      return;
    }

    const nonce = message.slice(prefix.length);
    const nonceMs = parseInt(nonce, 10);
    if (!isNaN(nonceMs)) {
      const age = Date.now() - nonceMs;
      if (age > AUTH_NONCE_MAX_AGE_MS || age < 0) {
        logger.warn(`Auth nonce expired for ${address}: age=${age}ms`);
        res.status(401).json({ success: false, error: "Authentication nonce expired" });
        return;
      }
    }

    // Verify Ed25519 signature
    try {
      const keypair = Keypair.fromPublicKey(address);
      const valid = keypair.verify(
        Buffer.from(message, "utf-8"),
        Buffer.from(signature, "base64")
      );
      if (!valid) {
        res.status(401).json({ success: false, error: "Invalid Stellar signature" });
        return;
      }
    } catch (err) {
      logger.warn(`Signature verification failed for ${address}:`, err);
      res.status(401).json({ success: false, error: "Signature verification failed" });
      return;
    }

    logger.debug(`Stellar auth verified for ${address}`);
    next();
  };
}
