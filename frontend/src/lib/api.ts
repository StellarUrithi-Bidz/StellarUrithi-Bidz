// API client for StellarUrithi-Bidz backend.
// When running server-side (SSR), uses Docker's internal network URL.
// When running client-side (browser), uses the public URL exposed to the host.

const API_URL =
  typeof window === "undefined"
    ? process.env.API_URL_INTERNAL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"
    : process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

async function fetchApi<T>(path: string, options?: RequestInit): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });

    if (!res.ok) {
      const errorBody = await res.json().catch(() => ({}));
      return {
        success: false,
        error: errorBody.error || `HTTP ${res.status}: ${res.statusText}`,
      };
    }

    return await res.json();
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}

// ── Auction endpoints ────────────────────────────────────────────────────────────

export interface AuctionItem {
  id: number;
  seller: string;
  original_creator: string;
  format: "english" | "dutch" | "sealed_bid";
  status: "created" | "active" | "ended" | "settled" | "cancelled";
  item_type: "digital" | "physical";
  nft_contract?: string;
  token_id?: number;
  custodian?: string;
  attestation_hash?: string;
  payment_token: string;
  reserve_price: string;
  royalty_bps: number;
  platform_fee_bps: number;
  start_time: number;
  end_time: number;
  commit_deadline?: number;
  reveal_deadline?: number;
  metadata_uri: string;
  min_increment?: string;
  start_price?: string;
  price_decay_per_second?: string;
  highest_bidder?: string;
  highest_bid: string;
  current_dutch_price?: string;
  attested: boolean;
  seller_proceeds?: string;
  royalty_amount?: string;
  platform_fee_amount?: string;
}

export interface BidItem {
  id: number;
  auction_id: number;
  bidder: string;
  amount: string;
  format: string;
  timestamp: number;
  is_winning: boolean;
  refunded: boolean;
  created_at: string;
}

export interface Analytics {
  total_auctions: number;
  total_volume: string;
  active_auctions: number;
  settled_auctions: number;
}

export async function getAuctions(params?: {
  status?: string;
  format?: string;
  seller?: string;
  limit?: number;
  offset?: number;
}): Promise<ApiResponse<AuctionItem[]>> {
  const query = new URLSearchParams();
  if (params?.status) query.set("status", params.status);
  if (params?.format) query.set("format", params.format);
  if (params?.seller) query.set("seller", params.seller);
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.offset) query.set("offset", String(params.offset));

  const qs = query.toString();
  return fetchApi<AuctionItem[]>(`/api${qs ? `?${qs}` : ""}`);
}

export async function getAuction(id: number): Promise<ApiResponse<AuctionItem>> {
  return fetchApi<AuctionItem>(`/api/${id}`);
}

export async function getBidsForAuction(auctionId: number): Promise<ApiResponse<BidItem[]>> {
  return fetchApi<BidItem[]>(`/api/${auctionId}/bids`);
}

export async function getBidHistory(bidder: string): Promise<ApiResponse<BidItem[]>> {
  return fetchApi<BidItem[]>(`/api/bids?bidder=${bidder}`);
}

export async function getAnalytics(): Promise<ApiResponse<Analytics>> {
  return fetchApi<Analytics>("/api/analytics");
}
