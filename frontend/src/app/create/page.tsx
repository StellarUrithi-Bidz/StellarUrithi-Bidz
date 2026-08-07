"use client";

import { useState } from "react";
import { useWallet } from "@/providers/wallet";
import { PlusCircle, Gavel, TrendingDown, Shield, Loader2, CheckCircle } from "lucide-react";
import toast from "react-hot-toast";
import IPFSUploader from "@/components/ui/IPFSUploader";
import { PinataUploadResult } from "@/lib/pinata";

const auctionFormats = [
  {
    id: "english",
    label: "English (Ascending)",
    description: "Bidders place increasing bids. Highest bidder wins when the timer ends.",
    icon: Gavel,
    color: "border-ochre-500/30 bg-ochre-500/5 text-ochre-400",
  },
  {
    id: "dutch",
    label: "Dutch (Descending)",
    description: "Price drops over time. First to buy wins instantly.",
    icon: TrendingDown,
    color: "border-indigo-500/30 bg-indigo-500/5 text-indigo-400",
  },
  {
    id: "sealed_bid",
    label: "Sealed-Bid (Commit-Reveal)",
    description: "Bids are hidden during bidding. Revealed after close — highest wins.",
    icon: Shield,
    color: "border-terracotta-500/30 bg-terracotta-500/5 text-terracotta-400",
  },
];

