// Freighter Wallet Provider — Manages wallet connection state across the app.

"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { isConnected as freighterIsConnected, getAddress, requestAccess, setAllowed, signMessage } from "@stellar/freighter-api";
import toast from "react-hot-toast";

interface WalletContextType {
  address: string | null;
  isConnecting: boolean;
  isConnected: boolean;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => Promise<void>;
  signAuthMessage: (message: string) => Promise<string>;
  network: string;
}

const WalletContext = createContext<WalletContextType>({
  address: null,
  isConnecting: false,
  isConnected: false,
  connectWallet: async () => {},
  disconnectWallet: async () => {},
  signAuthMessage: async () => "",
  network: "testnet",
});

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const network = process.env.NEXT_PUBLIC_STELLAR_NETWORK || "testnet";

  // Check if Freighter is already connected on mount
  useEffect(() => {
    checkConnection();
  }, []);

  const checkConnection = async () => {
    try {
      const connected = await freighterIsConnected();
      if (connected && connected.isConnected) {
        const addr = await getAddress();
        if (addr && addr.address) {
          setAddress(addr.address);
          setIsConnected(true);
        }
      }
    } catch {
      // Freighter not installed or user not connected
    }
  };

  const connectWallet = useCallback(async () => {
    setIsConnecting(true);
    try {
      // Freighter v3: use requestAccess() to prompt connection
      await requestAccess();
      const addr = await getAddress();

      if (addr && addr.address) {
        setAddress(addr.address);
        setIsConnected(true);
        toast.success("Wallet connected!");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to connect wallet";
      if (message.includes("not installed")) {
        toast.error("Please install Freighter wallet extension");
      } else {
        toast.error(message);
      }
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnectWallet = useCallback(async () => {
    try {
      // Freighter v3: use setAllowed() to revoke access
      await setAllowed();
      setAddress(null);
      setIsConnected(false);
      toast.success("Wallet disconnected");
    } catch {
      // Already disconnected
      setAddress(null);
      setIsConnected(false);
    }
  }, []);

  const signAuthMessage = useCallback(async (message: string): Promise<string> => {
    try {
      const result = await signMessage(message);
      if (result?.signedMessage) {
        // Freighter v3 returns a Buffer, v4 returns a base64 string.
        // Always normalize to a base64 string for transport.
        const sm = result.signedMessage;
        if (typeof sm === "string") {
          return sm;
        }
        // V3 Buffer — convert to base64
        if (Buffer.isBuffer(sm)) {
          return sm.toString("base64");
        }
        return String(sm);
      }
      throw new Error("No signedMessage returned from Freighter");
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to sign message";
      toast.error(errorMsg);
      throw err;
    }
  }, []);

  return (
    <WalletContext.Provider
      value={{
        address,
        isConnecting,
        isConnected,
        connectWallet,
        disconnectWallet,
        signAuthMessage,
        network,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return context;
}
