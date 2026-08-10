import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import CustodianPortal from "../app/page";

vi.mock("@stellar/freighter-api", () => ({
  isConnected: vi.fn(), getAddress: vi.fn(),
  requestAccess: vi.fn(), setAllowed: vi.fn(),
}));

vi.mock("lucide-react", () => ({
  default: () => null,
  Shield: () => <span data-testid="icon-shield"/>,
  CheckCircle: () => <span data-testid="icon-check"/>,
  Clock: () => <span data-testid="icon-clock"/>,
  FileCheck: () => <span data-testid="icon-file"/>,
  Loader2: () => <span data-testid="icon-loader"/>,
  AlertTriangle: () => <span data-testid="icon-alert"/>,
  Link: () => <span data-testid="icon-link"/>,
  ImagePlus: () => <span data-testid="icon-image"/>,
  X: () => <span data-testid="icon-x"/>,
}));

import { requestAccess, getAddress } from "@stellar/freighter-api";

describe("CustodianPortal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requestAccess).mockResolvedValue({} as any);
    vi.mocked(getAddress).mockResolvedValue({ address: "GABCDEF1234567890ABCDEF1234567890ABCDEF" } as any);
  });

  it("renders connect prompt", () => {
    render(<CustodianPortal />);
    expect(screen.getByText("Custodian Portal")).toBeInTheDocument();
    expect(screen.getByText("Connect Custodian Wallet")).toBeInTheDocument();
  });

  it("connects wallet on button click", async () => {
    render(<CustodianPortal />);
    fireEvent.click(screen.getByText("Connect Custodian Wallet"));
    await waitFor(() => {
      expect(requestAccess).toHaveBeenCalled();
    });
  });

  it("shows pending attestations after connect", async () => {
    render(<CustodianPortal />);
    fireEvent.click(screen.getByText("Connect Custodian Wallet"));
    await waitFor(() => {
      expect(screen.getByText("Pending Attestations")).toBeInTheDocument();
    });
  });

  it("shows upload drop zone", async () => {
    render(<CustodianPortal />);
    fireEvent.click(screen.getByText("Connect Custodian Wallet"));
    await waitFor(() => {
      expect(screen.getByText(/Click to upload attestation document/)).toBeInTheDocument();
    });
  });

  it("shows completed attestations section", async () => {
    render(<CustodianPortal />);
    fireEvent.click(screen.getByText("Connect Custodian Wallet"));
    await waitFor(() => {
      expect(screen.getByText("Completed Attestations")).toBeInTheDocument();
    });
  });

  it("shows address after connect", async () => {
    render(<CustodianPortal />);
    fireEvent.click(screen.getByText("Connect Custodian Wallet"));
    await waitFor(() => {
      expect(screen.getByText("GABCDEF...")).toBeInTheDocument();
    });
  });
});
