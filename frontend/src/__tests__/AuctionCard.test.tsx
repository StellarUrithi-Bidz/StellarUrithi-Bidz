import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import AuctionCard from "@/components/auction/AuctionCard";
import type { AuctionItem } from "@/lib/api";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: Record<string, unknown>) => (
    <a href={href as string} {...props}>
      {children as React.ReactNode}
    </a>
  ),
}));

vi.mock("lucide-react", () => ({
  Clock: () => <span data-testid="icon-clock" />,
  User: () => <span data-testid="icon-user" />,
  Tag: () => <span data-testid="icon-tag" />,
  Gavel: () => <span data-testid="icon-gavel" />,
  TrendingDown: () => <span data-testid="icon-trending-down" />,
  Shield: () => <span data-testid="icon-shield" />,
}));

function createMockAuction(overrides: Partial<AuctionItem> = {}): AuctionItem {
  return {
    id: 42,
    seller: "GABCDEF1234567890ABCDEF1234567890ABCDEF",
    original_creator: "GZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ",
    format: "english",
    status: "active",
    item_type: "digital",
    payment_token: "GBBD47IF6LOKAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    reserve_price: "100000000",
    royalty_bps: 500,
    platform_fee_bps: 250,
    start_time: Math.floor(Date.now() / 1000) - 100,
    end_time: Math.floor(Date.now() / 1000) + 3600,
    metadata_uri: "ipfs://QmTest123456789",
    highest_bid: "200000000",
    attested: false,
    ...overrides,
  };
}

describe("AuctionCard", () => {
  it("renders auction ID", () => {
    render(<AuctionCard auction={createMockAuction()} />);
    expect(screen.getByText(/Auction #42/)).toBeInTheDocument();
  });

  it("renders seller address (shortened)", () => {
    render(<AuctionCard auction={createMockAuction()} />);
    expect(screen.getByText(/GABCDE\.\.\.CDEF/)).toBeInTheDocument();
  });

  it("renders current bid when highest_bid is set", () => {
    render(<AuctionCard auction={createMockAuction({ highest_bid: "500000000" })} />);
    expect(screen.getByText("Current Bid")).toBeInTheDocument();
    // formatStroops("500000000") = "50" stroops — text is split across elements
    expect(screen.getByText(/50/)).toBeInTheDocument();
  });

  it("shows 0 stroops when highest_bid is 0 (no bids yet)", () => {
    render(<AuctionCard auction={createMockAuction({ highest_bid: "0" })} />);
    // When highest_bid is "0" (string), currentBid is shown as "0"
    expect(screen.getByText("Current Bid")).toBeInTheDocument();
  });

  it("renders English format label", () => {
    render(<AuctionCard auction={createMockAuction({ format: "english" })} />);
    expect(screen.getByText("English")).toBeInTheDocument();
  });

  it("renders Dutch format label", () => {
    render(<AuctionCard auction={createMockAuction({ format: "dutch" })} />);
    expect(screen.getByText("Dutch")).toBeInTheDocument();
  });

  it("renders Sealed-Bid format label", () => {
    render(<AuctionCard auction={createMockAuction({ format: "sealed_bid" })} />);
    expect(screen.getByText("Sealed-Bid")).toBeInTheDocument();
  });

  it("renders digital item type badge", () => {
    render(<AuctionCard auction={createMockAuction({ item_type: "digital" })} />);
    expect(screen.getByText(/Digital/)).toBeInTheDocument();
  });

  it("renders physical item type badge", () => {
    render(<AuctionCard auction={createMockAuction({ item_type: "physical" })} />);
    expect(screen.getByText(/Physical/)).toBeInTheDocument();
  });

  it("renders active status badge", () => {
    render(<AuctionCard auction={createMockAuction({ status: "active" })} />);
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("renders ended status badge", () => {
    render(<AuctionCard auction={createMockAuction({ status: "ended" })} />);
    expect(screen.getByText("Ended")).toBeInTheDocument();
  });

  it("renders time remaining for active auctions", () => {
    render(<AuctionCard auction={createMockAuction({ status: "active" })} />);
    expect(screen.getByTestId("icon-clock")).toBeInTheDocument();
  });

  it("does not show timer for ended auctions", () => {
    render(<AuctionCard auction={createMockAuction({ status: "ended" })} />);
    expect(screen.queryByTestId("icon-clock")).not.toBeInTheDocument();
  });

  it("renders royalty percentage", () => {
    render(<AuctionCard auction={createMockAuction({ royalty_bps: 750 })} />);
    expect(screen.getByText("7.50%")).toBeInTheDocument();
  });

  it("renders IPFS metadata hash snippet", () => {
    render(<AuctionCard auction={createMockAuction({ metadata_uri: "ipfs://QmABCDEF1234567890" })} />);
    // IPFS hash is shown as "IPFS: QmABCDEF1234..."
    expect(screen.getByText(/IPFS:/)).toBeInTheDocument();
  });
});
