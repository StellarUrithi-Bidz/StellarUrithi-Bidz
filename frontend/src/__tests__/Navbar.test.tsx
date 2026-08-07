import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Navbar from "@/components/layout/Navbar";

const mockPathname = vi.fn(() => "/");
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname(),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: Record<string, unknown>) => (
    <a href={href as string} {...props}>
      {children as React.ReactNode}
    </a>
  ),
}));

const mockConnectWallet = vi.fn();
const mockDisconnectWallet = vi.fn();
const mockSignAuthMessage = vi.fn();

vi.mock("@/providers/wallet", () => ({
  useWallet: vi.fn(() => ({
    address: null,
    isConnected: false,
    isConnecting: false,
    connectWallet: mockConnectWallet,
    disconnectWallet: mockDisconnectWallet,
    signAuthMessage: mockSignAuthMessage,
    network: "testnet",
  })),
}));

vi.mock("@/lib/stellar", () => ({
  formatAddress: (addr: string) => addr.slice(0, 6) + "..." + addr.slice(-4),
  formatStroops: vi.fn(),
  formatTimeRemaining: vi.fn(),
  bpsToPercentage: vi.fn(),
  getContractId: vi.fn(() => "CD_TEST"),
  getNetworkPassphrase: vi.fn(),
  getRpcUrl: vi.fn(),
}));

vi.mock("lucide-react", () => ({
  Hammer: () => <span data-testid="icon-hammer" />,
  Menu: () => <span data-testid="icon-menu" />,
  X: () => <span data-testid="icon-x" />,
  History: () => <span data-testid="icon-history" />,
  PlusCircle: () => <span data-testid="icon-plus" />,
  Shield: () => <span data-testid="icon-shield" />,
  Gavel: () => <span data-testid="icon-gavel" />,
}));

import { useWallet } from "@/providers/wallet";

describe("Navbar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPathname.mockReturnValue("/");
    vi.mocked(useWallet).mockReturnValue({
      address: null,
      isConnected: false,
      isConnecting: false,
      connectWallet: mockConnectWallet,
      disconnectWallet: mockDisconnectWallet,
      signAuthMessage: mockSignAuthMessage,
      network: "testnet",
    });
  });

  it("renders the logo with UrithiBidz brand", () => {
    render(<Navbar />);
    expect(screen.getByText("Urithi")).toBeInTheDocument();
    expect(screen.getByText("Bidz")).toBeInTheDocument();
  });

  it("renders all nav links", () => {
    render(<Navbar />);
    expect(screen.getByText("Auctions")).toBeInTheDocument();
    expect(screen.getByText("Create")).toBeInTheDocument();
    expect(screen.getByText("My Bids")).toBeInTheDocument();
    expect(screen.getByText("Admin")).toBeInTheDocument();
  });

  it("highlights active link based on pathname", () => {
    mockPathname.mockReturnValue("/create");
    render(<Navbar />);
    const createLink = screen.getByText("Create").closest("a");
    expect(createLink?.className).toContain("text-ochre-400");
  });

  it("shows Connect Freighter button when not connected", () => {
    render(<Navbar />);
    expect(screen.getByText("Connect Freighter")).toBeInTheDocument();
  });

  it("calls connectWallet on button click", () => {
    render(<Navbar />);
    fireEvent.click(screen.getByText("Connect Freighter"));
    expect(mockConnectWallet).toHaveBeenCalled();
  });

  it("shows wallet address when connected", () => {
    vi.mocked(useWallet).mockReturnValue({
      address: "GABCDEF1234567890ABCDEF1234567890ABCDEF",
      isConnected: true,
      isConnecting: false,
      connectWallet: mockConnectWallet,
      disconnectWallet: mockDisconnectWallet,
      signAuthMessage: mockSignAuthMessage,
      network: "testnet",
    });

    render(<Navbar />);
    expect(screen.getByText(/GABCDE\.\.\.CDEF/)).toBeInTheDocument();
    expect(screen.getByText("Disconnect")).toBeInTheDocument();
  });

  it("calls disconnectWallet on Disconnect click", () => {
    vi.mocked(useWallet).mockReturnValue({
      address: "GABCDEF1234567890ABCDEF1234567890ABCDEF",
      isConnected: true,
      isConnecting: false,
      connectWallet: mockConnectWallet,
      disconnectWallet: mockDisconnectWallet,
      signAuthMessage: mockSignAuthMessage,
      network: "testnet",
    });

    render(<Navbar />);
    fireEvent.click(screen.getByText("Disconnect"));
    expect(mockDisconnectWallet).toHaveBeenCalled();
  });

  it("shows connecting state when isConnecting", () => {
    vi.mocked(useWallet).mockReturnValue({
      address: null,
      isConnected: false,
      isConnecting: true,
      connectWallet: mockConnectWallet,
      disconnectWallet: mockDisconnectWallet,
      signAuthMessage: mockSignAuthMessage,
      network: "testnet",
    });

    render(<Navbar />);
    expect(screen.getByText("Connecting...")).toBeInTheDocument();
  });

  it("toggles mobile menu on hamburger click", () => {
    render(<Navbar />);
    const hamburger = screen.getByTestId("icon-menu").closest("button")!;

    // Mobile menu not visible initially
    // After clicking hamburger, mobile links appear as duplicate nav items
    fireEvent.click(hamburger);
    const auctionLinks = screen.getAllByText("Auctions");
    expect(auctionLinks.length).toBeGreaterThanOrEqual(2);
  });
});
