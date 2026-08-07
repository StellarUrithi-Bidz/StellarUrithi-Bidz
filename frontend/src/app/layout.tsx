import type { Metadata } from "next";
import { WalletProvider } from "@/providers/wallet";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import { Toaster } from "react-hot-toast";
import "./globals.css";

export const metadata: Metadata = {
  title: "StellarUrithi-Bidz | African Art Auctions on Stellar",
  description:
    "On-chain auction protocol for African art and cultural artifacts. Bid with confidence — settled on Stellar for fast, low-fee finality with automatic royalty payments to creators.",
  keywords: [
    "African art",
    "auction",
    "Stellar",
    "blockchain",
    "NFT",
    "royalties",
    "cultural artifacts",
    "Soroban",
  ],
  openGraph: {
    title: "StellarUrithi-Bidz | African Art Auctions",
    description: "On-chain auction protocol for African art and cultural artifacts on Stellar.",
    type: "website",
    siteName: "StellarUrithi-Bidz",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-slate-950 text-white flex flex-col">
        <WalletProvider>
          <ErrorBoundary>
          <Navbar />
          <main className="flex-1">{children}</main>
          <Footer />
          </ErrorBoundary>
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: {
                background: "hsl(240 10% 8%)",
                color: "#fff",
                border: "1px solid hsl(240 3.7% 15.9%)",
                borderRadius: "12px",
                fontSize: "14px",
              },
            }}
          />
        </WalletProvider>
      </body>
    </html>
  );
}
