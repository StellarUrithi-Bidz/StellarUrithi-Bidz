import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import MyBidsPage from "@/app/my-bids/page";

// Mocks
vi.mock("@/providers/wallet", () => ({
  useWallet: vi.fn(() => ({
    address: "GABCDEF1234567890ABCDEF1234567890ABCDEF",
    isConnected: true,
    isConnecting: false,
    connectWallet: vi.fn(),
    disconnectWallet: vi.fn(),
    signAuthMessage: vi.fn(),
    network: "testnet",
  })),
}));

vi.mock("@/hooks/useWebSocket", () => ({
  useBidderSocket: vi.fn(() => ({
    notification: null,
    clearNotification: vi.fn(),
    isAuthenticated: false,
  })),
}));

vi.mock("@/lib/api", () => ({
  getBidHistory: vi.fn(),
}));

vi.mock("@/lib/stellar", () => ({
  formatStroops: (v: string) => (BigInt(v) / BigInt(10_000_000)).toString(),
  formatAddress: (a: string) => a.slice(0, 6) + "..." + a.slice(-4),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: Record<string, unknown>) => (
    <a href={href as string} {...props}>{children as React.ReactNode}</a>
  ),
}));

vi.mock("lucide-react", () => ({
  History: () => <span data-testid="icon-history" />,
  ArrowRight: () => <span data-testid="icon-arrow-right" />,
  Loader2: () => <span data-testid="icon-loader" />,
  ExternalLink: () => <span data-testid="icon-external-link" />,
}));

import { useWallet } from "@/providers/wallet";
import { getBidHistory } from "@/lib/api";
import { useBidderSocket } from "@/hooks/useWebSocket";

function mockBids() {
  return [
    { id: 1, auction_id: 10, bidder: "GABC...", amount: "500000000", format: "english", timestamp: 1700000000, is_winning: true, refunded: false, created_at: "2025-01-15T10:00:00Z" },
    { id: 2, auction_id: 12, bidder: "GABC...", amount: "200000000", format: "dutch", timestamp: 1700001000, is_winning: false, refunded: true, created_at: "2025-01-15T09:00:00Z" },
    { id: 3, auction_id: 15, bidder: "GABC...", amount: "100000000", format: "sealed_bid", timestamp: 1700002000, is_winning: false, refunded: false, created_at: "2025-01-14T08:00:00Z" },
  ];
}

