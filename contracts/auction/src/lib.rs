//! StellarUrithi-Bidz Auction Contract
//!
//! An on-chain auction protocol for African art and cultural artifacts on Stellar.
//! Supports English (ascending), Dutch (descending), and Sealed-Bid auction formats
//! with on-chain escrow and automatic royalty distribution.
//!
//! # Architecture
//! - `types.rs`: All shared data structures, enums, and storage keys.
//! - `english.rs`: English auction bid logic (ascending price).
//! - `dutch.rs`: Dutch auction buy-now logic (descending price).
//! - `sealed_bid.rs`: Sealed-bid commit-reveal logic.
//! - `escrow.rs`: Bid fund locking and refunding.
//! - `royalty.rs`: Proceeds splitting (seller + creator + platform).
//! - `events.rs`: Event emission for off-chain indexing.
//!
//! # Usage
//! 1. Seller calls `create_auction(...)` to list an item.
//! 2. For physical items, custodian calls `attest_physical_item(...)`.
//! 3. Bidders place bids via `place_bid` (English), `buy_now` (Dutch),
//!    or `commit_bid`/`reveal_bid` (Sealed-Bid).
//! 4. Anyone calls `close_auction(...)` after the auction ends.
//! 5. Anyone calls `settle_auction(...)` to distribute proceeds.

#![no_std]

mod dutch;
mod english;
mod escrow;
mod events;
mod royalty;
mod sealed_bid;
mod types;

use soroban_sdk::{contract, contractimpl, token, Address, BytesN, Env, String};

use types::{
    Auction, AuctionFormat, AuctionStatus, AuctionStatus::*, ItemType, PlatformConfig,
    StorageKey, StorageKey::*,
};

// ── Contract ─────────────────────────────────────────────────────────────────────

#[contract]
pub struct UrithiAuction;

#[contractimpl]
impl UrithiAuction {
    // =========================================================================
    //  Initialization
    // =========================================================================

    /// Initialize the platform configuration. Called once by the admin.
    pub fn initialize(
        env: Env,
        admin: Address,
        default_platform_fee_bps: u32,
        max_royalty_bps: u32,
        platform_wallet: Address,
    ) {
        admin.require_auth();

        assert!(
            env.storage()
                .instance()
                .get::<_, PlatformConfig>(&Config)
                .is_none(),
            "Already initialized"
        );

        let config = PlatformConfig {
            admin: admin.clone(),
            default_platform_fee_bps,
            max_royalty_bps,
            paused: false,
        };

        env.storage().instance().set(&Config, &config);
        env.storage()
            .instance()
            .set(&AuctionCount, &0u64);

        // Store platform wallet address — used for fee distribution.
        // We store it separately from Config to keep Config compact.
        env.storage()
            .instance()
            .set(&symbol_short!("platform_wallet"), &platform_wallet);
    }

    // =========================================================================
    //  Auction Lifecycle
    // =========================================================================

