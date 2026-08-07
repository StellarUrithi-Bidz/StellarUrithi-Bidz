//! StellarUrithi-Bidz Auction Contract
//!
//! An on-chain auction protocol for African art and cultural artifacts on Stellar.
//! Supports English (ascending), Dutch (descending), and Sealed-Bid auction formats
//! with on-chain escrow and automatic royalty distribution.

#![no_std]

mod dutch;
mod english;
mod escrow;
mod events;
mod royalty;
mod sealed_bid;
mod types;
#[cfg(test)]
mod test;

use soroban_sdk::{contract, contractimpl, token, Address, BytesN, Env};

use types::{
    Auction, AuctionFormat, AuctionStatus::*, CreateAuctionParams,
    ItemType, PhysicalItem, PlatformConfig, StorageKey::*,
};

#[contract]
pub struct UrithiAuction;

#[contractimpl]
impl UrithiAuction {
    // =========================================================================
    //  Initialization
    // =========================================================================

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
        env.storage().instance().set(&AuctionCount, &0u64);
        env.storage().instance().set(&PlatformWallet, &platform_wallet);
    }

    // =========================================================================
    //  Auction Lifecycle
    // =========================================================================

    /// Create a new auction listing. Uses CreateAuctionParams struct to stay
    /// within soroban-sdk's 10-parameter contract function limit.
    pub fn create_auction(env: Env, params: CreateAuctionParams) -> u64 {
        params.seller.require_auth();

        let config: PlatformConfig = env
            .storage()
            .instance()
            .get(&Config)
            .unwrap_or_else(|| panic!("Not initialized"));
        assert!(!config.paused, "Platform is paused");

        assert!(
            params.royalty_bps <= config.max_royalty_bps,
            "Royalty exceeds maximum allowed"
        );
        assert!(params.start_time < params.end_time, "Invalid time range");

        match &params.format {
            AuctionFormat::English => {
                assert!(params.min_increment > 0, "Min increment must be positive");
            }
            AuctionFormat::Dutch => {
                assert!(params.start_price > params.reserve_price, "Start price must exceed reserve");
                assert!(params.price_decay_per_second > 0, "Decay must be positive");
            }
            AuctionFormat::SealedBid => {
                assert!(params.start_time < params.commit_deadline, "Commit deadline after start");
                assert!(params.commit_deadline < params.reveal_deadline, "Reveal deadline after commit");
                assert!(params.reveal_deadline <= params.end_time, "Reveal deadline mismatch");
            }
        }

        let mut count: u64 = env.storage().instance().get(&AuctionCount).unwrap_or(0);
        let auction_id = count;
        count += 1;
        env.storage().instance().set(&AuctionCount, &count);

        let auction = Auction {
            id: auction_id,
            seller: params.seller.clone(),
            original_creator: params.original_creator.clone(),
            format: params.format.clone(),
            status: Created,
            item: params.item,
            payment_token: params.payment_token,
            reserve_price: params.reserve_price,
            royalty_bps: params.royalty_bps,
            platform_fee_bps: config.default_platform_fee_bps,
            start_time: params.start_time,
            end_time: params.end_time,
            metadata_uri: params.metadata_uri.clone(),
            highest_bidder: None,
            highest_bid: 0,
            min_increment: params.min_increment,
            start_price: params.start_price,
            current_dutch_price: params.start_price,
            price_decay_per_second: params.price_decay_per_second,
            commit_deadline: params.commit_deadline,
            reveal_deadline: params.reveal_deadline,
            max_bidders: params.max_bidders,
            bidder_count: 0,
            revealed_bids: soroban_sdk::Vec::new(&env),
            attested: false,
        };

        env.storage().instance().set(&Auction(auction_id), &auction);

        events::emit_auction_created(
            &env, auction_id, &params.seller, &params.format,
            params.reserve_price, params.end_time, &params.metadata_uri,
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

        match &auction.item {
            ItemType::Physical(item) => {
                assert!(custodian == item.custodian, "Not the designated custodian");
            }
            _ => panic!("Not a physical item"),
        }

        auction.item = ItemType::Physical(PhysicalItem {
            custodian: custodian.clone(),
            attestation_hash,
        });
        auction.attested = true;
        auction.status = Active;

        env.storage().instance().set(&Auction(auction_id), &auction);
        events::emit_attestation_recorded(&env, auction_id, &custodian);
    }

    /// Activate a digital auction (no attestation needed).
    pub fn activate_auction(env: Env, auction_id: u64) {
        let mut auction: Auction = env
            .storage()
            .instance()
            .get(&Auction(auction_id))
            .unwrap_or_else(|| panic!("Auction not found"));

        auction.seller.require_auth();

        match &auction.item {
            ItemType::Digital(_) => {}
            ItemType::Physical(_) => {
                assert!(auction.attested, "Physical item not yet attested");
            }
        }

        assert!(auction.status == Created, "Auction not in Created state");
        auction.status = Active;

        let now = env.ledger().timestamp();
        assert!(now >= auction.start_time, "Cannot activate before start time");

        env.storage().instance().set(&Auction(auction_id), &auction);
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
        assert!(auction.highest_bidder.is_none(), "Bids already placed");

        auction.status = Cancelled;
        env.storage().instance().set(&Auction(auction_id), &auction);
        events::emit_auction_cancelled(&env, auction_id, &auction.seller);
    }

    /// Approve the auction contract to transfer a digital NFT on the seller's behalf.
    pub fn approve_nft_transfer(env: Env, auction_id: u64) {
        let auction: Auction = env
            .storage()
            .instance()
            .get(&Auction(auction_id))
            .unwrap_or_else(|| panic!("Auction not found"));

        auction.seller.require_auth();

        let digital = match &auction.item {
            ItemType::Digital(d) => d.clone(),
            ItemType::Physical(_) => panic!("Cannot approve physical item as NFT"),
        };

        assert!(
            auction.status == Created || auction.status == Active,
            "Auction must be Created or Active to approve transfer"
        );

        let nft_client = token::Client::new(&env, &digital.nft_contract);
        // expiration_ledger must fit in u32 for soroban-sdk v22
        let expiration = ((auction.end_time + 172800) as u32).min(u32::MAX);
        nft_client.approve(
            &auction.seller,
            &env.current_contract_address(),
            &1i128,
            &expiration,
        );

        events::emit_nft_approved(&env, auction_id, &digital.nft_contract, digital.token_id);
    }

    // =========================================================================
    //  Bidding — English
    // =========================================================================

    pub fn place_bid(env: Env, auction_id: u64, bidder: Address, bid_amount: i128) {
        english::place_bid(&env, auction_id, &bidder, bid_amount);
    }

    // =========================================================================
    //  Bidding — Dutch
    // =========================================================================

    pub fn buy_now(env: Env, auction_id: u64, buyer: Address) {
        dutch::buy_now(&env, auction_id, &buyer);
    }

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

    pub fn commit_bid(
        env: Env,
        auction_id: u64,
        bidder: Address,
        commitment: BytesN<32>,
        bid_amount: i128,
    ) {
        sealed_bid::commit_bid(&env, auction_id, &bidder, commitment, bid_amount);
    }

    pub fn reveal_bid(
        env: Env,
        auction_id: u64,
        bidder: Address,
        bid_amount: i128,
        salt: BytesN<32>,
    ) {
        sealed_bid::reveal_bid(&env, auction_id, &bidder, bid_amount, salt);
    }

    pub fn refund_unrevealed(env: Env, auction_id: u64, bidder: Address) {
        sealed_bid::refund_unrevealed(&env, auction_id, &bidder);
    }

    // =========================================================================
    //  Auction Close & Settlement
    // =========================================================================

    /// Close an auction. Safe to call anytime — returns silently before end_time.
    pub fn close_auction(env: Env, auction_id: u64) {
        let mut auction: Auction = env
            .storage()
            .instance()
            .get(&Auction(auction_id))
            .unwrap_or_else(|| panic!("Auction not found"));

        if auction.status == Ended || auction.status == Settled || auction.status == Cancelled {
            return;
        }

        let now = env.ledger().timestamp();
        if now < auction.end_time {
            return;
        }
        if auction.status != Active && auction.status != Created {
            return;
        }

        match auction.format {
            AuctionFormat::English => {
                if let Some(ref winner) = auction.highest_bidder.clone() {
                    auction.status = Ended;
                    events::emit_auction_closed(&env, auction_id, winner, auction.highest_bid, &AuctionFormat::English);
                } else {
                    auction.status = Cancelled;
                    events::emit_auction_cancelled(&env, auction_id, &auction.seller);
                }
            }
            AuctionFormat::Dutch => {
                auction.status = Cancelled;
                events::emit_auction_cancelled(&env, auction_id, &auction.seller);
            }
            AuctionFormat::SealedBid => {
                if auction.revealed_bids.is_empty() {
                    auction.status = Cancelled;
                    events::emit_auction_cancelled(&env, auction_id, &auction.seller);
                } else {
                    sealed_bid::finalize_sealed_auction(&env, auction_id);
                    return;
                }
            }
        }

        env.storage().instance().set(&Auction(auction_id), &auction);
    }

    /// Settle a closed auction: transfer NFT to winner, distribute proceeds.
    pub fn settle_auction(env: Env, auction_id: u64) {
        let mut auction: Auction = env
            .storage()
            .instance()
            .get(&Auction(auction_id))
            .unwrap_or_else(|| panic!("Auction not found"));

        assert!(auction.status == Ended, "Auction not in Ended state");

        let winner = auction.highest_bidder.clone().unwrap_or_else(|| panic!("No winner"));

        match &auction.item {
            ItemType::Digital(item) => {
                let nft_client = token::Client::new(&env, &item.nft_contract);
                let allowance = nft_client.allowance(
                    &auction.seller,
                    &env.current_contract_address(),
                );
                assert!(allowance >= 1, "Auction contract not approved to transfer NFT");
                nft_client.transfer(&auction.seller, &winner, &(item.token_id as i128));
            }
            ItemType::Physical(_) => {}
        }

        let platform_wallet: Address = env
            .storage()
            .instance()
            .get(&PlatformWallet)
            .unwrap_or_else(|| panic!("Platform wallet not configured"));

        let breakdown = royalty::calculate_split(
            auction.highest_bid,
            auction.royalty_bps,
            auction.platform_fee_bps,
        );

        royalty::distribute_proceeds(
            &env, &auction.payment_token, &auction.seller,
            &auction.original_creator, &platform_wallet, &breakdown,
        );

        auction.status = Settled;
        env.storage().instance().set(&Auction(auction_id), &auction);

        events::emit_auction_settled(
            &env, auction_id,
            breakdown.seller_amount, breakdown.royalty_amount, breakdown.platform_fee_amount,
        );
    }

    // =========================================================================
    //  Admin
    // =========================================================================

    pub fn update_config(
        env: Env,
        admin: Address,
        new_fee_bps: Option<u32>,
        new_max_royalty_bps: Option<u32>,
        paused: Option<bool>,
    ) {
        admin.require_auth();
        let mut config: PlatformConfig = env.storage().instance().get(&Config)
            .unwrap_or_else(|| panic!("Not initialized"));
        assert!(admin == config.admin, "Not the admin");
        if let Some(fee) = new_fee_bps { config.default_platform_fee_bps = fee; }
        if let Some(max_royalty) = new_max_royalty_bps { config.max_royalty_bps = max_royalty; }
        if let Some(is_paused) = paused { config.paused = is_paused; }
        env.storage().instance().set(&Config, &config);
    }

    // =========================================================================
    //  Queries
    // =========================================================================

    pub fn get_auction(env: Env, auction_id: u64) -> Auction {
        env.storage().instance().get(&Auction(auction_id))
            .unwrap_or_else(|| panic!("Auction not found"))
    }

    pub fn get_auction_count(env: Env) -> u64 {
        env.storage().instance().get(&AuctionCount).unwrap_or(0)
    }

    pub fn is_paused(env: Env) -> bool {
        env.storage().instance().get::<_, PlatformConfig>(&Config)
            .map(|c| c.paused).unwrap_or(true)
    }
}
