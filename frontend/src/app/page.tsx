"use client";

import { useState, useEffect, useCallback } from "react";
import { getAuctions, AuctionItem, getAnalytics, Analytics } from "@/lib/api";
import AuctionCard from "@/components/auction/AuctionCard";
import { useWallet } from "@/providers/wallet";
import { Gavel, TrendingUp, Clock, CheckCircle, Search, Filter, Loader2 } from "lucide-react";

export default function HomePage() {
  const { isConnected } = useWallet();
  const [auctions, setAuctions] = useState<AuctionItem[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [formatFilter, setFormatFilter] = useState<string>("");

  const fetchAuctions = useCallback(async () => {
    setLoading(true);
    const result = await getAuctions({
      status: statusFilter || undefined,
      format: formatFilter || undefined,
      limit: 50,
    });
    if (result.success && result.data) {
      setAuctions(result.data);
    }
    setLoading(false);
  }, [statusFilter, formatFilter]);

  useEffect(() => {
    fetchAuctions();
  }, [fetchAuctions]);

  useEffect(() => {
    getAnalytics().then((res) => {
      if (res.success && res.data) setAnalytics(res.data);
    });
  }, []);

  // Poll for updates every 15 seconds
  useEffect(() => {
    const interval = setInterval(fetchAuctions, 15000);
    return () => clearInterval(interval);
  }, [fetchAuctions]);

  return (
    <div className="min-h-screen">
      {/* Hero section */}
      <section className="relative overflow-hidden border-b border-white/5">
        <div className="absolute inset-0 bg-gradient-to-b from-ochre-500/5 via-transparent to-transparent" />
        <div className="absolute top-1/3 -left-32 w-[500px] h-[500px] rounded-full bg-terracotta-500/10 blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full bg-indigo-500/10 blur-[100px]" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24 relative">
          <div className="max-w-3xl">
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
              <span className="gradient-text">African Art</span>
              <br />
              <span className="text-white">Auction Protocol</span>
            </h1>
            <p className="text-lg md:text-xl text-white/50 leading-relaxed mb-8">
              Bid on curated African art and cultural artifacts. Every sale automatically
              pays creator royalties — settled instantly on Stellar with near-zero fees.
            </p>
            {!isConnected && (
              <p className="text-sm text-ochre-400/80 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-ochre-400 animate-pulse" />
                Connect your Freighter wallet to start bidding
              </p>
            )}
          </div>
        </div>

        {/* Stats bar */}
        {analytics && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8 relative">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard
                icon={<Gavel className="w-5 h-5" />}
                label="Total Auctions"
                value={analytics.total_auctions.toLocaleString()}
              />
              <StatCard
                icon={<TrendingUp className="w-5 h-5" />}
                label="Volume"
                value={`${(parseInt(analytics.total_volume) / 10_000_000).toLocaleString()} XLM`}
              />
              <StatCard
                icon={<Clock className="w-5 h-5" />}
                label="Active"
                value={analytics.active_auctions.toLocaleString()}
              />
              <StatCard
                icon={<CheckCircle className="w-5 h-5" />}
                label="Settled"
                value={analytics.settled_auctions.toLocaleString()}
              />
            </div>
          </div>
        )}
      </section>

      {/* Filters */}
      <section className="border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-white/40">
              <Filter className="w-4 h-4" />
              Filters:
            </div>

            {/* Status filter */}
            {["active", "ended", "settled", "all"].map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status === "all" ? "" : status)}
                className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  statusFilter === status || (status === "all" && !statusFilter)
                    ? "bg-ochre-500/20 text-ochre-400 border border-ochre-500/30"
                    : "bg-white/5 text-white/50 border border-white/5 hover:bg-white/10"
                }`}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}

            <div className="w-px h-5 bg-white/10 mx-1" />

            {/* Format filter */}
            {["english", "dutch", "sealed_bid", "all_formats"].map((format) => (
              <button
                key={format}
                onClick={() => setFormatFilter(format === "all_formats" ? "" : format)}
                className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  formatFilter === format || (format === "all_formats" && !formatFilter)
                    ? "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30"
                    : "bg-white/5 text-white/50 border border-white/5 hover:bg-white/10"
                }`}
              >
                {format === "sealed_bid"
                  ? "Sealed-Bid"
                  : format === "all_formats"
                  ? "All Formats"
                  : format.charAt(0).toUpperCase() + format.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Auction grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-ochre-400 animate-spin" />
          </div>
        ) : auctions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-white/30">
            <Gavel className="w-16 h-16 mb-4" />
            <p className="text-lg font-medium">No auctions found</p>
            <p className="text-sm mt-1">Check back later or change your filters</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {auctions.map((auction) => (
              <AuctionCard key={auction.id} auction={auction} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="glass-card p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-ochre-400">
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-white">{value}</p>
        <p className="text-xs text-white/40">{label}</p>
      </div>
    </div>
  );
}
