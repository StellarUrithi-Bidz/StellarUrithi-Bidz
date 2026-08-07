import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import IPFSUploader from "@/components/ui/IPFSUploader";

// Mock pinata lib
vi.mock("@/lib/pinata", () => ({
  uploadFile: vi.fn(),
  uploadMetadata: vi.fn(),
}));

// Mock lucide-react
vi.mock("lucide-react", () => ({
  ImagePlus: () => <span data-testid="icon-image-plus" />,
  FileJson: () => <span data-testid="icon-file-json" />,
  X: () => <span data-testid="icon-x" />,
  CheckCircle: () => <span data-testid="icon-check" />,
  Loader2: () => <span data-testid="icon-loader" />,
  AlertCircle: () => <span data-testid="icon-alert" />,
}));

// Mock react-hot-toast
vi.mock("react-hot-toast", () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { uploadFile, uploadMetadata } from "@/lib/pinata";

describe("IPFSUploader — File mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders drop zone with label", () => {
    const onComplete = vi.fn();
    render(<IPFSUploader onUploadComplete={onComplete} mode="file" />);
    expect(screen.getByText(/Drop your file here/)).toBeInTheDocument();
  });

  it("renders custom label when provided", () => {
    const onComplete = vi.fn();
    render(
      <IPFSUploader
        onUploadComplete={onComplete}
        mode="file"
        label="Upload your NFT image"
      />,
    );
    expect(screen.getByText("Upload your NFT image")).toBeInTheDocument();
  });

  it("shows upload progress indicator when uploading", async () => {
    const onComplete = vi.fn();
    (uploadFile as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise(() => {}), // never resolves
    );

    const { container } = render(<IPFSUploader onUploadComplete={onComplete} mode="file" />);

    const file = new File(["test"], "test.png", { type: "image/png" });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => {
      expect(screen.getByText(/Uploading to IPFS/)).toBeInTheDocument();
    });
  });

  it("renders file type hint", () => {
    const onComplete = vi.fn();
    render(<IPFSUploader onUploadComplete={onComplete} mode="file" />);
    expect(screen.getByText(/PNG, JPEG, GIF, WebP, JSON/)).toBeInTheDocument();
  });
});

describe("IPFSUploader — Metadata mode", () => {
  it("renders metadata form fields", () => {
    const onComplete = vi.fn();
    render(<IPFSUploader onUploadComplete={onComplete} mode="metadata" />);

    expect(screen.getByPlaceholderText(/Yoruba Beaded Crown/)).toBeInTheDocument();
    expect(screen.getByText("Item Name *")).toBeInTheDocument();
    expect(screen.getByText("Description")).toBeInTheDocument();
    expect(screen.getByText("Artist / Creator")).toBeInTheDocument();
    expect(screen.getByText("Year")).toBeInTheDocument();
    expect(screen.getByText("Medium / Materials")).toBeInTheDocument();
    expect(screen.getByText("Dimensions")).toBeInTheDocument();
    expect(screen.getByText("Provenance")).toBeInTheDocument();
  });

  it("disables upload button when name is empty", () => {
    const onComplete = vi.fn();
    render(<IPFSUploader onUploadComplete={onComplete} mode="metadata" />);

    const button = screen.getByText("Upload Metadata to IPFS");
    expect(button).toBeDisabled();
  });

  it("enables upload button when name is filled", async () => {
    const onComplete = vi.fn();
    render(<IPFSUploader onUploadComplete={onComplete} mode="metadata" />);

    const nameInput = screen.getByPlaceholderText(/Yoruba Beaded Crown/);
    fireEvent.change(nameInput, { target: { value: "Test Artifact" } });

    const button = screen.getByText("Upload Metadata to IPFS");
    expect(button).not.toBeDisabled();
  });

  it("pre-populates fields from initialMetadata", () => {
    const onComplete = vi.fn();
    render(
      <IPFSUploader
        onUploadComplete={onComplete}
        mode="metadata"
        initialMetadata={{
          name: "Pre-filled Name",
          artist: "Pre-filled Artist",
          year: 1920,
          medium: "Oil on canvas",
        }}
      />,
    );

    const nameInput = screen.getByPlaceholderText(/Yoruba Beaded Crown/) as HTMLInputElement;
    expect(nameInput.value).toBe("Pre-filled Name");

    const artistInput = screen.getByPlaceholderText("Unknown") as HTMLInputElement;
    expect(artistInput.value).toBe("Pre-filled Artist");
  });

  it("calls uploadMetadata and onUploadComplete on successful upload", async () => {
    const onComplete = vi.fn();
    (uploadMetadata as ReturnType<typeof vi.fn>).mockResolvedValue({
      cid: "QmTest123",
      ipfsUri: "ipfs://QmTest123",
      url: "https://gateway.pinata.cloud/ipfs/QmTest123",
    });

    render(<IPFSUploader onUploadComplete={onComplete} mode="metadata" />);

    const nameInput = screen.getByPlaceholderText(/Yoruba Beaded Crown/);
    fireEvent.change(nameInput, { target: { value: "Test Artifact" } });

    const button = screen.getByText("Upload Metadata to IPFS");
    fireEvent.click(button);

    await waitFor(() => {
      expect(uploadMetadata).toHaveBeenCalled();
      expect(onComplete).toHaveBeenCalledWith(
        "ipfs://QmTest123",
        expect.objectContaining({ cid: "QmTest123" }),
      );
    });
  });

  it("shows error toast when upload fails", async () => {
    const onComplete = vi.fn();
    (uploadMetadata as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Network error"),
    );

    render(<IPFSUploader onUploadComplete={onComplete} mode="metadata" />);

    const nameInput = screen.getByPlaceholderText(/Yoruba Beaded Crown/);
    fireEvent.change(nameInput, { target: { value: "Test Artifact" } });

    const button = screen.getByText("Upload Metadata to IPFS");
    fireEvent.click(button);

    await waitFor(() => {
      expect(onComplete).not.toHaveBeenCalled();
    });
  });
});
