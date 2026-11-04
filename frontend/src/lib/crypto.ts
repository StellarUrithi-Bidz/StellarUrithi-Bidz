// Cryptographic utilities for Sealed-Bid Commit-Reveal auctions

/**
 * Generates a cryptographically secure 32-byte salt as a hex string and Uint8Array.
 */
export function generateSalt(): { bytes: Uint8Array; hex: string } {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return { bytes, hex };
}

/**
 * Converts a hex string back to a Uint8Array.
 */
export function hexToBytes(hex: string): Uint8Array {
  const matches = hex.match(/.{1,2}/g);
  if (!matches) return new Uint8Array(0);
  return new Uint8Array(matches.map((byte) => parseInt(byte, 16)));
}

/**
 * Computes an HMAC-SHA256 commitment over (auctionId, bidderAddress, amount, salt).
 * Matches the Soroban contract commitment algorithm:
 * HMAC_SHA256(key = salt, message = auction_id || bidder_address || amount)
 */
export async function computeCommitment(
  auctionId: number,
  bidderAddress: string,
  amount: string,
  saltBytes: Uint8Array
): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const keyBuffer = saltBytes.buffer.slice(
    saltBytes.byteOffset,
    saltBytes.byteOffset + saltBytes.byteLength
  ) as ArrayBuffer;

  const cryptoKey = await window.crypto.subtle.importKey(
    "raw",
    keyBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const msgBuffer = new ArrayBuffer(8 + 56 + 16);
  const view = new DataView(msgBuffer);

  // 1. auction_id as BigInt u64 (8 bytes, big-endian)
  view.setBigUint64(0, BigInt(auctionId), false);

  // 2. bidder address (56 characters UTF-8)
  const addrBytes = enc.encode(bidderAddress.padEnd(56, " "));
  new Uint8Array(msgBuffer, 8, 56).set(addrBytes.subarray(0, 56));

  // 3. amount as i128 (high 64 bits = 0, low 64 bits = BigInt(amount))
  view.setBigUint64(64, BigInt(0), false);
  view.setBigUint64(72, BigInt(amount), false);

  const sigBuffer = await window.crypto.subtle.sign("HMAC", cryptoKey, msgBuffer);
  return new Uint8Array(sigBuffer);
}
