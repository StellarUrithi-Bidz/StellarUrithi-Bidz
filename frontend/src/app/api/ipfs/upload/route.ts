// Next.js API Route: POST /api/ipfs/upload
// Proxies file uploads to Pinata v3 Files API, keeping the JWT secret on the server.
// Supports images (jpeg, png, gif, webp, svg), documents (pdf), and JSON metadata.
//
// Rate-limited to 60 req/min for the free tier (Pinata limit).
// Max file size: ~25GB (Pinata handles chunking via TUS for files >100MB).

import { NextRequest, NextResponse } from "next/server";

const PINATA_JWT = process.env.PINATA_JWT;
const PINATA_UPLOAD_URL = "https://uploads.pinata.cloud/v3/files";

// Allowed MIME types for auction items
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
        error: `File too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Max size: 10MB via this API route. For larger files, use Pinata signed URLs.`,
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

// Note: Body size is validated in-code above (10MB limit).
// In App Router, body size limits are configured via next.config.js or handled manually.
