"use client";

import { useState, useEffect, useCallback } from "react";
import { useWallet } from "@/providers/wallet";
import { getBidHistory, BidItem } from "@/lib/api";
import { formatStroops, formatAddress } from "@/lib/stellar";
import { useBidderSocket } from "@/hooks/useWebSocket";
import { History, ArrowRight, Loader2, ExternalLink } from "lucide-react";
import Link from "next/link";

export default function MyBidsPage() {
  const { address, isConnected } = useWallet();
  const [bids, setBids] = useState<BidItem[]>([]);
  const [loading, setLoading] = useState(true);

  // WebSocket for real-time bidder notifications
  const { notification, clearNotification } = useBidderSocket(address);

  const fetchBids = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    const result = await getBidHistory(address);
    if (result.success && result.data) {
      setBids(result.data);
    }
    setLoading(false);
  }, [address]);

  useEffect(() => {
    if (address) fetchBids();
  }, [address, fetchBids]);

  if (!isConnected) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <History className="w-16 h-16 text-white/10 mx-auto mb-6" />
        <h2 className="text-2xl font-bold text-white mb-4">Connect Your Wallet</h2>
        <p className="text-white/40">Connect Freighter to view your bid history.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">My Bids</h1>
        <p className="text-white/40">Track your bidding activity</p>
      </div>

      {/* Notification banner */}
      {notification && (
        <div
          className={`mb-6 p-4 rounded-xl border flex items-center justify-between ${
            notification.type === "won"
              ? "bg-green-500/10 border-green-500/20"
              : "bg-ochre-500/10 border-ochre-500/20"
          }`}
        >
          <p className="text-sm text-white">{notification.message}</p>
          <button onClick={clearNotification} className="text-white/40 hover:text-white text-sm">
            Dismiss
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-ochre-400 animate-spin" />
        </div>
      ) : bids.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <History className="w-12 h-12 text-white/10 mx-auto mb-4" />
          <p className="text-white/40">No bids placed yet.</p>
          <Link href="/" className="mt-4 btn-secondary inline-flex items-center gap-2">
            Browse Auctions <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {bids.map((bid) => (
            <Link
              key={bid.id}
              href={`/auctions/${bid.auction_id}`}
              className="glass-card-hover p-4 flex items-center justify-between group"
            >
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <span className="text-sm font-semibold text-white">
                    Auction #{bid.auction_id}
                  </span>
                  <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${
                    bid.is_winning
                      ? "bg-ochre-500/20 text-ochre-400"
                      : bid.refunded
                      ? "bg-green-500/20 text-green-400"
                      : "bg-white/5 text-white/50"
                  }`}>
                    {bid.is_winning ? "Leading" : bid.refunded ? "Refunded" : "Outbid"}
                  </span>
                </div>
                <p className="text-xs text-white/30">
                  {new Date(bid.created_at).toLocaleString()}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-sm font-bold text-white">
                    {formatStroops(bid.amount)} stroops
                  </p>
                  <p className="text-xs text-white/30 capitalize">{bid.format.replace("_", " ")}</p>
                </div>
                <ExternalLink className="w-4 h-4 text-white/20 group-hover:text-ochre-400 transition-colors" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
