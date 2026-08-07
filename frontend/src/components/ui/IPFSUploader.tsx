"use client";

import { useState, useRef } from "react";
import { uploadFile, uploadMetadata, AuctionMetadata } from "@/lib/pinata";
import { PinataUploadResult } from "@/lib/pinata";
import { ImagePlus, FileJson, X, CheckCircle, Loader2, AlertCircle } from "lucide-react";
import toast from "react-hot-toast";

// ── Types ─────────────────────────────────────────────────────────────────────────

type UploadMode = "file" | "metadata";

interface IPFSUploaderProps {
  /** Callback when upload completes. Receives the `ipfs://` URI and full result. */
  onUploadComplete: (ipfsUri: string, result: PinataUploadResult) => void;
  /** Pre-populate metadata fields (e.g., from form state). */
  initialMetadata?: Partial<AuctionMetadata>;
  /** The mode: "file" for images/docs, "metadata" for JSON metadata. */
  mode?: UploadMode;
  /** Accepted MIME types for file mode. Default: images + JSON. */
  accept?: string;
  /** Maximum file size in bytes. Default: 10MB. */
  maxSize?: number;
  /** Label for the upload area. */
  label?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────────

export default function IPFSUploader({
  onUploadComplete,
  initialMetadata,
  mode = "file",
  accept = "image/jpeg,image/png,image/gif,image/webp,application/json",
  maxSize = 10 * 1024 * 1024, // 10MB
  label = "Drop your file here or click to browse",
}: IPFSUploaderProps) {
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<PinataUploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Metadata form state ──────────────────────────────────────────────────
  const [metaName, setMetaName] = useState(initialMetadata?.name || "");
  const [metaDescription, setMetaDescription] = useState(
    initialMetadata?.description || ""
  );
  const [metaArtist, setMetaArtist] = useState(initialMetadata?.artist || "");
  const [metaYear, setMetaYear] = useState(
    initialMetadata?.year?.toString() || ""
  );
  const [metaMedium, setMetaMedium] = useState(initialMetadata?.medium || "");
  const [metaDimensions, setMetaDimensions] = useState(
    initialMetadata?.dimensions || ""
  );
  const [metaProvenance, setMetaProvenance] = useState(
    initialMetadata?.provenance || ""
  );

  // ── Drag & Drop handlers ──────────────────────────────────────────────────
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const processFile = async (file: File) => {
    // Validate size
    if (file.size > maxSize) {
      setError(`File too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Max: ${maxSize / (1024 * 1024)}MB.`);
      return;
    }

    setError(null);
    setFileName(file.name);
    setUploadResult(null);

    // Generate preview for images
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = () => setPreview(reader.result as string);
      reader.readAsDataURL(file);
    } else {
      setPreview(null);
    }

    // Upload
    setUploading(true);

    try {
      const result = await uploadFile(file);
      setUploadResult(result);
      onUploadComplete(result.ipfsUri, result);
      toast.success(`Uploaded to IPFS! CID: ${result.cid.slice(0, 12)}...`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Upload failed";
      setError(message);
      toast.error(message);
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);

    const file = e.dataTransfer.files[0];
    if (file && mode === "file") {
      processFile(file);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  // ── Metadata upload ──────────────────────────────────────────────────────
  const handleMetadataUpload = async () => {
    if (!metaName.trim()) {
      toast.error("Please enter a name for your item");
      return;
    }

    setError(null);
    setUploading(true);

    const metadata: AuctionMetadata = {
      name: metaName,
      description: metaDescription || `${metaName} — listed on UrithiBidz`,
      image: initialMetadata?.image || "",
      ...(metaArtist && { artist: metaArtist }),
      ...(metaYear && { year: parseInt(metaYear, 10) }),
      ...(metaMedium && { medium: metaMedium }),
      ...(metaDimensions && { dimensions: metaDimensions }),
      ...(metaProvenance && { provenance: metaProvenance }),
    };

    try {
      const result = await uploadMetadata(metadata);
      setUploadResult(result);
      onUploadComplete(result.ipfsUri, result);
      toast.success(`Metadata uploaded to IPFS!`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Upload failed";
      setError(message);
      toast.error(message);
    } finally {
      setUploading(false);
    }
  };

  // ── Reset ─────────────────────────────────────────────────────────────────
  const handleReset = () => {
    setPreview(null);
    setFileName(null);
    setUploadResult(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  // ── Render: File upload mode ──────────────────────────────────────────────
  if (mode === "file") {
    return (
      <div className="space-y-3">
        {/* Drop zone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-300 ${
            dragOver
              ? "border-ochre-500/50 bg-ochre-500/10"
              : uploadResult
              ? "border-green-500/30 bg-green-500/5"
              : error
              ? "border-red-500/30 bg-red-500/5"
              : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            onChange={handleFileSelect}
            className="hidden"
          />

          {uploading ? (
            <div className="space-y-2">
              <Loader2 className="w-10 h-10 text-ochre-400 animate-spin mx-auto" />
              <p className="text-sm text-white/60">Uploading to IPFS via Pinata...</p>
            </div>
          ) : uploadResult ? (
            <div className="space-y-3">
              <CheckCircle className="w-10 h-10 text-green-400 mx-auto" />
              <p className="text-sm font-medium text-green-400">Uploaded to IPFS!</p>
              <p className="text-xs text-white/40 font-mono">
                {uploadResult.ipfsUri}
              </p>
              {preview && (
                <img
                  src={preview}
                  alt="Preview"
                  className="max-h-32 mx-auto rounded-lg shadow-lg"
                />
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleReset();
                }}
                className="text-xs text-white/40 hover:text-white transition-colors"
              >
                Upload another file
              </button>
            </div>
          ) : error ? (
            <div className="space-y-2">
              <AlertCircle className="w-10 h-10 text-red-400 mx-auto" />
              <p className="text-sm text-red-400">{error}</p>
              <p className="text-xs text-white/30">Click to try again</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center mx-auto">
                <ImagePlus className="w-6 h-6 text-white/30" />
              </div>
              <div>
                <p className="text-sm text-white/60">{label}</p>
                <p className="text-xs text-white/20 mt-1">
                  PNG, JPEG, GIF, WebP, JSON — up to 10MB
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Preview outside drop zone */}
        {preview && uploadResult && (
          <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
            <img src={preview} alt="Preview" className="w-16 h-16 rounded-lg object-cover" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white truncate">{fileName}</p>
              <p className="text-xs text-green-400 font-mono truncate">
                {uploadResult.ipfsUri}
              </p>
            </div>
            <button onClick={handleReset} className="p-1.5 rounded-lg hover:bg-white/10 text-white/30 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── Render: Metadata mode ─────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Name (required) */}
      <div>
        <label className="block text-sm font-medium text-white/60 mb-1.5">
          Item Name *
        </label>
        <input
          type="text"
          value={metaName}
          onChange={(e) => setMetaName(e.target.value)}
          placeholder="e.g., Yoruba Beaded Crown, early 20th century"
          className="input-field"
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-white/60 mb-1.5">
          Description
        </label>
        <textarea
          value={metaDescription}
          onChange={(e) => setMetaDescription(e.target.value)}
          rows={3}
          placeholder="Describe the item, its cultural significance, and condition..."
          className="input-field resize-none"
        />
      </div>

      {/* Row: Artist + Year */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-white/60 mb-1.5">
            Artist / Creator
          </label>
          <input
            type="text"
            value={metaArtist}
            onChange={(e) => setMetaArtist(e.target.value)}
            placeholder="Unknown"
            className="input-field"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-white/60 mb-1.5">
            Year
          </label>
          <input
            type="text"
            value={metaYear}
            onChange={(e) => setMetaYear(e.target.value)}
            placeholder="e.g., 1920"
            className="input-field"
          />
        </div>
      </div>

      {/* Row: Medium + Dimensions */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-white/60 mb-1.5">
            Medium / Materials
          </label>
          <input
            type="text"
            value={metaMedium}
            onChange={(e) => setMetaMedium(e.target.value)}
            placeholder="e.g., Beads, fabric, leather"
            className="input-field"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-white/60 mb-1.5">
            Dimensions
          </label>
          <input
            type="text"
            value={metaDimensions}
            onChange={(e) => setMetaDimensions(e.target.value)}
            placeholder='e.g., 30cm x 25cm x 40cm'
            className="input-field"
          />
        </div>
      </div>

      {/* Provenance */}
      <div>
        <label className="block text-sm font-medium text-white/60 mb-1.5">
          Provenance
        </label>
        <input
          type="text"
          value={metaProvenance}
          onChange={(e) => setMetaProvenance(e.target.value)}
          placeholder="e.g., Lagos, Nigeria — private collection"
          className="input-field"
        />
      </div>

      {/* Upload button */}
      <button
        onClick={handleMetadataUpload}
        disabled={uploading || !metaName.trim()}
        className="btn-primary w-full flex items-center justify-center gap-2"
      >
        {uploading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Uploading to IPFS...
          </>
        ) : (
          <>
            <FileJson className="w-4 h-4" />
            Upload Metadata to IPFS
          </>
        )}
      </button>

      {/* Result */}
      {uploadResult && (
        <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
          <div className="min-w-0">
            <p className="text-xs text-green-400 font-mono truncate">
              {uploadResult.ipfsUri}
            </p>
            <p className="text-xs text-white/30">
              <button
                onClick={handleReset}
                className="hover:text-white transition-colors"
              >
                Reset &amp; re-upload
              </button>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
