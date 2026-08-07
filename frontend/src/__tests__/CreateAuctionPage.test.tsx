import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import CreateAuctionPage from "@/app/create/page";

// Mocks
vi.mock("@/providers/wallet", () => ({
  useWallet: vi.fn(() => ({
    address: "GABCDEF1234567890ABCDEF1234567890ABCDEF",
    isConnected: true, isConnecting: false,
    connectWallet: vi.fn(), disconnectWallet: vi.fn(), signAuthMessage: vi.fn(), network: "testnet",
  })),
}));

vi.mock("@/components/ui/IPFSUploader", () => ({
  default: ({ onUploadComplete, mode, label }: { onUploadComplete: (uri: string, r: unknown) => void; mode: string; label: string }) => (
    <div data-testid={`ipfs-uploader-${mode}`}>
      <button data-testid={`trigger-upload-${mode}`} onClick={() => onUploadComplete("ipfs://QmTest", { cid: "QmTest", ipfsUri: "ipfs://QmTest", url: "" })}>
        {label || `Upload ${mode}`}
      </button>
    </div>
  ),
}));

vi.mock("@/lib/pinata", () => ({
  PinataUploadResult: {},
}));

vi.mock("lucide-react", () => ({
  PlusCircle: () => <span data-testid="icon-plus" />,
  Gavel: () => <span data-testid="icon-gavel" />,
  TrendingDown: () => <span data-testid="icon-trending-down" />,
  Shield: () => <span data-testid="icon-shield" />,
  Loader2: () => <span data-testid="icon-loader" />,
  CheckCircle: () => <span data-testid="icon-check" />,
}));

import { useWallet } from "@/providers/wallet";

