"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { useWallet } from "@/providers/wallet";
import { useAuctionSocket } from "@/hooks/useWebSocket";
import { getAuction, getBidsForAuction, AuctionItem, BidItem } from "@/lib/api";
import {
  formatStroops, formatAddress, formatTimeRemaining, bpsToPercentage, getContractId,
  invokeContract, addressToScVal, i128ToScVal, u64ToScVal, bytesNToScVal,
} from "@/lib/stellar";
import { generateSalt, hexToBytes, computeCommitment } from "@/lib/crypto";
import { nativeToScVal } from "@stellar/stellar-sdk";
import {
  ArrowLeft, Clock, User, Tag, Gavel, TrendingDown, Shield,
  Loader2, CheckCircle, XCircle, RefreshCw, KeyRound, AlertCircle,
} from "lucide-react";
import Link from "next/link";
import toast from "react-hot-toast";

export default function AuctionDetailPage() {
  const params = useParams();
  const auctionId = parseInt(params.id as string, 10);
  const { address, isConnected, connectWallet } = useWallet();

  const [auction, setAuction] = useState<AuctionItem | null>(null);
  const [bids, setBids] = useState<BidItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [bidAmount, setBidAmount] = useState("");
  const [placingBid, setPlacingBid] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState("");

  // Sealed-bid local storage state
  const [savedCommitment, setSavedCommitment] = useState<{ amount: string; saltHex: string } | null>(null);

  // WebSocket for real-time updates
  const { isConnected: wsConnected, latestBid, auctionClosed, auctionSettled } =
    useAuctionSocket(auctionId);

  // Load saved sealed-bid commitment if exists
  useEffect(() => {
    if (address && auctionId) {
      try {
        const key = `sealed_${auctionId}_${address}`;
        const raw = localStorage.getItem(key);
        if (raw) {
          setSavedCommitment(JSON.parse(raw));
        } else {
          setSavedCommitment(null);
        }
      } catch {
        setSavedCommitment(null);
      }
    }
  }, [address, auctionId]);

  // Fetch auction data
  const fetchAuction = useCallback(async () => {
    const result = await getAuction(auctionId);
    if (result.success && result.data) {
      setAuction(result.data);
    }
    setLoading(false);
  }, [auctionId]);

  useEffect(() => {
    fetchAuction();
  }, [fetchAuction]);

  // Fetch bids
  useEffect(() => {
    getBidsForAuction(auctionId).then((result) => {
      if (result.success && result.data) setBids(result.data);
    });
  }, [auctionId, latestBid]);

  // Apply real-time bid updates
  useEffect(() => {
    if (latestBid && auction && latestBid.auctionId === auctionId) {
      setAuction((prev) =>
        prev
          ? {
              ...prev,
              highest_bid: latestBid.amount,
              highest_bidder: latestBid.bidder,
            }
          : prev
      );
      setBids((prev) => [
        {
          id: Date.now(),
          auction_id: auctionId,
          bidder: latestBid.bidder,
          amount: latestBid.amount,
          format: auction.format,
          timestamp: latestBid.timestamp,
          is_winning: true,
          refunded: false,
          created_at: new Date().toISOString(),
        },
        ...prev,
      ]);
    }
  }, [latestBid, auctionId, auction]);

  // Apply auction closed
  useEffect(() => {
    if (auctionClosed && auction && auctionClosed.auctionId === auctionId) {
      setAuction((prev) => (prev ? { ...prev, status: "closed" } : prev));
    }
  }, [auctionClosed, auctionId, auction]);

  // Apply auction settled
  useEffect(() => {
    if (auctionSettled && auction && auctionSettled.auctionId === auctionId) {
      setAuction((prev) => (prev ? { ...prev, status: "settled" } : prev));
    }
  }, [auctionSettled, auctionId, auction]);

  // Countdown timer
  useEffect(() => {
    if (!auction || auction.status !== "active") return;
    const interval = setInterval(() => {
      setTimeLeft(formatTimeRemaining(auction.end_time));
    }, 1000);
    return () => clearInterval(interval);
  }, [auction]);

  // ── English Bidding ─────────────────────────────────────────────────────────────
  const handlePlaceEnglishBid = async () => {
    if (!isConnected || !address) {
      toast.error("Connect your wallet first");
      connectWallet();
      return;
    }
    if (!bidAmount) {
      toast.error("Enter a bid amount");
      return;
    }

    setPlacingBid(true);
    try {
      const amountBigInt = BigInt(bidAmount);
      const { txHash } = await invokeContract("place_bid", [
        u64ToScVal(BigInt(auctionId)),
        addressToScVal(address),
        i128ToScVal(amountBigInt),
      ], address);

      toast.success(`Bid placed on-chain! Tx: ${txHash.slice(0, 10)}...`);
      setBidAmount("");
      fetchAuction();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to place bid";
      toast.error(message);
    } finally {
      setPlacingBid(false);
    }
  };

  // ── Dutch Buy Now ───────────────────────────────────────────────────────────────
  const handleBuyNow = async () => {
    if (!isConnected || !address) {
      toast.error("Connect your wallet first");
      connectWallet();
      return;
    }

    setPlacingBid(true);
    try {
      const { txHash } = await invokeContract("buy_now", [
        u64ToScVal(BigInt(auctionId)),
        addressToScVal(address),
        nativeToScVal(null, { type: "option" }),
      ], address);

      toast.success(`Item purchased! Tx: ${txHash.slice(0, 10)}...`);
      fetchAuction();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to purchase";
      toast.error(message);
    } finally {
      setPlacingBid(false);
    }
  };

  // ── Sealed-Bid Commit ───────────────────────────────────────────────────────────
  const handleCommitSealedBid = async () => {
    if (!isConnected || !address) {
      toast.error("Connect your wallet first");
      connectWallet();
      return;
    }
    if (!bidAmount) {
      toast.error("Enter a bid amount");
      return;
    }

    setPlacingBid(true);
    try {
      const { bytes: saltBytes, hex: saltHex } = generateSalt();
      const commitment = await computeCommitment(auctionId, address, bidAmount, saltBytes);

      // Save salt and amount to localStorage
      const storageKey = `sealed_${auctionId}_${address}`;
      const payload = { amount: bidAmount, saltHex };
      localStorage.setItem(storageKey, JSON.stringify(payload));
      setSavedCommitment(payload);

      const depositAmount = BigInt(bidAmount);
      const { txHash } = await invokeContract("commit_bid", [
        u64ToScVal(BigInt(auctionId)),
        addressToScVal(address),
        bytesNToScVal(commitment),
        i128ToScVal(depositAmount),
      ], address);

      toast.success(`Sealed bid committed! Salt saved locally. Tx: ${txHash.slice(0, 10)}...`);
      setBidAmount("");
      fetchAuction();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to commit bid";
      toast.error(message);
    } finally {
      setPlacingBid(false);
    }
  };

  // ── Sealed-Bid Reveal ───────────────────────────────────────────────────────────
  const handleRevealSealedBid = async () => {
    if (!isConnected || !address) {
      toast.error("Connect your wallet first");
      connectWallet();
      return;
    }
    if (!savedCommitment) {
      toast.error("No saved bid commitment found for this account");
      return;
    }

    setPlacingBid(true);
    try {
      const saltBytes = hexToBytes(savedCommitment.saltHex);

      const { txHash } = await invokeContract("reveal_bid", [
        u64ToScVal(BigInt(auctionId)),
        addressToScVal(address),
        i128ToScVal(BigInt(savedCommitment.amount)),
        bytesNToScVal(saltBytes),
      ], address);

      toast.success(`Sealed bid revealed! Tx: ${txHash.slice(0, 10)}...`);
      fetchAuction();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to reveal bid";
      toast.error(message);
    } finally {
      setPlacingBid(false);
    }
  };

  // ── Pull-Refund Withdrawal ───────────────────────────────────────────────────────
  const handleWithdrawRefund = async () => {
    if (!isConnected || !address) {
      toast.error("Connect your wallet first");
      connectWallet();
      return;
    }

    setActionLoading(true);
    try {
      const { txHash } = await invokeContract("withdraw_refund", [
        u64ToScVal(BigInt(auctionId)),
        addressToScVal(address),
      ], address);

      toast.success(`Refund withdrawn! Tx: ${txHash.slice(0, 10)}...`);
      fetchAuction();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to withdraw refund";
      toast.error(message);
    } finally {
      setActionLoading(false);
    }
  };

  // ── Seller / Admin Actions ───────────────────────────────────────────────────────
  const handleApproveNftTransfer = async () => {
    if (!isConnected || !address) return;
    setActionLoading(true);
    try {
      const { txHash } = await invokeContract("approve_nft_transfer", [
        u64ToScVal(BigInt(auctionId)),
      ], address);
      toast.success(`NFT transfer approved! Tx: ${txHash.slice(0, 10)}...`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Approval failed");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCloseAuction = async () => {
    if (!isConnected || !address) return;
    setActionLoading(true);
    try {
      const { txHash } = await invokeContract("close_auction", [
        u64ToScVal(BigInt(auctionId)),
      ], address);
      toast.success(`Auction closed! Tx: ${txHash.slice(0, 10)}...`);
      fetchAuction();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Close failed");
    } finally {
      setActionLoading(false);
    }
  };

  const handleSettleAuction = async () => {
    if (!isConnected || !address) return;
    setActionLoading(true);
    try {
      const { txHash } = await invokeContract("settle_auction", [
        u64ToScVal(BigInt(auctionId)),
      ], address);
      toast.success(`Auction settled & funds distributed! Tx: ${txHash.slice(0, 10)}...`);
      fetchAuction();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Settlement failed");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelAuction = async () => {
    if (!isConnected || !address) return;
    if (!confirm("Are you sure you want to cancel this auction?")) return;
    setActionLoading(true);
    try {
      const { txHash } = await invokeContract("cancel_auction", [
        u64ToScVal(BigInt(auctionId)),
      ], address);
      toast.success(`Auction cancelled. Tx: ${txHash.slice(0, 10)}...`);
      fetchAuction();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Cancel failed");
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 text-ochre-400 animate-spin" />
      </div>
    );
  }

  if (!auction) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <h2 className="text-2xl font-bold text-white mb-4">Auction not found</h2>
        <Link href="/" className="btn-secondary inline-flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" /> Back to Auctions
        </Link>
      </div>
    );
  }

  const isSeller = address && auction.seller.toLowerCase() === address.toLowerCase();
  const isWinner = address && auction.highest_bidder?.toLowerCase() === address.toLowerCase();

  const formatLabel = {
    english: { label: "English", icon: Gavel, color: "text-ochre-400" },
    dutch: { label: "Dutch", icon: TrendingDown, color: "text-indigo-400" },
    sealed_bid: { label: "Sealed-Bid", icon: Shield, color: "text-terracotta-400" },
  }[auction.format];
  const FormatIcon = formatLabel.icon;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">
      {/* Breadcrumb */}
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-sm text-white/40 hover:text-white transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Auctions
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Header */}
          <div className="glass-card p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-2xl font-bold text-white">
                    Auction #{auction.id}
                  </h1>
                  <span
                    className={`px-3 py-1 rounded-lg text-xs font-semibold border ${
                      auction.status === "active"
                        ? "bg-green-500/20 text-green-400 border-green-500/30"
                        : auction.status === "closed" || auction.status === "ended"
                        ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
                        : auction.status === "settled"
                        ? "bg-blue-500/20 text-blue-400 border-blue-500/30"
                        : "bg-red-500/20 text-red-400 border-red-500/30"
                    }`}
                  >
                    {auction.status.charAt(0).toUpperCase() + auction.status.slice(1)}
                  </span>
                </div>
                <p className="text-sm text-white/40 flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Seller: {formatAddress(auction.seller, 6)}
                </p>
              </div>
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 ${formatLabel.color}`}>
                <FormatIcon className="w-4 h-4" />
                <span className="text-sm font-semibold">{formatLabel.label}</span>
              </div>
            </div>

            {/* Price & Timer */}
            <div className="grid grid-cols-2 gap-4 p-4 rounded-xl bg-white/[0.03] border border-white/5">
              <div>
                <p className="text-xs text-white/40 mb-1">
                  {auction.format === "dutch" ? "Current Dutch Price" : "Leading Bid"}
                </p>
                <p className="text-2xl font-bold text-white">
                  {auction.highest_bid && auction.highest_bid !== "0"
                    ? `${formatStroops(auction.highest_bid)} stroops`
                    : "No bids yet"}
                </p>
                {auction.highest_bidder && (
                  <p className="text-xs text-white/30 mt-1">
                    by {formatAddress(auction.highest_bidder, 4)}
                  </p>
                )}
              </div>
              <div className="text-right">
                <p className="text-xs text-white/40 mb-1">
                  {auction.status === "active" ? "Time Remaining" : "Status"}
                </p>
                <p
                  className={`text-2xl font-bold ${
                    auction.status === "active" ? "text-ochre-400" : "text-white/50"
                  }`}
                >
                  {auction.status === "active" ? timeLeft || formatTimeRemaining(auction.end_time) : auction.status}
                </p>
              </div>
            </div>

            {/* Item details */}
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-white/40">Reserve Price:</span>
                <span className="ml-2 text-white">{formatStroops(auction.reserve_price)} stroops</span>
              </div>
              <div>
                <span className="text-white/40">Royalty:</span>
                <span className="ml-2 text-ochre-400">{bpsToPercentage(auction.royalty_bps)}</span>
              </div>
              <div>
                <span className="text-white/40">Item Type:</span>
                <span className="ml-2 text-white">
                  {auction.item_type === "physical" ? "Physical 🏛️" : "Digital 💎"}
                </span>
              </div>
              <div>
                <span className="text-white/40">Contract:</span>
                <span className="ml-2 text-white/50 text-xs">
                  {formatAddress(getContractId(), 6)}
                </span>
              </div>
            </div>

            {/* Metadata */}
            <div className="mt-4 p-3 rounded-xl bg-white/[0.02] border border-white/5">
              <p className="text-xs text-white/40 mb-1">IPFS Metadata</p>
              <p className="text-sm text-white/60 font-mono break-all">{auction.metadata_uri}</p>
            </div>
          </div>

          {/* Settled details */}
          {auction.status === "settled" && auction.seller_proceeds && (
            <div className="glass-card p-6">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-400" />
                Settlement Breakdown
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-white/40">Winning Bid:</span>
                  <span className="text-white font-semibold">{formatStroops(auction.highest_bid)} stroops</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/40">Seller Proceeds:</span>
                  <span className="text-white">{formatStroops(auction.seller_proceeds || "0")} stroops</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/40">Creator Royalty:</span>
                  <span className="text-ochre-400">{formatStroops(auction.royalty_amount || "0")} stroops</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/40">Platform Fee:</span>
                  <span className="text-white/50">{formatStroops(auction.platform_fee_amount || "0")} stroops</span>
                </div>
              </div>
            </div>
          )}

          {/* Bid History */}
          <div className="glass-card p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Bid History</h3>
            {bids.length === 0 ? (
              <p className="text-sm text-white/30 text-center py-6">No bids recorded</p>
            ) : (
              <div className="space-y-2">
                {bids.map((bid, i) => (
                  <div
                    key={bid.id || i}
                    className={`flex items-center justify-between p-3 rounded-xl transition-all ${
                      bid.is_winning
                        ? "bg-ochre-500/10 border border-ochre-500/20"
                        : "bg-white/[0.02] border border-white/5"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                          bid.is_winning ? "bg-ochre-500/20 text-ochre-400" : "bg-white/5 text-white/30"
                        }`}
                      >
                        {i + 1}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">{formatAddress(bid.bidder, 4)}</p>
                        <p className="text-xs text-white/30">
                          {new Date(bid.timestamp * 1000).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-white">
                        {formatStroops(bid.amount)} stroops
                      </p>
                      {bid.refunded && (
                        <span className="text-xs text-green-400">Refunded</span>
                      )}
                      {bid.is_winning && (
                        <span className="text-xs text-ochre-400">Leading</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar — Actions Panel */}
        <div className="space-y-4">
          <div className="glass-card p-6 sticky top-24">
            <h3 className="text-lg font-semibold text-white mb-4">
              {auction.status === "active" ? "Participation Panel" : "Auction " + auction.status}
            </h3>

            {auction.status === "active" && (
              <>
                {/* English Auction Flow */}
                {auction.format === "english" && (
                  <div className="space-y-3">
                    <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 mb-2">
                      <p className="text-xs text-white/40 mb-1">Minimum Next Bid</p>
                      <p className="text-xl font-bold text-ochre-400">
                        {auction.highest_bid && auction.highest_bid !== "0"
                          ? formatStroops(
                              String(BigInt(auction.highest_bid) + BigInt(auction.min_increment || "10"))
                            )
                          : formatStroops(auction.reserve_price)}{" "}
                        stroops
                      </p>
                    </div>

                    <div className="relative">
                      <input
                        type="number"
                        value={bidAmount}
                        onChange={(e) => setBidAmount(e.target.value)}
                        placeholder="Enter bid amount"
                        className="input-field pr-20"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/30">
                        stroops
                      </span>
                    </div>

                    <button
                      onClick={handlePlaceEnglishBid}
                      disabled={placingBid || !isConnected}
                      className="btn-primary w-full flex items-center justify-center gap-2"
                    >
                      {placingBid ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Submitting Bid...
                        </>
                      ) : (
                        <>
                          <Gavel className="w-4 h-4" />
                          Place Bid
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* Dutch Auction Flow */}
                {auction.format === "dutch" && (
                  <div className="space-y-3">
                    <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 mb-2">
                      <p className="text-xs text-white/40 mb-1">Current Price</p>
                      <p className="text-2xl font-bold text-indigo-400">
                        {formatStroops(auction.current_dutch_price || auction.reserve_price)} stroops
                      </p>
                    </div>

                    <button
                      onClick={handleBuyNow}
                      disabled={placingBid || !isConnected}
                      className="btn-primary w-full flex items-center justify-center gap-2"
                    >
                      {placingBid ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Executing Purchase...
                        </>
                      ) : (
                        <>
                          <TrendingDown className="w-4 h-4" />
                          Buy Now at Current Price
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* Sealed-Bid Auction Flow */}
                {auction.format === "sealed_bid" && (
                  <div className="space-y-4">
                    <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
                      <p className="text-xs text-white/40 mb-1">Commit-Reveal Mode</p>
                      <p className="text-xs text-terracotta-400">
                        Bids are hashed with a local salt during commit and revealed after deadline.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <div className="relative">
                        <input
                          type="number"
                          value={bidAmount}
                          onChange={(e) => setBidAmount(e.target.value)}
                          placeholder="Secret bid amount in stroops"
                          className="input-field pr-20"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/30">
                          stroops
                        </span>
                      </div>

                      <button
                        onClick={handleCommitSealedBid}
                        disabled={placingBid || !isConnected}
                        className="btn-primary w-full flex items-center justify-center gap-2"
                      >
                        {placingBid ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Committing Hash...
                          </>
                        ) : (
                          <>
                            <Shield className="w-4 h-4" />
                            Commit Sealed Bid
                          </>
                        )}
                      </button>
                    </div>

                    {savedCommitment && (
                      <div className="p-3 rounded-xl bg-terracotta-500/10 border border-terracotta-500/20 space-y-2">
                        <p className="text-xs text-terracotta-300 font-semibold flex items-center gap-1">
                          <KeyRound className="w-3.5 h-3.5" /> Saved Commitment
                        </p>
                        <p className="text-xs text-white/60">
                          Amount: {formatStroops(savedCommitment.amount)} stroops
                        </p>
                        <button
                          onClick={handleRevealSealedBid}
                          disabled={placingBid || !isConnected}
                          className="btn-secondary w-full text-xs py-2 flex items-center justify-center gap-1"
                        >
                          {placingBid ? <Loader2 className="w-3 h-3 animate-spin" /> : "Reveal Sealed Bid"}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Outbid / Claimable Refund Section */}
            <div className="mt-4 pt-4 border-t border-white/5 space-y-2">
              <p className="text-xs text-white/40">Escrow Refunds (Pull Payment)</p>
              <button
                onClick={handleWithdrawRefund}
                disabled={actionLoading || !isConnected}
                className="btn-secondary w-full text-xs py-2.5 flex items-center justify-center gap-1.5"
              >
                {actionLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <>
                    <RefreshCw className="w-3.5 h-3.5" />
                    Withdraw Available Refund
                  </>
                )}
              </button>
            </div>

            {/* Seller & Winner Settlement Controls */}
            {(isSeller || isWinner) && (
              <div className="mt-4 pt-4 border-t border-white/5 space-y-2">
                <p className="text-xs text-ochre-400 font-semibold">Management Controls</p>

                {isSeller && auction.status === "active" && (
                  <>
                    <button
                      onClick={handleApproveNftTransfer}
                      disabled={actionLoading}
                      className="btn-secondary w-full text-xs py-2 flex items-center justify-center gap-1.5"
                    >
                      Approve NFT Transfer
                    </button>
                    <button
                      onClick={handleCloseAuction}
                      disabled={actionLoading}
                      className="btn-secondary w-full text-xs py-2 flex items-center justify-center gap-1.5"
                    >
                      Close Auction
                    </button>
                    <button
                      onClick={handleCancelAuction}
                      disabled={actionLoading}
                      className="w-full text-xs py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-colors"
                    >
                      Cancel Listing
                    </button>
                  </>
                )}

                {(auction.status === "closed" || auction.status === "ended") && (
                  <button
                    onClick={handleSettleAuction}
                    disabled={actionLoading}
                    className="btn-primary w-full text-xs py-2.5 flex items-center justify-center gap-1.5"
                  >
                    {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Settle Auction & Payouts"}
                  </button>
                )}
              </div>
            )}

            {/* WebSocket status */}
            <p className="text-xs text-white/20 mt-4 text-center">
              {wsConnected ? "● Live updates active" : "○ Real-time connecting..."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
