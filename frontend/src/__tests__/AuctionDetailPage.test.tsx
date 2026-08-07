import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import AuctionDetailPage from "@/app/auctions/[id]/page";

// Mocks
const mockUseParams = vi.fn(() => ({ id: "42" }));
vi.mock("next/navigation", () => ({
  useParams: () => mockUseParams(),
}));

vi.mock("@/providers/wallet", () => ({
  useWallet: vi.fn(() => ({
    address: "GABCDEF1234567890ABCDEF1234567890ABCDEF",
    isConnected: true, isConnecting: false,
    connectWallet: vi.fn(), disconnectWallet: vi.fn(), signAuthMessage: vi.fn(), network: "testnet",
  })),
}));

vi.mock("@/hooks/useWebSocket", () => ({
  useAuctionSocket: vi.fn(() => ({
    isConnected: false, latestBid: null, auctionClosed: null, auctionSettled: null,
  })),
}));

vi.mock("@/lib/api", () => ({
  getAuction: vi.fn(),
  getBidsForAuction: vi.fn(),
}));

vi.mock("@/lib/stellar", () => ({
  formatStroops: (v: string) => (BigInt(v) / BigInt(10_000_000)).toString(),
  formatAddress: (a: string) => a.slice(0, 6) + "..." + a.slice(-4),
  formatTimeRemaining: () => "1h 30m",
  bpsToPercentage: (bps: number) => (bps / 100).toFixed(2) + "%",
  getContractId: () => "CD_TEST_CONTRACT_ID",
  invokeContract: vi.fn(),
  addressToScVal: vi.fn(),
  i128ToScVal: vi.fn(),
  u64ToScVal: vi.fn(),
  stringToScVal: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: Record<string, unknown>) => (
    <a href={href as string} {...props}>{children as React.ReactNode}</a>
  ),
}));

vi.mock("lucide-react", () => ({
  ArrowLeft: () => <span data-testid="icon-arrow-left" />,
  Clock: () => <span data-testid="icon-clock" />,
  User: () => <span data-testid="icon-user" />,
  Tag: () => <span data-testid="icon-tag" />,
  Gavel: () => <span data-testid="icon-gavel" />,
  TrendingDown: () => <span data-testid="icon-trending-down" />,
  Shield: () => <span data-testid="icon-shield" />,
  Loader2: () => <span data-testid="icon-loader" />,
  CheckCircle: () => <span data-testid="icon-check" />,
  XCircle: () => <span data-testid="icon-x-circle" />,
}));

import { getAuction, getBidsForAuction } from "@/lib/api";
import { useWallet } from "@/providers/wallet";

function mockAuction(overrides: Record<string, unknown> = {}) {
  return {
    id: 42, seller: "GSELLER1234567890ABCDEF1234567890ABCDEF",
    original_creator: "GCREATOR1234567890ABCDEF1234567890AB",
    format: "english", status: "active", item_type: "digital",
    payment_token: "GBBD47IF6LOKAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    reserve_price: "100000000", royalty_bps: 500, platform_fee_bps: 250,
    start_time: 1700000000, end_time: 1700003600,
    metadata_uri: "ipfs://QmTest123",
    highest_bid: "200000000", highest_bidder: "GBIDDER1234567890ABCDEF1234567890AB",
    min_increment: "10000000", attested: false,
    ...overrides,
  };
}