describe("CreateAuctionPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useWallet).mockReturnValue({
      address: "GABCDEF1234567890ABCDEF1234567890ABCDEF", isConnected: true, isConnecting: false,
      connectWallet: vi.fn(), disconnectWallet: vi.fn(), signAuthMessage: vi.fn(), network: "testnet",
    });
  });

  it("shows connect prompt when wallet not connected", () => {
    vi.mocked(useWallet).mockReturnValue({
      address: null, isConnected: false, isConnecting: false,
      connectWallet: vi.fn(), disconnectWallet: vi.fn(), signAuthMessage: vi.fn(), network: "testnet",
    });
    render(<CreateAuctionPage />);
    expect(screen.getByText("Connect Your Wallet")).toBeInTheDocument();
    expect(screen.getByText("Connect Freighter to create an auction listing.")).toBeInTheDocument();
  });

  it("renders page title and progress steps", () => {
    render(<CreateAuctionPage />);
    expect(screen.getByText("Create Auction")).toBeInTheDocument();
    expect(screen.getByText("List an item for auction on Stellar")).toBeInTheDocument();
    // 3 step indicators
    const steps = screen.getAllByText(/^[123]$/);
    expect(steps.length).toBeGreaterThanOrEqual(2);
  });

  it("shows step 1: format selection with all three formats", () => {
    render(<CreateAuctionPage />);
    expect(screen.getByText("Choose Auction Format")).toBeInTheDocument();
    expect(screen.getByText("English (Ascending)")).toBeInTheDocument();
    expect(screen.getByText("Dutch (Descending)")).toBeInTheDocument();
    expect(screen.getByText("Sealed-Bid (Commit-Reveal)")).toBeInTheDocument();
  });

  it("shows item type selection (Digital/Physical)", () => {
    render(<CreateAuctionPage />);
    expect(screen.getByText(/Digital/)).toBeInTheDocument();
    expect(screen.getByText(/Physical/)).toBeInTheDocument();
  });

  it("navigates to step 2 on Continue click", () => {
    render(<CreateAuctionPage />);
    fireEvent.click(screen.getByText("Continue →"));
    expect(screen.getByText("Auction Details")).toBeInTheDocument();
  });

  it("step 2 shows reserve price and royalty fields", () => {
    render(<CreateAuctionPage />);
    fireEvent.click(screen.getByText("Continue →"));
    expect(screen.getByText("Reserve Price (stroops)")).toBeInTheDocument();
    expect(screen.getByText("Creator Royalty (basis points)")).toBeInTheDocument();
    expect(screen.getByText("Auction Duration (hours)")).toBeInTheDocument();
    expect(screen.getByText("Original Creator Address")).toBeInTheDocument();
  });

  it("step 2 shows English min increment when English selected", () => {
    render(<CreateAuctionPage />);
    fireEvent.click(screen.getByText("Continue →"));
    expect(screen.getByText("Minimum Bid Increment (stroops)")).toBeInTheDocument();
  });

  it("step 2 shows Dutch fields when Dutch format selected", () => {
    render(<CreateAuctionPage />);
    // Select Dutch format first
    fireEvent.click(screen.getByText("Dutch (Descending)"));
    fireEvent.click(screen.getByText("Continue →"));
    expect(screen.getByText("Start Price (stroops)")).toBeInTheDocument();
    expect(screen.getByText("Price Decay Rate (stroops/second)")).toBeInTheDocument();
  });

  it("step 2 shows sealed-bid commit duration when sealed_bid selected", () => {
    render(<CreateAuctionPage />);
    fireEvent.click(screen.getByText("Sealed-Bid (Commit-Reveal)"));
    fireEvent.click(screen.getByText("Continue →"));
    expect(screen.getByText("Commit Phase Duration (hours)")).toBeInTheDocument();
  });

  it("step 2 shows custodian address when physical item type selected", () => {
    render(<CreateAuctionPage />);
    fireEvent.click(screen.getByText(/Physical/));
    fireEvent.click(screen.getByText("Continue →"));
    expect(screen.getByText("Custodian Address (gallery/verifier)")).toBeInTheDocument();
  });

  it("navigates back from step 2 to step 1", () => {
    render(<CreateAuctionPage />);
    fireEvent.click(screen.getByText("Continue →"));
    expect(screen.getByText("Auction Details")).toBeInTheDocument();
    fireEvent.click(screen.getByText("← Back"));
    expect(screen.getByText("Choose Auction Format")).toBeInTheDocument();
  });

  it("step 3 shows IPFS upload sections and summary", () => {
    render(<CreateAuctionPage />);
    fireEvent.click(screen.getByText("Continue →"));
    fireEvent.click(screen.getByText("Continue →"));
    expect(screen.getByText("Item Images & Metadata")).toBeInTheDocument();
    expect(screen.getByText("Upload Item Image")).toBeInTheDocument();
    expect(screen.getByText("Item Metadata")).toBeInTheDocument();
  });

  it("step 3 shows summary section", () => {
    render(<CreateAuctionPage />);
    fireEvent.click(screen.getByText("Continue →"));
    fireEvent.click(screen.getByText("Continue →"));
    expect(screen.getByText("Summary")).toBeInTheDocument();
  });

  it("step 3 Create Auction button is disabled until metadata uploaded", () => {
    render(<CreateAuctionPage />);
    fireEvent.click(screen.getByText("Continue →"));
    fireEvent.click(screen.getByText("Continue →"));
    // "Create Auction" matches both the page title (h1) and the button
    const buttons = screen.getAllByText("Create Auction");
    const submitBtn = buttons.find(b => b.closest("button"));
    expect(submitBtn?.closest("button")).toBeDisabled();
  });

  it("step 3 enables Create Auction after IPFS metadata upload", async () => {
    render(<CreateAuctionPage />);
    fireEvent.click(screen.getByText("Continue →"));
    fireEvent.click(screen.getByText("Continue →"));
    const uploadBtn = screen.getByTestId("trigger-upload-metadata");
    fireEvent.click(uploadBtn);
    await waitFor(() => {
      expect(screen.getByText("Metadata uploaded to IPFS")).toBeInTheDocument();
    });
    const buttons = screen.getAllByText("Create Auction");
    const submitBtn = buttons.find(b => b.closest("button"));
    expect(submitBtn?.closest("button")).not.toBeDisabled();
  });

  // ── Deeper tests ─────────────────────────────────────────────────────────

  it("step 2 shows royalty percentage calculation", () => {
    render(<CreateAuctionPage />);
    fireEvent.click(screen.getByText("Continue →"));
    // Default 500 bps = 5%
    expect(screen.getByText(/5% of every sale/)).toBeInTheDocument();
  });

  it("step 2 accepts form field values", () => {
    render(<CreateAuctionPage />);
    fireEvent.click(screen.getByText("Continue →"));

    // Reserve price placeholder is specific to reserve field
    const reserveLabel = screen.getByText("Reserve Price (stroops)");
    const reserveInput = reserveLabel.parentElement?.querySelector("input") as HTMLInputElement;
    fireEvent.change(reserveInput, { target: { value: "500000000" } });
    expect(reserveInput.value).toBe("500000000");

    // Duration defaults to 24
    const durationLabel = screen.getByText("Auction Duration (hours)");
    const durationInput = durationLabel.parentElement?.querySelector("input") as HTMLInputElement;
    expect(durationInput.value).toBe("24");
    fireEvent.change(durationInput, { target: { value: "48" } });
    expect(durationInput.value).toBe("48");
  });

  it("step 2 accepts creator address input", () => {
    render(<CreateAuctionPage />);
    fireEvent.click(screen.getByText("Continue →"));
    const creatorInput = screen.getByPlaceholderText("G...") as HTMLInputElement;
    fireEvent.change(creatorInput, { target: { value: "GCREATORADDRESS123" } });
    expect(creatorInput.value).toBe("GCREATORADDRESS123");
  });

  it("step 3 shows image CID after file upload", async () => {
    render(<CreateAuctionPage />);
    fireEvent.click(screen.getByText("Continue →"));
    fireEvent.click(screen.getByText("Continue →"));

    const imageBtn = screen.getByTestId("trigger-upload-file");
    fireEvent.click(imageBtn);

    await waitFor(() => {
      expect(screen.getByText(/Image CID:/)).toBeInTheDocument();
    });
  });

  it("step 3 navigates back to step 2", () => {
    render(<CreateAuctionPage />);
    fireEvent.click(screen.getByText("Continue →"));
    fireEvent.click(screen.getByText("Continue →"));
    expect(screen.getByText("Item Images & Metadata")).toBeInTheDocument();

    fireEvent.click(screen.getByText("← Back"));
    expect(screen.getByText("Auction Details")).toBeInTheDocument();
  });

  it("step 3 summary shows format and item type", () => {
    render(<CreateAuctionPage />);
    fireEvent.click(screen.getByText("Continue →"));
    fireEvent.click(screen.getByText("Continue →"));

    expect(screen.getByText("english")).toBeInTheDocument();
    expect(screen.getAllByText("Digital").length).toBeGreaterThanOrEqual(1);
  });

  it("step 3 summary shows duration in hours", () => {
    render(<CreateAuctionPage />);
    fireEvent.click(screen.getByText("Continue →"));
    fireEvent.click(screen.getByText("Continue →"));

    expect(screen.getByText("Duration:")).toBeInTheDocument();
  });

  it("step 1 defaults to English format selected", () => {
    render(<CreateAuctionPage />);
    const englishBtn = screen.getByText("English (Ascending)").closest("button");
    expect(englishBtn?.className).toContain("text-ochre-400");
  });

  it("shows custodian address field in step 2 for physical items", () => {
    render(<CreateAuctionPage />);
    fireEvent.click(screen.getByText(/Physical/));
    fireEvent.click(screen.getByText("Continue →"));
    // Custodian field has its own label
    expect(screen.getByText("Custodian Address (gallery/verifier)")).toBeInTheDocument();
  });
});