describe("MyBidsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useWallet).mockReturnValue({
      address: "GABCDEF1234567890ABCDEF1234567890ABCDEF", isConnected: true, isConnecting: false,
      connectWallet: vi.fn(), disconnectWallet: vi.fn(), signAuthMessage: vi.fn(), network: "testnet",
    });
    vi.mocked(useBidderSocket).mockReturnValue({
      notification: null, clearNotification: vi.fn(), isAuthenticated: false,
    });
    vi.mocked(getBidHistory).mockResolvedValue({ success: true, data: mockBids() });
  });

  it("shows connect prompt when wallet not connected", () => {
    vi.mocked(useWallet).mockReturnValue({
      address: null, isConnected: false, isConnecting: false,
      connectWallet: vi.fn(), disconnectWallet: vi.fn(), signAuthMessage: vi.fn(), network: "testnet",
    });
    render(<MyBidsPage />);
    expect(screen.getByText("Connect Your Wallet")).toBeInTheDocument();
    expect(screen.getByText(/Connect Freighter to view your bid history/)).toBeInTheDocument();
  });

  it("renders page title when connected", async () => {
    render(<MyBidsPage />);
    await waitFor(() => {
      expect(screen.getByText("My Bids")).toBeInTheDocument();
      expect(screen.getByText("Track your bidding activity")).toBeInTheDocument();
    });
  });

  it("renders bid list items after loading", async () => {
    render(<MyBidsPage />);
    await waitFor(() => {
      expect(screen.getByText("Auction #10")).toBeInTheDocument();
      expect(screen.getByText("Auction #12")).toBeInTheDocument();
      expect(screen.getByText("Auction #15")).toBeInTheDocument();
    });
  });

  it("shows winning/refunded/outbid status badges", async () => {
    render(<MyBidsPage />);
    await waitFor(() => {
      expect(screen.getByText("Leading")).toBeInTheDocument();
      expect(screen.getByText("Refunded")).toBeInTheDocument();
      expect(screen.getByText("Outbid")).toBeInTheDocument();
    });
  });

  it("shows bid amounts in stroops", async () => {
    render(<MyBidsPage />);
    await waitFor(() => {
      expect(screen.getByText("50 stroops")).toBeInTheDocument();
      expect(screen.getByText("20 stroops")).toBeInTheDocument();
      expect(screen.getByText("10 stroops")).toBeInTheDocument();
    });
  });

  it("shows empty state when no bids", async () => {
    vi.mocked(getBidHistory).mockResolvedValue({ success: true, data: [] });
    render(<MyBidsPage />);
    await waitFor(() => {
      expect(screen.getByText("No bids placed yet.")).toBeInTheDocument();
      expect(screen.getByText("Browse Auctions")).toBeInTheDocument();
    });
  });

  it("shows notification banner when bidder socket event fires", () => {
    vi.mocked(useBidderSocket).mockReturnValue({
      notification: { type: "won", auctionId: 42, message: "You won auction #42 with 100 stroops!" },
      clearNotification: vi.fn(), isAuthenticated: false,
    });
    render(<MyBidsPage />);
    expect(screen.getByText("You won auction #42 with 100 stroops!")).toBeInTheDocument();
    expect(screen.getByText("Dismiss")).toBeInTheDocument();
  });

  it("links each bid row to the auction detail page", async () => {
    render(<MyBidsPage />);
    await waitFor(() => {
      const links = screen.getAllByRole("link");
      expect(links.some(l => l.getAttribute("href") === "/auctions/10")).toBe(true);
      expect(links.some(l => l.getAttribute("href") === "/auctions/12")).toBe(true);
    });
  });

  // ── Deeper tests ─────────────────────────────────────────────────────────

  it("shows format labels for each bid", async () => {
    render(<MyBidsPage />);
    await waitFor(() => {
      expect(screen.getByText("english")).toBeInTheDocument();
      expect(screen.getByText("dutch")).toBeInTheDocument();
      expect(screen.getByText("sealed bid")).toBeInTheDocument();
    });
  });

  it("shows refunded notification banner for refund event", () => {
    vi.mocked(useBidderSocket).mockReturnValue({
      notification: { type: "refunded", auctionId: 12, message: "You've been refunded 200 stroops — you were outbid!" },
      clearNotification: vi.fn(), isAuthenticated: false,
    });
    render(<MyBidsPage />);
    expect(screen.getByText(/refunded 200 stroops/)).toBeInTheDocument();
  });

  it("calls clearNotification on Dismiss click", () => {
    const clearMock = vi.fn();
    vi.mocked(useBidderSocket).mockReturnValue({
      notification: { type: "won", auctionId: 42, message: "You won!" },
      clearNotification: clearMock, isAuthenticated: false,
    });
    render(<MyBidsPage />);
    fireEvent.click(screen.getByText("Dismiss"));
    expect(clearMock).toHaveBeenCalled();
  });

  it("does not fetch bids when address is null", () => {
    vi.mocked(useWallet).mockReturnValue({
      address: null, isConnected: true, isConnecting: false,
      connectWallet: vi.fn(), disconnectWallet: vi.fn(), signAuthMessage: vi.fn(), network: "testnet",
    });
    render(<MyBidsPage />);
    // When address is null, getBidHistory should not be called
    expect(getBidHistory).not.toHaveBeenCalled();
  });

  it("shows Browse Auctions link pointing to home", async () => {
    vi.mocked(getBidHistory).mockResolvedValue({ success: true, data: [] });
    render(<MyBidsPage />);
    await waitFor(() => {
      const link = screen.getByText("Browse Auctions");
      expect(link.closest("a")?.getAttribute("href")).toBe("/");
    });
  });

  it("renders external link icons on each bid row", async () => {
    render(<MyBidsPage />);
    await waitFor(() => {
      const icons = screen.getAllByTestId("icon-external-link");
      expect(icons.length).toBe(3);
    });
  });

  it("shows bid timestamps", async () => {
    render(<MyBidsPage />);
    await waitFor(() => {
      // Multiple rows have timestamps — verify at least one date string appears
      const timestamps = screen.getAllByText(/2025/);
      expect(timestamps.length).toBeGreaterThanOrEqual(1);
    });
  });
});