describe("AuctionDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseParams.mockReturnValue({ id: "42" });
    vi.mocked(useWallet).mockReturnValue({
      address: "GABCDEF1234567890ABCDEF1234567890ABCDEF", isConnected: true, isConnecting: false,
      connectWallet: vi.fn(), disconnectWallet: vi.fn(), signAuthMessage: vi.fn(), network: "testnet",
    });
    vi.mocked(getAuction).mockResolvedValue({ success: true, data: mockAuction() as never });
    vi.mocked(getBidsForAuction).mockResolvedValue({ success: true, data: [] });
  });

  it("shows loading spinner initially", () => {
    vi.mocked(getAuction).mockReturnValue(new Promise(() => {})); // never resolves
    render(<AuctionDetailPage />);
    expect(screen.getByTestId("icon-loader")).toBeInTheDocument();
  });

  it("shows not-found message when auction is null", async () => {
    vi.mocked(getAuction).mockResolvedValue({ success: false, error: "Not found" });
    render(<AuctionDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Auction not found")).toBeInTheDocument();
      expect(screen.getByText("Back to Auctions")).toBeInTheDocument();
    });
  });

  it("renders auction ID in header", async () => {
    render(<AuctionDetailPage />);
    await waitFor(() => {
      expect(screen.getByText(/Auction #42/)).toBeInTheDocument();
    });
  });

  it("shows active status badge for active auction", async () => {
    render(<AuctionDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Active")).toBeInTheDocument();
    });
  });

  it("shows format label (English)", async () => {
    render(<AuctionDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("English")).toBeInTheDocument();
    });
  });

  it("shows seller address", async () => {
    render(<AuctionDetailPage />);
    await waitFor(() => {
      expect(screen.getByText(/GSELLE\.\.\.CDEF/)).toBeInTheDocument();
    });
  });

  it("shows current bid and highest bidder", async () => {
    render(<AuctionDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("20 stroops")).toBeInTheDocument();
      expect(screen.getByText(/GBIDDE/)).toBeInTheDocument();
    });
  });

  it("shows No bids yet when highest_bid is 0", async () => {
    vi.mocked(getAuction).mockResolvedValue({
      success: true,
      data: mockAuction({ highest_bid: "0", highest_bidder: undefined }) as never,
    });
    render(<AuctionDetailPage />);
    await waitFor(() => {
      // "No bids yet" appears twice: in price area and bid history
      const elements = screen.getAllByText("No bids yet");
      expect(elements.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("shows time remaining for active auction", async () => {
    render(<AuctionDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Time Remaining")).toBeInTheDocument();
      expect(screen.getByText("1h 30m")).toBeInTheDocument();
    });
  });

  it("shows reserve price in item details", async () => {
    render(<AuctionDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Reserve Price:")).toBeInTheDocument();
    });
  });

  it("shows royalty percentage", async () => {
    render(<AuctionDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("5.00%")).toBeInTheDocument();
    });
  });

  it("shows IPFS metadata URI", async () => {
    render(<AuctionDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("ipfs://QmTest123")).toBeInTheDocument();
    });
  });

  it("renders bidding panel with Place a Bid header", async () => {
    render(<AuctionDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Place a Bid")).toBeInTheDocument();
    });
  });

  it("renders bid input field for English auctions", async () => {
    render(<AuctionDetailPage />);
    await waitFor(() => {
      const input = screen.getByPlaceholderText("Enter bid amount in stroops");
      expect(input).toBeInTheDocument();
    });
  });

  it("shows Connect Wallet to Bid when not connected", async () => {
    vi.mocked(useWallet).mockReturnValue({
      address: null, isConnected: false, isConnecting: false,
      connectWallet: vi.fn(), disconnectWallet: vi.fn(), signAuthMessage: vi.fn(), network: "testnet",
    });
    render(<AuctionDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Connect Wallet to Bid")).toBeInTheDocument();
    });
  });

  it("shows Dutch buy button for Dutch auctions", async () => {
    vi.mocked(getAuction).mockResolvedValue({
      success: true,
      data: mockAuction({ format: "dutch", current_dutch_price: "500000000" }) as never,
    });
    render(<AuctionDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Buy Now")).toBeInTheDocument();
    });
  });

  it("shows Commit Sealed Bid button for sealed_bid auctions", async () => {
    vi.mocked(getAuction).mockResolvedValue({
      success: true,
      data: mockAuction({ format: "sealed_bid" }) as never,
    });
    render(<AuctionDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Commit Sealed Bid")).toBeInTheDocument();
    });
  });

  it("shows WebSocket status indicator", async () => {
    render(<AuctionDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("○ Connecting...")).toBeInTheDocument();
    });
  });

  it("shows ended state when auction is ended", async () => {
    vi.mocked(getAuction).mockResolvedValue({
      success: true,
      data: mockAuction({ status: "ended" }) as never,
    });
    render(<AuctionDetailPage />);
    await waitFor(() => {
      // Status badge shows "Ended"
      expect(screen.getByText("Ended")).toBeInTheDocument();
    });
  });

  it("shows settlement breakdown for settled auction", async () => {
    vi.mocked(getAuction).mockResolvedValue({
      success: true,
      data: mockAuction({
        status: "settled",
        seller_proceeds: "800000000",
        royalty_amount: "100000000",
        platform_fee_amount: "50000000",
      }) as never,
    });
    render(<AuctionDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Settlement Breakdown")).toBeInTheDocument();
    }, { timeout: 3000 });
    // "Auction settled" appears in both the main content and sidebar
    const settledTexts = screen.getAllByText("Auction settled");
    expect(settledTexts.length).toBeGreaterThanOrEqual(1);
  });

  it("shows bid history with bidder addresses", async () => {
    vi.mocked(getBidsForAuction).mockResolvedValue({
      success: true,
      data: [
        { id: 1, auction_id: 42, bidder: "GBIDDER1", amount: "150000000", format: "english", timestamp: 1700000100, is_winning: false, refunded: true, created_at: "" },
        { id: 2, auction_id: 42, bidder: "GBIDDER2", amount: "200000000", format: "english", timestamp: 1700000200, is_winning: true, refunded: false, created_at: "" },
      ],
    });
    render(<AuctionDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Bid History")).toBeInTheDocument();
      expect(screen.getByText("Leading")).toBeInTheDocument();
      expect(screen.getByText("Refunded")).toBeInTheDocument();
    });
  });

  // ── Deeper tests ─────────────────────────────────────────────────────────

  it("shows cancelled status for cancelled auction", async () => {
    vi.mocked(getAuction).mockResolvedValue({
      success: true,
      data: mockAuction({ status: "cancelled" }) as never,
    });
    render(<AuctionDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Cancelled")).toBeInTheDocument();
      expect(screen.getByTestId("icon-x-circle")).toBeInTheDocument();
    });
  });

  it("shows physical item type badge", async () => {
    vi.mocked(getAuction).mockResolvedValue({
      success: true,
      data: mockAuction({ item_type: "physical" }) as never,
    });
    render(<AuctionDetailPage />);
    await waitFor(() => {
      expect(screen.getByText(/Physical/)).toBeInTheDocument();
    });
  });

  it("shows min increment for English auctions", async () => {
    render(<AuctionDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Min Increment:")).toBeInTheDocument();
    });
  });

  it("shows Dutch current price field", async () => {
    vi.mocked(getAuction).mockResolvedValue({
      success: true,
      data: mockAuction({ format: "dutch", current_dutch_price: "800000000" }) as never,
    });
    render(<AuctionDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Current Price:")).toBeInTheDocument();
    });
  });

  it("shows contract address from getContractId", async () => {
    render(<AuctionDetailPage />);
    await waitFor(() => {
      expect(screen.getByText(/CD_TES/)).toBeInTheDocument();
    });
  });

  it("accepts bid amount input changes", async () => {
    render(<AuctionDetailPage />);
    await waitFor(() => {
      const input = screen.getByPlaceholderText("Enter bid amount in stroops") as HTMLInputElement;
      fireEvent.change(input, { target: { value: "500" } });
      expect(input.value).toBe("500");
    });
  });

  it("shows Minimum Next Bid label for English auctions", async () => {
    render(<AuctionDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Minimum Next Bid")).toBeInTheDocument();
    });
  });

  it("shows Your Bid Amount label for sealed_bid auctions", async () => {
    vi.mocked(getAuction).mockResolvedValue({
      success: true,
      data: mockAuction({ format: "sealed_bid" }) as never,
    });
    render(<AuctionDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Your Bid Amount")).toBeInTheDocument();
    });
  });

  it("shows Current Price label for Dutch auctions", async () => {
    vi.mocked(getAuction).mockResolvedValue({
      success: true,
      data: mockAuction({ format: "dutch", current_dutch_price: "700000000" }) as never,
    });
    render(<AuctionDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Current Price")).toBeInTheDocument();
    });
  });

  it("shows settlement sidebar amounts for settled auction", async () => {
    vi.mocked(getAuction).mockResolvedValue({
      success: true,
      data: mockAuction({
        status: "settled",
        seller_proceeds: "800000000",
        royalty_amount: "100000000",
        platform_fee_amount: "50000000",
      }) as never,
    });
    render(<AuctionDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Settlement Breakdown")).toBeInTheDocument();
    }, { timeout: 3000 });
    expect(screen.getByText("Seller gets:")).toBeInTheDocument();
    expect(screen.getByText("Creator gets:")).toBeInTheDocument();
    expect(screen.getByText("Platform gets:")).toBeInTheDocument();
  });

  it("shows breadcrumb back link to auctions", async () => {
    render(<AuctionDetailPage />);
    await waitFor(() => {
      const breadcrumb = screen.getByText("Back to Auctions");
      expect(breadcrumb.closest("a")?.getAttribute("href")).toBe("/");
    });
  });

  it("displays created status badge for created auction", async () => {
    vi.mocked(getAuction).mockResolvedValue({
      success: true,
      data: mockAuction({ status: "created" }) as never,
    });
    render(<AuctionDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Created")).toBeInTheDocument();
    });
  });
});
