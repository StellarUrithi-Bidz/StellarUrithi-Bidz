// Pinata IPFS upload client for StellarUrithi-Bidz.
//
// Uses the Pinata v3 Files API (https://uploads.pinata.cloud/v3/files) with JWT auth.
// Uploads are proxied through a Next.js API route to keep the JWT secret server-side.
//
// Construction:
//   ipfs://<CID>         — the canonical IPFS URI stored on-chain
//   gateway URL           — read-only HTTP access for displaying images in the browser

const GATEWAY = process.env.NEXT_PUBLIC_PINATA_GATEWAY || "https://gateway.pinata.cloud";

// ── Types ─────────────────────────────────────────────────────────────────────────

export interface PinataUploadResult {
  cid: string;
  ipfsUri: string;
  gatewayUrl: string;
}

export interface AuctionMetadata {
  name: string;
  description: string;
  image: string; // ipfs:// CID of the primary image
  external_url?: string;
  attributes?: MetadataAttribute[];
  /** Additional images for gallery display */
  gallery?: string[];
  /** Creator / artist information */
  artist?: string;
  /** Year of creation */
  year?: number;
  /** Medium / materials */
  medium?: string;
  /** Dimensions */
  dimensions?: string;
  /** Provenance / origin */
  provenance?: string;
}

export interface MetadataAttribute {
  trait_type: string;
  value: string | number;
  display_type?: "number" | "date" | "boost_percentage";
}

// ── API Client ────────────────────────────────────────────────────────────────────

/**
 * Upload a file (image, document, etc.) to IPFS via the backend API route.
 * Returns the CID, `ipfs://` URI, and gateway URL.
 */
export async function uploadFile(file: File): Promise<PinataUploadResult> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/ipfs/upload", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Upload failed" }));
    throw new Error(error.error || `Upload failed with status ${response.status}`);
  }

  const result: PinataUploadResult = await response.json();
  return result;
}

/**
 * Upload JSON metadata to IPFS.
 * Wraps the JSON object in a Blob and uploads as application/json.
 * Use this after uploading images, so the metadata `image` field
 * references the already-uploaded image CID.
 */
export async function uploadMetadata(
  metadata: AuctionMetadata
): Promise<PinataUploadResult> {
  const jsonString = JSON.stringify(metadata, null, 2);
  const blob = new Blob([jsonString], { type: "application/json" });
  const file = new File([blob], "metadata.json", { type: "application/json" });

  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/ipfs/upload", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Upload failed" }));
    throw new Error(error.error || `Metadata upload failed with status ${response.status}`);
  }

  const result: PinataUploadResult = await response.json();
  return result;
}

// ── URI Construction ──────────────────────────────────────────────────────────────

/**
 * Convert a CID to an ipfs:// protocol URI.
 * Example: "bafybeihgxdzljxb26q6nf3r3eifqeedsvt2eubqtskghpme66cgjyw4fra" → "ipfs://bafybei..."
 */
export function cidToIpfsUri(cid: string): string {
  return `ipfs://${cid}`;
}

/**
 * Convert an ipfs:// URI (or bare CID) to a gateway URL for browser display.
 * Accepts: "ipfs://<cid>" or bare "<cid>"
 */
export function ipfsUriToGateway(uriOrCid: string, gateway?: string): string {
  const cid = uriOrCid.replace(/^ipfs:\/\//, "");
  const gw = gateway || GATEWAY;
  return `${gw}/ipfs/${cid}`;
}

/**
 * Extract the bare CID from an ipfs:// URI.
 * Example: "ipfs://bafybeihgx..." → "bafybeihgx..."
 */
export function extractCid(ipfsUri: string): string {
  return ipfsUri.replace(/^ipfs:\/\//, "");
}

/**
 * Check if a string is a valid IPFS CID (CIDv0 starts with Qm, CIDv1 starts with b).
 */
export function isValidCid(str: string): boolean {
  const cid = extractCid(str);
  return /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{58,})$/.test(cid);
}
