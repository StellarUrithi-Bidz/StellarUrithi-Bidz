"use client";

import { useState } from "react";
import { useWallet } from "@/providers/wallet";
import { Shield, Settings, Pause, Play, AlertTriangle, Loader2 } from "lucide-react";
import toast from "react-hot-toast";

export default function AdminPage() {
  const { address, isConnected } = useWallet();
  const [platformFee, setPlatformFee] = useState("250");
  const [maxRoyalty, setMaxRoyalty] = useState("1500");
  const [isPaused, setIsPaused] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleUpdateConfig = async () => {
    setSaving(true);
    try {
      // In production, call update_config on the auction contract
      toast.success("Platform configuration updated!");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to update config";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePause = async () => {
    try {
      setIsPaused(!isPaused);
      toast.success(isPaused ? "Platform unpaused" : "Platform paused");
    } catch {
      toast.error("Failed to toggle pause state");
    }
  };

  if (!isConnected) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <Shield className="w-16 h-16 text-white/10 mx-auto mb-6" />
        <h2 className="text-2xl font-bold text-white mb-4">Admin Access</h2>
        <p className="text-white/40">Connect Freighter wallet to access admin panel.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-terracotta-500/20 flex items-center justify-center">
          <Shield className="w-5 h-5 text-terracotta-400" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-white">Admin Panel</h1>
          <p className="text-sm text-white/40">Platform configuration &amp; management</p>
        </div>
      </div>

      {/* Platform Settings */}
      <div className="glass-card p-6 mb-6">
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Settings className="w-5 h-5 text-white/40" />
          Platform Settings
        </h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-white/60 mb-1.5">
              Platform Fee (basis points)
            </label>
            <input
              type="number"
              value={platformFee}
              onChange={(e) => setPlatformFee(e.target.value)}
              className="input-field max-w-xs"
            />
            <p className="text-xs text-white/30 mt-1">
              {parseInt(platformFee || "0") / 100}% of each sale
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-white/60 mb-1.5">
              Maximum Royalty (basis points)
            </label>
            <input
              type="number"
              value={maxRoyalty}
              onChange={(e) => setMaxRoyalty(e.target.value)}
              className="input-field max-w-xs"
            />
          </div>

          <button
            onClick={handleUpdateConfig}
            disabled={saving}
            className="btn-primary flex items-center gap-2"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Configuration"
            )}
          </button>
        </div>
      </div>

      {/* Pause Control */}
      <div className="glass-card p-6 mb-6">
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-yellow-400" />
          Emergency Controls
        </h2>

        <div className="flex items-center justify-between p-4 rounded-xl bg-white/[0.03] border border-white/5">
          <div>
            <p className="font-medium text-white">Pause Platform</p>
            <p className="text-sm text-white/40">
              Pausing prevents new auctions from being created. Existing auctions continue.
            </p>
          </div>
          <button
            onClick={handleTogglePause}
            className={`px-4 py-2 rounded-xl font-semibold text-sm transition-all ${
              isPaused
                ? "bg-green-500/20 text-green-400 hover:bg-green-500/30"
                : "bg-red-500/20 text-red-400 hover:bg-red-500/30"
            }`}
          >
            {isPaused ? (
              <span className="flex items-center gap-1.5">
                <Play className="w-4 h-4" /> Unpause
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <Pause className="w-4 h-4" /> Pause
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Contract Info */}
      <div className="glass-card p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Contract Info</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-white/40">Contract ID:</span>
            <span className="text-white font-mono text-xs">
              {process.env.NEXT_PUBLIC_CONTRACT_ID || "Not configured"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/40">Network:</span>
            <span className="text-white capitalize">
              {process.env.NEXT_PUBLIC_STELLAR_NETWORK || "testnet"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/40">Connected Wallet:</span>
            <span className="text-white font-mono text-xs">{address}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