    /// Create a new auction listing.
    ///
    /// # Arguments
    /// - `seller`: The address listing the item.
    /// - `original_creator`: Creator entitled to royalties.
    /// - `format`: English, Dutch, or SealedBid.
    /// - `item`: Digital NFT or Physical item with custodian.
    /// - `payment_token`: Token used for bidding (e.g., native XLM or USDC).
    /// - `reserve_price`: Minimum acceptable bid.
    /// - `royalty_bps`: Creator royalty in basis points.
    /// - `start_time`: When bidding opens (ledger timestamp).
    /// - `end_time`: When bidding closes (English/Dutch) or reveal ends (SealedBid).
    /// - `metadata_uri`: IPFS CID for item metadata.
    /// - Additional format-specific parameters.
    pub fn create_auction(
        env: Env,
        seller: Address,
        original_creator: Address,
        format: AuctionFormat,
        item: ItemType,
        payment_token: Address,
        reserve_price: i128,
        royalty_bps: u32,
        start_time: u64,
        end_time: u64,
        metadata_uri: String,
        // English-specific
        min_increment: i128,
        // Dutch-specific
        start_price: i128,
        price_decay_per_second: i128,
        // Sealed-bid-specific
        commit_deadline: u64,
        reveal_deadline: u64,
        max_bidders: u64,
    ) -> u64 {
        seller.require_auth();

        let config: PlatformConfig = env
            .storage()
            .instance()
            .get(&Config)
            .unwrap_or_else(|| panic!("Not initialized"));
        assert!(!config.paused, "Platform is paused");

        // Validate royalty
        assert!(
            royalty_bps <= config.max_royalty_bps,
            "Royalty exceeds maximum allowed"
        );

        // Validate times
        assert!(start_time < end_time, "Invalid time range");

        // Validate format-specific parameters
        match &format {
            AuctionFormat::English => {
                assert!(min_increment > 0, "Min increment must be positive");
            }
            AuctionFormat::Dutch => {
                assert!(
                    start_price > reserve_price,
                    "Start price must exceed reserve"
                );
                assert!(price_decay_per_second > 0, "Decay must be positive");
            }
            AuctionFormat::SealedBid => {
                assert!(
                    start_time < commit_deadline,
                    "Commit deadline after start"
                );
                assert!(
                    commit_deadline < reveal_deadline,
                    "Reveal deadline after commit"
                );
                assert!(reveal_deadline <= end_time, "Reveal deadline mismatch");
            }
        }

        // Physical items must have a custodian
        if let ItemType::Physical { .. } = &item {
            // Attestation happens separately; we allow creation without attestation
            // but the auction can't become Active until attested.
        }

        // ── Assign auction ID ────────────────────────────────────────────
        let mut count: u64 = env.storage().instance().get(&AuctionCount).unwrap_or(0);
        let auction_id = count;
        count += 1;
        env.storage().instance().set(&AuctionCount, &count);

        let auction = Auction {
            id: auction_id,
            seller: seller.clone(),
            original_creator: original_creator.clone(),
            format: format.clone(),
            status: Created,
            item,
            payment_token,
            reserve_price,
            royalty_bps,
            platform_fee_bps: config.default_platform_fee_bps,
            start_time,
            end_time,
            metadata_uri: metadata_uri.clone(),
            highest_bidder: None,
            highest_bid: 0,
            min_increment,
            start_price,
            current_dutch_price: start_price,
            price_decay_per_second,
            commit_deadline,
            reveal_deadline,
            max_bidders,
            bidder_count: 0,
            revealed_bids: soroban_sdk::Vec::new(&env),
            attested: false,
        };

        env.storage()
            .instance()
            .set(&Auction(auction_id), &auction);

        events::emit_auction_created(
            &env,
            auction_id,
            &seller,
            &format,
            reserve_price,
            end_time,
            &metadata_uri,
        );

        auction_id
    }

    /// Activate an auction so bidding can begin.
    /// For physical items, attests that the custodian has verified possession.
    pub fn attest_physical_item(
        env: Env,
        auction_id: u64,
        custodian: Address,
        attestation_hash: BytesN<32>,
    ) {
        custodian.require_auth();

        let mut auction: Auction = env
            .storage()
            .instance()
            .get(&Auction(auction_id))
            .unwrap_or_else(|| panic!("Auction not found"));

        // Verify this is a physical item and the caller is the designated custodian
        match &auction.item {
            ItemType::Physical {
                custodian: designated_custodian,
                ..
            } => {
                assert!(
                    custodian == *designated_custodian,
                    "Not the designated custodian"
                );
            }
            _ => panic!("Not a physical item"),
        }

        // Update the attestation hash
        auction.item = ItemType::Physical {
            custodian,
            attestation_hash,
        };
        auction.attested = true;
        auction.status = Active;

        env.storage()
            .instance()
            .set(&Auction(auction_id), &auction);

        events::emit_attestation_recorded(&env, auction_id, &custodian);
    }

    /// Activate a digital auction (no attestation needed).
    pub fn activate_auction(env: Env, auction_id: u64) {
        let mut auction: Auction = env
            .storage()
            .instance()
            .get(&Auction(auction_id))
            .unwrap_or_else(|| panic!("Auction not found"));

        // Only the seller can activate
        auction.seller.require_auth();

        // Digital items can be activated directly
        match &auction.item {
            ItemType::Digital { .. } => {}
            ItemType::Physical { .. } => {
                assert!(auction.attested, "Physical item not yet attested");
            }
        }

        assert!(auction.status == Created, "Auction not in Created state");
        auction.status = Active;

        let now = env.ledger().timestamp();
        assert!(now >= auction.start_time, "Cannot activate before start time");

        env.storage()
            .instance()
            .set(&Auction(auction_id), &auction);
    }

