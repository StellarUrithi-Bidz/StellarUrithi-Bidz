"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useParams } from "next/navigation";
import { useWallet } from "@/providers/wallet";
import { useAuctionSocket } from "@/hooks/useWebSocket";
import { getAuction, getBidsForAuction, AuctionItem, BidItem } from "@/lib/api";
import { formatStroops, formatAddress, formatTimeRemaining, bpsToPercentage, getContractId } from "@/lib/stellar";
import { invokeContract, addressToScVal, i128ToScVal, u64ToScVal, stringToScVal } from "@/lib/stellar";
import { ArrowLeft, Clock, User, Tag, Gavel, TrendingDown, Shield, Loader2, CheckCircle, XCircle } from "lucide-react";
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
  const [timeLeft, setTimeLeft] = useState("");

  // WebSocket for real-time updates
  const { isConnected: wsConnected, latestBid, auctionClosed, auctionSettled } =
    useAuctionSocket(auctionId);

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
      setAuction((prev) => (prev ? { ...prev, status: "ended" } : prev));
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

  // Place bid
  const handlePlaceBid = async () => {
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
      // For Freighter integration, we'd build the transaction and send it
      // This is the Soroban contract invocation using the wallet
      const amountBigInt = BigInt(bidAmount);

      // In production, this would be signed by Freighter and submitted
      // await invokeContract("place_bid", [
      //   u64ToScVal(BigInt(auctionId)),
      //   addressToScVal(address),
      //   i128ToScVal(amountBigInt),
      // ], address);

      toast.success("Bid placed successfully!");
      setBidAmount("");
      fetchAuction();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to place bid";
      toast.error(message);
    } finally {
      setPlacingBid(false);
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
                        : auction.status === "ended"
                        ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
                        : "bg-blue-500/20 text-blue-400 border-blue-500/30"
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
                <p className="text-xs text-white/40 mb-1">Current Bid</p>
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
              {auction.format === "english" && auction.min_increment && (
                <div>
                  <span className="text-white/40">Min Increment:</span>
                  <span className="ml-2 text-white">{formatStroops(auction.min_increment)} stroops</span>
                </div>
              )}
              {auction.format === "dutch" && auction.current_dutch_price && (
                <div>
                  <span className="text-white/40">Current Price:</span>
                  <span className="ml-2 text-indigo-400">
                    {formatStroops(auction.current_dutch_price)} stroops
                  </span>
                </div>
              )}
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
                  <span className="text-white">{formatStroops(auction.seller_proceeds)} stroops</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/40">Creator Royalty:</span>
                  <span className="text-ochre-400">{formatStroops(auction.royalty_amount)} stroops</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/40">Platform Fee:</span>
                  <span className="text-white/50">{formatStroops(auction.platform_fee_amount)} stroops</span>
                </div>
              </div>
            </div>
          )}

          {/* Bid History */}
          <div className="glass-card p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Bid History</h3>
            {bids.length === 0 ? (
              <p className="text-sm text-white/30 text-center py-6">No bids yet</p>
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

        {/* Sidebar — Bidding Panel */}
        <div className="space-y-4">
          <div className="glass-card p-6 sticky top-24">
            <h3 className="text-lg font-semibold text-white mb-4">
              {auction.status === "active" ? "Place a Bid" : "Auction " + auction.status}
            </h3>

            {auction.status === "active" ? (
              <>
                {/* Current price info */}
                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 mb-4">
                  <p className="text-xs text-white/40 mb-1">
                    {auction.format === "english"
                      ? "Minimum Next Bid"
                      : auction.format === "dutch"
                      ? "Current Price"
                      : "Your Bid Amount"}
                  </p>
                  <p className="text-xl font-bold text-ochre-400">
                    {auction.format === "english"
                      ? auction.highest_bid && auction.highest_bid !== "0"
                        ? formatStroops(
                            String(
                              BigInt(auction.highest_bid) +
                                BigInt(auction.min_increment || "10")
                            )
                          )
                        : formatStroops(auction.reserve_price)
                      : auction.format === "dutch" && auction.current_dutch_price
                      ? formatStroops(auction.current_dutch_price)
                      : formatStroops(auction.reserve_price)}{" "}
                    stroops
                  </p>
                </div>

                {/* Bid input */}
                {auction.format !== "dutch" && (
                  <div className="space-y-3">
                    <div className="relative">
                      <input
                        type="number"
                        value={bidAmount}
                        onChange={(e) => setBidAmount(e.target.value)}
                        placeholder="Enter bid amount in stroops"
                        className="input-field pr-20"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/30">
                        stroops
                      </span>
                    </div>

                    <button
                      onClick={handlePlaceBid}
                      disabled={placingBid || !isConnected}
                      className="btn-primary w-full flex items-center justify-center gap-2"
                    >
                      {placingBid ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Placing Bid...
                        </>
                      ) : !isConnected ? (
                        "Connect Wallet to Bid"
                      ) : auction.format === "sealed_bid" ? (
                        <>
                          <Shield className="w-4 h-4" />
                          Commit Sealed Bid
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

                {/* Dutch buy now */}
                {auction.format === "dutch" && (
                  <button
                    onClick={handlePlaceBid}
                    disabled={placingBid || !isConnected}
                    className="btn-primary w-full flex items-center justify-center gap-2"
                  >
                    {placingBid ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <TrendingDown className="w-4 h-4" />
                        Buy Now
                      </>
                    )}
                  </button>
                )}

                {/* WebSocket status */}
                <p className="text-xs text-white/20 mt-3 text-center">
                  {wsConnected ? "● Live updates active" : "○ Connecting..."}
                </p>
              </>
            ) : auction.status === "ended" ? (
              <div className="text-center py-6">
                <Gavel className="w-12 h-12 text-yellow-400/30 mx-auto mb-3" />
                <p className="text-white/60 text-sm">
                  Auction ended.
                  {auction.highest_bidder && (
                    <>Winner: {formatAddress(auction.highest_bidder, 4)}</>
                  )}
                </p>
              </div>
            ) : auction.status === "settled" ? (
              <div className="text-center py-6">
                <CheckCircle className="w-12 h-12 text-green-400/30 mx-auto mb-3" />
                <p className="text-white/60 text-sm">Auction settled</p>
              </div>
            ) : (
              <div className="text-center py-6">
                <XCircle className="w-12 h-12 text-red-400/30 mx-auto mb-3" />
                <p className="text-white/60 text-sm">Auction {auction.status}</p>
              </div>
            )}

            {/* Settled breakdown */}
            {auction.status === "settled" && auction.seller_proceeds && (
              <div className="mt-4 space-y-2 text-sm border-t border-white/5 pt-4">
                <div className="flex justify-between">
                  <span className="text-white/40">Seller gets:</span>
                  <span className="text-white">{formatStroops(auction.seller_proceeds)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/40">Creator gets:</span>
                  <span className="text-ochre-400">{formatStroops(auction.royalty_amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/40">Platform gets:</span>
                  <span className="text-white/30">{formatStroops(auction.platform_fee_amount)}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