export default function CreateAuctionPage() {
  const { address, isConnected, connectWallet } = useWallet();

  const [step, setStep] = useState(1);
  const [format, setFormat] = useState<string>("english");
  const [itemType, setItemType] = useState<"digital" | "physical">("digital");

  // Form fields
  const [reservePrice, setReservePrice] = useState("");
  const [royaltyBps, setRoyaltyBps] = useState("500"); // 5% default
  const [duration, setDuration] = useState("24"); // hours
  const [metadataUri, setMetadataUri] = useState("");
  const [originalCreator, setOriginalCreator] = useState("");

  // English-specific
  const [minIncrement, setMinIncrement] = useState("");

  // Dutch-specific
  const [startPrice, setStartPrice] = useState("");
  const [decayRate, setDecayRate] = useState("");

  // Sealed-bid specific
  const [commitDuration, setCommitDuration] = useState("12");

  // Physical-specific
  const [custodianAddress, setCustodianAddress] = useState("");

  // IPFS upload state
  const [imageCidUri, setImageCidUri] = useState<string | null>(null);
  const [imageUploadResult, setImageUploadResult] = useState<PinataUploadResult | null>(null);
  const [metadataUploaded, setMetadataUploaded] = useState(false);

  const [submitting, setSubmitting] = useState(false);

  const handleImageUploaded = (ipfsUri: string, result: PinataUploadResult) => {
    setImageCidUri(ipfsUri);
    setImageUploadResult(result);
  };

  const handleMetadataUploaded = (ipfsUri: string, _result: PinataUploadResult) => {
    setMetadataUri(ipfsUri);
    setMetadataUploaded(true);
  };

  const handleSubmit = async () => {
    if (!isConnected || !address) {
      toast.error("Connect your wallet to create an auction");
      connectWallet();
      return;
    }

    if (!metadataUri) {
      toast.error("Please upload metadata to IPFS first");
      return;
    }

    setSubmitting(true);
    try {
      // In production, this would invoke the auction contract via Freighter
      // await invokeContract("create_auction", [
      //   addressToScVal(address),
      //   addressToScVal(originalCreator || address),
      //   ...format-specific args,
      //   stringToScVal(metadataUri),
      //   ...
      // ], address);
      toast.success("Auction created successfully! Redirecting...");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create auction";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isConnected) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <Gavel className="w-16 h-16 text-white/10 mx-auto mb-6" />
        <h2 className="text-2xl font-bold text-white mb-4">Connect Your Wallet</h2>
        <p className="text-white/40 mb-8">Connect Freighter to create an auction listing.</p>
        <button onClick={connectWallet} className="btn-primary">
          Connect Freighter
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Create Auction</h1>
        <p className="text-white/40">List an item for auction on Stellar</p>
      </div>

      {/* Progress steps */}
      <div className="flex items-center justify-center gap-2 mb-10">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                step >= s
                  ? "bg-ochre-500 text-white"
                  : "bg-white/5 text-white/30"
              }`}
            >
              {step > s ? <CheckCircle className="w-4 h-4" /> : s}
            </div>
            {s < 3 && (
              <div className={`w-12 h-0.5 ${step > s ? "bg-ochre-500" : "bg-white/10"}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Choose format */}
      {step === 1 && (
        <div className="glass-card p-6 space-y-4 animate-slide-up">
          <h2 className="text-xl font-semibold text-white mb-4">Choose Auction Format</h2>
          <div className="space-y-3">
            {auctionFormats.map((f) => (
              <button
                key={f.id}
                onClick={() => setFormat(f.id)}
                className={`w-full text-left p-4 rounded-xl border transition-all duration-300 ${
                  format === f.id
                    ? f.color + " border-opacity-50"
                    : "border-white/10 bg-white/[0.02] hover:bg-white/5"
                }`}
              >
                <div className="flex items-start gap-3">
                  <f.icon className="w-5 h-5 mt-0.5" />
                  <div>
                    <p className="font-semibold text-white">{f.label}</p>
                    <p className="text-sm text-white/40 mt-1">{f.description}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="mt-6 space-y-3">
            <h3 className="text-sm font-semibold text-white/60">Item Type</h3>
            <div className="flex gap-3">
              <button
                onClick={() => setItemType("digital")}
                className={`flex-1 p-3 rounded-xl border transition-all text-center ${
                  itemType === "digital"
                    ? "border-ochre-500/30 bg-ochre-500/5 text-ochre-400"
                    : "border-white/10 bg-white/[0.02] text-white/50"
                }`}
              >
                💎 Digital (NFT)
              </button>
              <button
                onClick={() => setItemType("physical")}
                className={`flex-1 p-3 rounded-xl border transition-all text-center ${
                  itemType === "physical"
                    ? "border-ochre-500/30 bg-ochre-500/5 text-ochre-400"
                    : "border-white/10 bg-white/[0.02] text-white/50"
                }`}
              >
                🏛️ Physical Item
              </button>
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <button onClick={() => setStep(2)} className="btn-primary">
              Continue →
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Auction details */}
      {step === 2 && (
        <div className="glass-card p-6 space-y-5 animate-slide-up">
          <h2 className="text-xl font-semibold text-white mb-4">Auction Details</h2>

          <div>
            <label className="block text-sm font-medium text-white/60 mb-1.5">
              Reserve Price (stroops)
            </label>
            <input
              type="number"
              value={reservePrice}
              onChange={(e) => setReservePrice(e.target.value)}
              placeholder="e.g., 1000000000"
              className="input-field"
            />
          </div>

          {format === "english" && (
            <div>
              <label className="block text-sm font-medium text-white/60 mb-1.5">
                Minimum Bid Increment (stroops)
              </label>
              <input
                type="number"
                value={minIncrement}
                onChange={(e) => setMinIncrement(e.target.value)}
                placeholder="e.g., 10000000"
                className="input-field"
              />
            </div>
          )}

          {format === "dutch" && (
            <>
              <div>
                <label className="block text-sm font-medium text-white/60 mb-1.5">
                  Start Price (stroops)
                </label>
                <input
                  type="number"
                  value={startPrice}
                  onChange={(e) => setStartPrice(e.target.value)}
                  placeholder="Higher than reserve"
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-white/60 mb-1.5">
                  Price Decay Rate (stroops/second)
                </label>
                <input
                  type="number"
                  value={decayRate}
                  onChange={(e) => setDecayRate(e.target.value)}
                  placeholder="e.g., 1000"
                  className="input-field"
                />
              </div>
            </>
          )}

          {format === "sealed_bid" && (
            <div>
              <label className="block text-sm font-medium text-white/60 mb-1.5">
                Commit Phase Duration (hours)
              </label>
              <input
                type="number"
                value={commitDuration}
                onChange={(e) => setCommitDuration(e.target.value)}
                className="input-field"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-white/60 mb-1.5">
              Auction Duration (hours)
            </label>
            <input
              type="number"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="input-field"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white/60 mb-1.5">
              Creator Royalty (basis points)
            </label>
            <input
              type="number"
              value={royaltyBps}
              onChange={(e) => setRoyaltyBps(e.target.value)}
              max="1500"
              className="input-field"
            />
            <p className="text-xs text-white/30 mt-1">
              {parseInt(royaltyBps || "0") / 100}% of every sale goes to the original creator
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-white/60 mb-1.5">
              Original Creator Address
            </label>
            <input
              type="text"
              value={originalCreator}
              onChange={(e) => setOriginalCreator(e.target.value)}
              placeholder="G..."
              className="input-field"
            />
          </div>

          {itemType === "physical" && (
            <div>
              <label className="block text-sm font-medium text-white/60 mb-1.5">
                Custodian Address (gallery/verifier)
              </label>
              <input
                type="text"
                value={custodianAddress}
                onChange={(e) => setCustodianAddress(e.target.value)}
                placeholder="G..."
                className="input-field"
              />
            </div>
          )}

          <div className="flex justify-between pt-4">
            <button onClick={() => setStep(1)} className="btn-secondary">
              ← Back
            </button>
            <button onClick={() => setStep(3)} className="btn-primary">
              Continue →
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Upload images + metadata to IPFS, then confirm */}
      {step === 3 && (
        <div className="glass-card p-6 space-y-6 animate-slide-up">
          <h2 className="text-xl font-semibold text-white">Item Images &amp; Metadata</h2>

          {/* ── Upload Image ───────────────────────────────────────────────── */}
          <div>
            <h3 className="text-sm font-semibold text-white/60 mb-3 flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-white/5 flex items-center justify-center text-xs">
                1
              </span>
              Upload Item Image
            </h3>
            <IPFSUploader
              mode="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              label="Drag & drop your item image — or click to browse"
              onUploadComplete={handleImageUploaded}
            />
            {imageCidUri && (
              <div className="mt-2 flex items-center gap-2 text-xs text-green-400">
                <CheckCircle className="w-3.5 h-3.5" />
                <span className="font-mono truncate">Image CID: {imageCidUri}</span>
              </div>
            )}
          </div>

          {/* ── Upload Metadata ─────────────────────────────────────────────── */}
          <div className="border-t border-white/5 pt-5">
            <h3 className="text-sm font-semibold text-white/60 mb-3 flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-white/5 flex items-center justify-center text-xs">
                2
              </span>
              Item Metadata
            </h3>
            <IPFSUploader
              mode="metadata"
              initialMetadata={
                imageCidUri ? { image: imageCidUri } : undefined
              }
              onUploadComplete={handleMetadataUploaded}
            />
          </div>

          {/* ── Result ──────────────────────────────────────────────────────── */}
          {metadataUploaded && metadataUri && (
            <div className="p-4 rounded-xl bg-green-500/5 border border-green-500/10 space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-400" />
                <span className="text-sm font-semibold text-green-400">
                  Metadata uploaded to IPFS
                </span>
              </div>
              <div className="p-3 rounded-lg bg-white/[0.03] border border-white/5">
                <p className="text-xs text-white/40 mb-1">IPFS Metadata URI</p>
                <p className="text-sm text-white font-mono break-all">
                  {metadataUri}
                </p>
              </div>
              {imageCidUri && (
                <p className="text-xs text-white/30">
                  This metadata JSON references your uploaded image ({extractBriefCid(imageCidUri)}) and will be stored permanently on IPFS.
                </p>
              )}
            </div>
          )}

          {/* ── Summary ─────────────────────────────────────────────────────── */}
          <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5 space-y-2 text-sm">
            <h3 className="font-semibold text-white mb-2">Summary</h3>
            <div className="flex justify-between">
              <span className="text-white/40">Format:</span>
              <span className="text-white capitalize">{format.replace("_", " ")}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/40">Item Type:</span>
              <span className="text-white">{itemType === "digital" ? "Digital" : "Physical"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/40">Reserve Price:</span>
              <span className="text-white">{reservePrice || "—"} stroops</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/40">Royalty:</span>
              <span className="text-ochre-400">{parseInt(royaltyBps || "0") / 100}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/40">Duration:</span>
              <span className="text-white">{duration}h</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/40">IPFS Metadata:</span>
              <span className="text-white text-xs font-mono truncate max-w-[200px]">
                {metadataUri ? extractBriefCid(metadataUri) : "Not uploaded"}
              </span>
            </div>
            {itemType === "physical" && (
              <div className="flex justify-between">
                <span className="text-white/40">Custodian:</span>
                <span className="text-white text-xs">{custodianAddress || "—"}</span>
              </div>
            )}
          </div>

          <div className="flex justify-between pt-2">
            <button onClick={() => setStep(2)} className="btn-secondary">
              ← Back
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || !metadataUploaded}
              className="btn-primary flex items-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Deploying...
                </>
              ) : (
                <>
                  <PlusCircle className="w-4 h-4" />
                  Create Auction
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper: extract a brief readable CID from an ipfs:// URI
function extractBriefCid(uri: string): string {
  const cid = uri.replace(/^ipfs:\/\//, "");
  if (cid.length <= 16) return cid;
  return `${cid.slice(0, 10)}...${cid.slice(-6)}`;
}
