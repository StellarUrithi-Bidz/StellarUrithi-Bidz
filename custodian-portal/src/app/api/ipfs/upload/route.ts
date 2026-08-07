// Custodian Portal — Pinata IPFS Upload API Route
// POST /api/ipfs/upload — Proxies file uploads to Pinata v3 Files API.
// Used for uploading attestation documents (photos, condition reports, inspection PDFs).

import { NextRequest, NextResponse } from "next/server";

const PINATA_JWT = process.env.PINATA_JWT;
const PINATA_UPLOAD_URL = "https://uploads.pinata.cloud/v3/files";

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/json",
  "application/pdf",
];

export async function POST(request: NextRequest) {
  if (!PINATA_JWT) {
    return NextResponse.json(
      { error: "Pinata JWT not configured on server" },
      { status: 500 }
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json(
      { error: "No file provided" },
      { status: 400 }
    );
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: `File type '${file.type}' not allowed` },
      { status: 400 }
    );
  }

  const MAX_SIZE = 10 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: `File too large (max 10MB)` },
      { status: 413 }
    );
  }

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
      return NextResponse.json(
        { error: `Pinata upload failed: ${pinataResponse.statusText}` },
        { status: 502 }
      );
    }

    const result = await pinataResponse.json();
    const cid: string = result.data?.cid;

    if (!cid) {
      return NextResponse.json(
        { error: "No CID returned from Pinata" },
        { status: 502 }
      );
    }

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
    console.error("Pinata upload error:", err);
    return NextResponse.json(
      { error: "Internal server error during upload" },
      { status: 500 }
    );
  }
}

// Note: Body size is validated in-code above (10MB limit).
