// Next.js API Route: POST /api/ipfs/upload
// Proxies file uploads to Pinata v3 Files API, keeping the JWT secret on the server.
// Supports images (jpeg, png, gif, webp, svg), documents (pdf), and JSON metadata.

import { NextRequest, NextResponse } from "next/server";

const PINATA_JWT = process.env.PINATA_JWT;
const PINATA_UPLOAD_URL = "https://uploads.pinata.cloud/v3/files";

// In-memory IP rate limiter: 30 requests per minute
const ipHits = new Map<string, { count: number; reset: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 30;

// Allowed MIME types for auction items and certificates
const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "application/json",
  "application/pdf",
];

export async function POST(request: NextRequest) {
  // ── Rate limit check ──────────────────────────────────────────────────────
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anonymous";
  const now = Date.now();
  const hit = ipHits.get(ip);

  if (hit && now < hit.reset) {
    if (hit.count >= RATE_LIMIT_MAX) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Maximum 30 uploads per minute allowed." },
        { status: 429 }
      );
    }
    hit.count++;
  } else {
    ipHits.set(ip, { count: 1, reset: now + RATE_LIMIT_WINDOW_MS });
  }

  // Periodic cleanup
  if (ipHits.size > 1000) {
    for (const [key, val] of ipHits.entries()) {
      if (now > val.reset) ipHits.delete(key);
    }
  }

  // ── Auth check ────────────────────────────────────────────────────────────
  if (!PINATA_JWT) {
    return NextResponse.json(
      { error: "Pinata JWT not configured on server" },
      { status: 500 }
    );
  }

  // ── Parse the multipart form ──────────────────────────────────────────────
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid form data" },
      { status: 400 }
    );
  }

  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json(
      { error: "No file provided. Send as multipart/form-data with field name 'file'." },
      { status: 400 }
    );
  }

  // ── Validate file type ────────────────────────────────────────────────────
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      {
        error: `File type '${file.type}' not allowed. Allowed types: ${ALLOWED_TYPES.join(", ")}`,
      },
      { status: 400 }
    );
  }

  // ── Validate file size (10MB server-side limit for the API route) ─────────
  const MAX_SIZE = 10 * 1024 * 1024; // 10MB
  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      {
        error: `File too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Max size: 10MB via this API route.`,
      },
      { status: 413 }
    );
  }

  // ── Forward to Pinata ─────────────────────────────────────────────────────
  try {
    const pinataFormData = new FormData();
    pinataFormData.append("file", file);
    pinataFormData.append("network", "public");

    const pinataResponse = await fetch(PINATA_UPLOAD_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PINATA_JWT}`,
      },
      body: pinataFormData,
    });

    if (!pinataResponse.ok) {
      const errorText = await pinataResponse.text();
      console.error("Pinata upload error:", errorText);
      return NextResponse.json(
        { error: `Pinata upload failed: ${pinataResponse.statusText}` },
        { status: 502 }
      );
    }

    const result = await pinataResponse.json();
    const cid: string = result.data?.cid;

    if (!cid) {
      console.error("Pinata response missing CID:", result);
      return NextResponse.json(
        { error: "Pinata response did not include a CID" },
        { status: 502 }
      );
    }

    // ── Return result ───────────────────────────────────────────────────────
    const gateway = process.env.NEXT_PUBLIC_PINATA_GATEWAY || "https://gateway.pinata.cloud";

    return NextResponse.json({
      cid,
      ipfsUri: `ipfs://${cid}`,
      gatewayUrl: `${gateway}/ipfs/${cid}`,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
    });
  } catch (err) {
    console.error("Unexpected error uploading to Pinata:", err);
    return NextResponse.json(
      { error: "Internal server error during upload" },
      { status: 500 }
    );
  }
}
