"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Shield, CheckCircle, Clock, FileCheck, Loader2,
  AlertTriangle, Link, ImagePlus, X,
} from "lucide-react";
import toast from "react-hot-toast";
import { isConnected, getAddress, requestAccess, setAllowed } from "@stellar/freighter-api";

// Types
interface PendingAttestation {
  auctionId: number; seller: string; metadataUri: string;
  itemDescription: string; custodianAddress: string; createdAt: string;
}
interface UploadResult { cid: string; ipfsUri: string; gatewayUrl: string; }

async function uploadToPinata(file: File): Promise<UploadResult> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch("/api/ipfs/upload", { method: "POST", body: formData });
  if (!res.ok) { const err = await res.json().catch(() => ({ error: "Upload failed" })); throw new Error(err.error || "Upload failed"); }
  return res.json();
}

export default function CustodianPortal() {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [pendingAttestations, setPendingAttestations] = useState<PendingAttestation[]>([]);
  const [loading, setLoading] = useState(true);
  const [attestingId, setAttestingId] = useState<number | null>(null);
  const [uploadedFile, setUploadedFile] = useState<UploadResult | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [attestationNotes, setAttestationNotes] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const connectWallet = async () => {
    try {
      await requestAccess();
      const addr = await getAddress();
      if (addr?.address) { setWalletAddress(addr.address); toast.success("Wallet connected!"); }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Connection failed";
      if (msg.includes("not installed")) { toast.error("Please install Freighter wallet extension"); }
      else { toast.error(msg); }
    }
  };

  const fetchPendingAttestations = useCallback(async () => {
    setLoading(true);
    try {
      const mockAttestations: PendingAttestation[] = [
        { auctionId: 101, seller: "GD4S...7X2K", metadataUri: "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi", itemDescription: "Yoruba beaded crown, early 20th century", custodianAddress: walletAddress || "", createdAt: new Date(Date.now() - 7200000).toISOString() },
        { auctionId: 102, seller: "GBRP...9L3M", metadataUri: "ipfs://bafkreid7mbx6qzcqnwzb4zqhdnk37w7usy3a3kpxqqo3ow33eypvar7q", itemDescription: "Makonde ebony sculpture 'Tree of Life'", custodianAddress: walletAddress || "", createdAt: new Date(Date.now() - 18000000).toISOString() },
      ];
      setPendingAttestations(mockAttestations);
    } catch { toast.error("Failed to load pending attestations"); }
    finally { setLoading(false); }
  }, [walletAddress]);

  useEffect(() => { if (walletAddress) fetchPendingAttestations(); }, [walletAddress, fetchPendingAttestations]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error("File too large (max 10MB)"); return; }
    setFileName(file.name); setUploading(true); setUploadedFile(null);
    if (file.type.startsWith("image/")) { const reader = new FileReader(); reader.onload = () => setUploadPreview(reader.result as string); reader.readAsDataURL(file); } else { setUploadPreview(null); }
    try { const result = await uploadToPinata(file); setUploadedFile(result); toast.success(`Uploaded: ${result.cid.slice(0, 12)}...`); }
    catch (err: unknown) { toast.error(err instanceof Error ? err.message : "Upload failed"); }
    finally { setUploading(false); }
  };

  const handleRemoveFile = () => { setUploadedFile(null); setUploadPreview(null); setFileName(null); if (fileInputRef.current) fileInputRef.current.value = ""; };

  const handleAttest = async (auctionId: number) => {
    if (!uploadedFile) { toast.error("Upload attestation document first"); return; }
    setAttestingId(auctionId);
    try { toast.success(`Auction #${auctionId} attested!`); setPendingAttestations(p => p.filter(a => a.auctionId !== auctionId)); handleRemoveFile(); setAttestationNotes(""); }
    catch (err: unknown) { toast.error(err instanceof Error ? err.message : "Attestation failed"); }
    finally { setAttestingId(null); }
  };

  if (!walletAddress) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="glass-card p-10 max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-2xl bg-terracotta-500/20 flex items-center justify-center mx-auto mb-6"><Shield className="w-8 h-8 text-terracotta-400" /></div>
          <h1 className="text-2xl font-bold text-white mb-3">Custodian Portal</h1>
          <p className="text-white/50 text-sm mb-8">Verify and attest physical items before auction. Connect your authorized custodian wallet to begin.</p>
          <button onClick={connectWallet} className="btn-primary w-full">Connect Custodian Wallet</button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-terracotta-500/20 flex items-center justify-center"><Shield className="w-5 h-5 text-terracotta-400" /></div>
          <div><h1 className="text-2xl font-bold text-white">Custodian Portal</h1><p className="text-sm text-white/40">Physical-item attestation for UrithiBidz auctions</p></div>
        </div>
        <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/5 border border-white/10">
          <div className="w-2 h-2 rounded-full bg-green-400" /><span className="text-sm text-white/60 font-mono">{walletAddress.slice(0, 8)}...</span>
        </div>
      </div>
      <div><h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2"><Clock className="w-5 h-5 text-ochre-400" />Pending Attestations<span className="px-2 py-0.5 rounded-lg bg-ochre-500/20 text-ochre-400 text-xs">{pendingAttestations.length}</span></h2>
        {loading ? (<div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 text-ochre-400 animate-spin" /></div>) : pendingAttestations.length === 0 ? (
          <div className="glass-card p-12 text-center"><CheckCircle className="w-12 h-12 text-green-400/30 mx-auto mb-4" /><p className="text-white/40">No pending attestations.</p></div>
        ) : (
          <div className="space-y-4">{pendingAttestations.map((item) => (
            <div key={item.auctionId} className="glass-card p-5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1"><span className="text-sm font-semibold text-white">Auction #{item.auctionId}</span><span className="px-2 py-0.5 rounded-lg bg-yellow-500/20 text-yellow-400 text-xs flex items-center gap-1"><Clock className="w-3 h-3" />Pending</span></div>
                  <p className="text-white/80 font-medium">{item.itemDescription}</p>
                  <p className="text-xs text-white/30 mt-1">Seller: {item.seller}</p>
                  <p className="text-xs text-white/20 flex items-center gap-1 mt-0.5"><Link className="w-3 h-3" />{item.metadataUri}</p>
                </div>
                <span className="text-xs text-white/30">{new Date(item.createdAt).toLocaleString()}</span>
              </div>
              <div className="border-t border-white/5 pt-4 space-y-3">
                <div className="p-3 rounded-xl bg-indigo-500/5 border border-indigo-500/10 flex items-start gap-2"><AlertTriangle className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" /><p className="text-xs text-indigo-200/80">Upload photos and inspection documents to IPFS via Pinata for a verifiable attestation record.</p></div>
                {!uploadedFile ? (
                  <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-white/10 rounded-xl p-6 text-center cursor-pointer hover:border-white/20 hover:bg-white/[0.02] transition-all">
                    <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp,application/pdf" onChange={handleFileUpload} className="hidden" />
                    {uploading ? (<div className="space-y-2"><Loader2 className="w-8 h-8 text-ochre-400 animate-spin mx-auto" /><p className="text-sm text-white/40">Uploading to IPFS...</p></div>) : (<div className="space-y-2"><ImagePlus className="w-8 h-8 text-white/20 mx-auto" /><p className="text-sm text-white/40">Click to upload attestation document</p><p className="text-xs text-white/20">JPEG, PNG, WebP, PDF — up to 10MB</p></div>)}
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/20">
                    <div className="flex items-center gap-3">
                      {uploadPreview ? (<img src={uploadPreview} alt="Preview" className="w-16 h-16 rounded-lg object-cover" />) : (<div className="w-16 h-16 rounded-lg bg-white/5 flex items-center justify-center"><FileCheck className="w-6 h-6 text-green-400" /></div>)}
                      <div className="flex-1 min-w-0"><p className="text-sm text-white font-medium truncate">{fileName}</p><p className="text-xs text-green-400 font-mono truncate">{uploadedFile.ipfsUri}</p></div>
                      <button onClick={(e) => { e.stopPropagation(); handleRemoveFile(); }} className="p-1.5 rounded-lg hover:bg-white/10 text-white/30 hover:text-white"><X className="w-4 h-4" /></button>
                    </div>
                  </div>
                )}
                <div><label className="block text-xs text-white/40 mb-1">Inspection Notes</label><textarea value={attestationNotes} onChange={(e) => setAttestationNotes(e.target.value)} rows={2} placeholder="Condition report, provenance verification, handling notes..." className="input-field resize-none" /></div>
                <button onClick={() => handleAttest(item.auctionId)} disabled={attestingId === item.auctionId || !uploadedFile} className="btn-primary w-full flex items-center justify-center gap-2">{attestingId === item.auctionId ? (<><Loader2 className="w-4 h-4 animate-spin" />Recording Attestation...</>) : (<><FileCheck className="w-4 h-4" />Attest &amp; Activate Auction</>)}</button>
              </div>
            </div>
          ))}</div>
        )}
      </div>
      <div className="mt-12"><h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2"><CheckCircle className="w-5 h-5 text-green-400" />Completed Attestations</h2><div className="glass-card p-12 text-center"><FileCheck className="w-12 h-12 text-white/10 mx-auto mb-4" /><p className="text-white/30 text-sm">Attested items will appear here. Your verification enables the auction to go live.</p></div></div>
    </div>
  );
}
