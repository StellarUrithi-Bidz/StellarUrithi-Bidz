"use client";

import Link from "next/link";
import { AuctionItem } from "@/lib/api";
import { formatStroops, formatAddress, formatTimeRemaining, bpsToPercentage } from "@/lib/stellar";
import { Clock, User, Tag, Gavel, TrendingDown, Shield } from "lucide-react";

interface AuctionCardProps {
  auction: AuctionItem;
}

export default function AuctionCard({ auction }: AuctionCardProps) {
  const timeRemaining = formatTimeRemaining(auction.end_time);
  const currentBid = auction.highest_bid ? formatStroops(auction.highest_bid) : null;
  const reservePrice = formatStroops(auction.reserve_price);

  const formatLabel = {
    english: { label: "English", icon: Gavel, color: "text-ochre-400" },
    dutch: { label: "Dutch", icon: TrendingDown, color: "text-indigo-400" },
    sealed_bid: { label: "Sealed-Bid", icon: Shield, color: "text-terracotta-400" },
  }[auction.format];

  const FormatIcon = formatLabel.icon;

  const statusBadge = {
    active: "bg-green-500/20 text-green-400 border-green-500/30",
    ended: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    settled: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    cancelled: "bg-red-500/20 text-red-400 border-red-500/30",
    created: "bg-white/5 text-white/50 border-white/10",
  }[auction.status];

  // Extract IPFS hash from metadata URI for image display
  const ipfsHash = auction.metadata_uri.replace("ipfs://", "");
  const imageUrl = `${process.env.NEXT_PUBLIC_PINATA_GATEWAY || "https://gateway.pinata.cloud"}/ipfs/${ipfsHash}`;

  return (
    <Link href={`/auctions/${auction.id}`} className="block group">
      <div className="glass-card-hover overflow-hidden">
        {/* Image area */}
        <div className="relative h-48 bg-gradient-to-br from-white/5 to-white/[0.02] overflow-hidden">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <FormatIcon className="w-16 h-16 text-white/10 mx-auto mb-2" />
              <p className="text-xs text-white/20 font-medium">
                {auction.metadata_uri
                  ? `IPFS: ${ipfsHash.slice(0, 12)}...`
                  : "No metadata"}
              </p>
            </div>
          </div>

          {/* Status badge */}
          <div className="absolute top-3 left-3">
            <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${statusBadge}`}>
              {auction.status.charAt(0).toUpperCase() + auction.status.slice(1)}
            </span>
          </div>

          {/* Format badge */}
          <div className="absolute top-3 right-3">
            <span className={`px-2.5 py-1 rounded-lg text-xs font-medium bg-white/10 border border-white/10 ${formatLabel.color}`}>
              <FormatIcon className="w-3 h-3 inline mr-1" />
              {formatLabel.label}
            </span>
          </div>

          {/* Item type badge */}
          <div className="absolute bottom-3 left-3">
            <span className="px-2 py-1 rounded-lg text-xs bg-white/10 text-white/50">
              {auction.item_type === "physical" ? "🏛️ Physical" : "💎 Digital"}
            </span>
          </div>

          {/* Timer */}
          {auction.status === "active" && (
            <div className="absolute bottom-3 right-3">
              <span className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-mono font-semibold ${
                timeRemaining === "Ended"
                  ? "bg-red-500/20 text-red-400"
                  : "bg-white/10 text-white/80"
              }`}>
                <Clock className="w-3 h-3" />
                {timeRemaining}
              </span>
            </div>
          )}
        </div>

        {/* Details */}
        <div className="p-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="font-semibold text-white group-hover:text-ochre-400 transition-colors">
                Auction #{auction.id}
              </h3>
              <p className="text-xs text-white/40 mt-0.5 flex items-center gap-1">
                <User className="w-3 h-3" />
                {formatAddress(auction.seller)}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            {/* Current / Reserve price */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/40 flex items-center gap-1">
                <Tag className="w-3.5 h-3.5" />
                {currentBid ? "Current Bid" : "Reserve Price"}
              </span>
              <span className="font-semibold text-white">
                {currentBid || reservePrice} stroops
              </span>
            </div>

            {/* Dutch current price */}
            {auction.format === "dutch" && auction.current_dutch_price && auction.status === "active" && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-indigo-400/60 flex items-center gap-1">
                  <TrendingDown className="w-3.5 h-3.5" />
                  Current Price
                </span>
                <span className="font-semibold text-indigo-400">
                  {formatStroops(auction.current_dutch_price)} stroops
                </span>
              </div>
            )}

            {/* Royalty */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/40">Royalty</span>
              <span className="text-ochre-400 font-medium">
                {bpsToPercentage(auction.royalty_bps)}
              </span>
            </div>
          </div>

          {/* Status-based CTA */}
          {auction.status === "active" && (
            <div className="mt-4 pt-3 border-t border-white/5">
              <span className="text-sm font-medium text-ochre-400 group-hover:text-ochre-300 transition-colors">
                {auction.format === "english"
                  ? "Place Bid →"
                  : auction.format === "dutch"
                  ? "Buy Now →"
                  : "Commit Bid →"}
              </span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