    /// Cancel an auction before any bids are placed. Only the seller can cancel.
    pub fn cancel_auction(env: Env, auction_id: u64) {
        let mut auction: Auction = env
            .storage()
            .instance()
            .get(&Auction(auction_id))
            .unwrap_or_else(|| panic!("Auction not found"));

        auction.seller.require_auth();

        assert!(
            auction.status == Created || auction.status == Active,
            "Cannot cancel auction in current state"
        );

        // Cannot cancel if bids have been placed
        assert!(auction.highest_bidder.is_none(), "Bids already placed");

        auction.status = Cancelled;
        env.storage()
            .instance()
            .set(&Auction(auction_id), &auction);

        events::emit_auction_cancelled(&env, auction_id, &auction.seller);
    }

    // =========================================================================
    //  Bidding — English
    // =========================================================================

    /// Place a bid on an English auction.
    /// Previous highest bidder is automatically refunded.
    pub fn place_bid(env: Env, auction_id: u64, bidder: Address, bid_amount: i128) {
        english::place_bid(&env, auction_id, &bidder, bid_amount);
    }

    // =========================================================================
    //  Bidding — Dutch
    // =========================================================================

    /// Buy at the current descending price in a Dutch auction.
    pub fn buy_now(env: Env, auction_id: u64, buyer: Address) {
        dutch::buy_now(&env, auction_id, &buyer);
    }

    /// Query the current price for a Dutch auction (read-only, no state change).
    pub fn get_dutch_price(env: Env, auction_id: u64) -> i128 {
        let auction: Auction = env
            .storage()
            .instance()
            .get(&Auction(auction_id))
            .unwrap_or_else(|| panic!("Auction not found"));
        dutch::get_current_price(&env, &auction)
    }

    // =========================================================================
    //  Bidding — Sealed-Bid
    // =========================================================================

    /// Submit a sealed-bid commitment.
    pub fn commit_bid(
        env: Env,
        auction_id: u64,
        bidder: Address,
        commitment: BytesN<32>,
        bid_amount: i128,
    ) {
        sealed_bid::commit_bid(&env, auction_id, &bidder, commitment, bid_amount);
    }

    /// Reveal a sealed bid during the reveal phase.
    pub fn reveal_bid(
        env: Env,
        auction_id: u64,
        bidder: Address,
        bid_amount: i128,
        salt: BytesN<32>,
    ) {
        sealed_bid::reveal_bid(&env, auction_id, &bidder, bid_amount, salt);
    }

    /// Refund an unrevealed sealed bid after the reveal deadline.
    /// Protects bidders who lost their salt or had connectivity issues.
    pub fn refund_unrevealed(env: Env, auction_id: u64, bidder: Address) {
        sealed_bid::refund_unrevealed(&env, auction_id, &bidder);
    }

    // =========================================================================
    //  Auction Close & Settlement
    // =========================================================================

    /// Close an auction after the end time. Can be called by anyone.
    /// For English auctions: records the highest bidder as winner.
    /// For sealed-bid auctions: delegates to finalize_sealed_auction.
    pub fn close_auction(env: Env, auction_id: u64) {
        let mut auction: Auction = env
            .storage()
            .instance()
            .get(&Auction(auction_id))
            .unwrap_or_else(|| panic!("Auction not found"));

        // Already handled for Dutch (buy_now closes) and sealed-bid (finalize)
        if auction.status == Ended || auction.status == Settled {
            return;
        }

        assert!(auction.status == Active, "Auction not active");

        let now = env.ledger().timestamp();

        match auction.format {
            AuctionFormat::English => {
                assert!(now >= auction.end_time, "Auction not yet ended");
                if let Some(ref winner) = auction.highest_bidder.clone() {
                    auction.status = Ended;
                    events::emit_auction_closed(
                        &env,
                        auction_id,
                        winner,
                        auction.highest_bid,
                        &AuctionFormat::English,
                    );
                } else {
                    auction.status = Cancelled;
                    events::emit_auction_cancelled(&env, auction_id, &auction.seller);
                }
            }
            AuctionFormat::Dutch => {
                // Dutch closes via buy_now; if it expires without a buy, cancel.
                assert!(now >= auction.end_time, "Auction not yet ended");
                auction.status = Cancelled;
                events::emit_auction_cancelled(&env, auction_id, &auction.seller);
            }
            AuctionFormat::SealedBid => {
                // Delegate to sealed-bid finalization
                sealed_bid::finalize_sealed_auction(&env, auction_id);
                return; // finalize handles its own storage updates
            }
        }

        env.storage()
            .instance()
            .set(&Auction(auction_id), &auction);
    }

    /// Settle a closed auction: transfer NFT to winner, distribute proceeds to seller,
    /// creator, and platform.
    /// Should be called after close_auction (or buy_now for Dutch).
    pub fn settle_auction(env: Env, auction_id: u64) {
        let mut auction: Auction = env
            .storage()
            .instance()
            .get(&Auction(auction_id))
            .unwrap_or_else(|| panic!("Auction not found"));

        assert!(auction.status == Ended, "Auction not in Ended state");

        let winner = auction
            .highest_bidder
            .clone()
            .unwrap_or_else(|| panic!("No winner"));

        // ── Transfer NFT ownership to winner ──────────────────────────────────
        // For digital items: call the NFT contract to transfer ownership.
        // This atomically happens alongside payment distribution.
        match &auction.item {
            ItemType::Digital { nft_contract, token_id } => {
                // Call the SEP-41 NFT contract: xfer(from: seller, to: winner, token_id: token_id)
                // The auction contract acts as custodian; the seller must have pre-approved
                // the auction contract to transfer the NFT on their behalf, or the NFT
                // must already be held by this contract.
                let nft_client = token::Client::new(&env, nft_contract);
                nft_client.transfer(
                    &auction.seller,
                    &winner,
                    &(*token_id as i128),
                );
            }
            ItemType::Physical { .. } => {
                // Physical items: the attestation serves as the ownership record.
                // The custodian handles off-chain delivery separately.
            }
        }

        let platform_wallet: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("platform_wallet"))
            .unwrap_or_else(|| panic!("Platform wallet not configured"));

        // Calculate royalty split
        let breakdown = royalty::calculate_split(
            auction.highest_bid,
            auction.royalty_bps,
            auction.platform_fee_bps,
        );

        // Distribute proceeds from escrow
        royalty::distribute_proceeds(
            &env,
            &auction.payment_token,
            &auction.seller,
            &auction.original_creator,
            &platform_wallet,
            &breakdown,
        );

        auction.status = Settled;
        env.storage()
            .instance()
            .set(&Auction(auction_id), &auction);

        events::emit_auction_settled(
            &env,
            auction_id,
            breakdown.seller_amount,
            breakdown.royalty_amount,
            breakdown.platform_fee_amount,
        );
    }

    // =========================================================================
    //  Admin Functions
    // =========================================================================

    /// Update platform configuration. Admin only.
    pub fn update_config(
        env: Env,
        admin: Address,
        new_fee_bps: Option<u32>,
        new_max_royalty_bps: Option<u32>,
        paused: Option<bool>,
    ) {
        admin.require_auth();

        let mut config: PlatformConfig = env
            .storage()
            .instance()
            .get(&Config)
            .unwrap_or_else(|| panic!("Not initialized"));

        assert!(admin == config.admin, "Not the admin");

        if let Some(fee) = new_fee_bps {
            config.default_platform_fee_bps = fee;
        }
        if let Some(max_royalty) = new_max_royalty_bps {
            config.max_royalty_bps = max_royalty;
        }
        if let Some(is_paused) = paused {
            config.paused = is_paused;
        }

        env.storage().instance().set(&Config, &config);
    }

    // =========================================================================
    //  Query Functions (read-only)
    // =========================================================================

    /// Fetch auction details by ID.
    pub fn get_auction(env: Env, auction_id: u64) -> Auction {
        env.storage()
            .instance()
            .get(&Auction(auction_id))
            .unwrap_or_else(|| panic!("Auction not found"))
    }

    /// Get the total number of auctions created.
    pub fn get_auction_count(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&AuctionCount)
            .unwrap_or(0)
    }

    /// Check if the platform is paused.
    pub fn is_paused(env: Env) -> bool {
        env.storage()
            .instance()
            .get::<_, PlatformConfig>(&Config)
            .map(|c| c.paused)
            .unwrap_or(true)
    }
}


