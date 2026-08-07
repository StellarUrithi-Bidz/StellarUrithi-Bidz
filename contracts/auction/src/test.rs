//! Test suite for StellarUrithi-Bidz auction contract.
//! Tests English, Dutch, Sealed-Bid flows, escrow, and royalty distribution.

#![cfg(test)]

use soroban_sdk::{
    testutils::{Address as _, Ledger, LedgerInfo},
    token, vec, Address, BytesN, Env, IntoVal, String,
};

use crate::{
    types::{
        Auction, AuctionFormat, AuctionStatus, ItemType,
    },
    UrithiAuction, UrithiAuctionClient,
};

// ── Helper: Create a test token ──────────────────────────────────────────────────

fn create_token_contract<'a>(
    env: &Env,
    admin: &Address,
) -> token::StellarAssetClient<'a> {
    let token_admin = token::StellarAssetClient::new(env, &env.register_stellar_asset_contract_v2(admin.clone()));
    token_admin
}

fn create_token<'a>(env: &Env, admin: &Address) -> (Address, token::StellarAssetClient<'a>) {
    let asset = env.register_stellar_asset_contract_v2(admin.clone());
    let token_admin = token::StellarAssetClient::new(env, &asset);
    (asset, token_admin)
}

// ── Helper: Initialize the auction contract ───────────────────────────────────────

fn setup_contract<'a>(env: &Env) -> (UrithiAuctionClient<'a>, Address, Address, Address) {
    let admin = Address::generate(env);
    let platform_wallet = Address::generate(env);
    let (payment_token, token_admin) = create_token(env, &admin);

    let contract_id = env.register(UrithiAuction, ());
    let client = UrithiAuctionClient::new(env, &contract_id);

    client.initialize(&admin, &250u32, &1500u32, &platform_wallet);

    // Mint some tokens to test addresses
    token_admin.mint(&admin, &1_000_000_000_000_000i128);

    (client, admin, platform_wallet, payment_token)
}

// ── Helper: Create a test auction ─────────────────────────────────────────────────

fn create_test_auction(
    client: &UrithiAuctionClient,
    seller: &Address,
    creator: &Address,
    payment_token: &Address,
    format: AuctionFormat,
) -> u64 {
    let now = client.env.ledger().timestamp();
    let start = now + 60;  // 60 seconds from now
    let end = start + 3600; // 1 hour auction

    match format {
        AuctionFormat::English => client.create_auction(
            seller,
            creator,
            &AuctionFormat::English,
            &ItemType::Digital {
                nft_contract: Address::generate(&client.env),
                token_id: 1,
            },
            payment_token,
            &100i128,    // reserve
            &500u32,     // 5% royalty
            &start,
            &end,
            &String::from_str(&client.env, "ipfs://test-metadata"),
            &10i128,     // min increment
            &0i128,      // start_price (n/a)
            &0i128,      // decay (n/a)
            &0u64,       // commit deadline (n/a)
            &0u64,       // reveal deadline (n/a)
        ),
        AuctionFormat::Dutch => client.create_auction(
            seller,
            creator,
            &AuctionFormat::Dutch,
            &ItemType::Digital {
                nft_contract: Address::generate(&client.env),
                token_id: 1,
            },
            payment_token,
            &100i128,            // reserve
            &500u32,             // 5% royalty
            &start,
            &end,
            &String::from_str(&client.env, "ipfs://dutch-test"),
            &0i128,              // min increment (n/a)
            &1000i128,           // start price
            &1i128,              // 1 stroop/sec decay
            &0u64,               // commit deadline
            &0u64,               // reveal deadline
        ),
        AuctionFormat::SealedBid => {
            let commit = start + 1800;
            let reveal = start + 3600;
            client.create_auction(
                seller,
                creator,
                &AuctionFormat::SealedBid,
                &ItemType::Digital {
                    nft_contract: Address::generate(&client.env),
                    token_id: 1,
                },
                payment_token,
                &100i128,
                &500u32,
                &start,
                &reveal, // end = reveal deadline
                &String::from_str(&client.env, "ipfs://sealed-test"),
                &0i128,  // min increment
                &0i128,  // start price
                &0i128,  // decay
                &commit,
                &reveal,
            )
        }
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  Initialization Tests
// ═════════════════════════════════════════════════════════════════════════════

#[test]
fn test_initialize() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let platform_wallet = Address::generate(&env);

    let contract_id = env.register(UrithiAuction, ());
    let client = UrithiAuctionClient::new(&env, &contract_id);

    client.initialize(&admin, &250u32, &1500u32, &platform_wallet);

    // Verify initialization
    assert_eq!(client.get_auction_count(), 0);
    assert!(!client.is_paused());
}

#[test]
#[should_panic(expected = "Already initialized")]
fn test_initialize_twice_panics() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let platform_wallet = Address::generate(&env);

    let contract_id = env.register(UrithiAuction, ());
    let client = UrithiAuctionClient::new(&env, &contract_id);

    client.initialize(&admin, &250u32, &1500u32, &platform_wallet);
    client.initialize(&admin, &250u32, &1500u32, &platform_wallet);
}

// ═════════════════════════════════════════════════════════════════════════════
//  English Auction Tests
// ═════════════════════════════════════════════════════════════════════════════

#[test]
fn test_english_auction_full_flow() {
    let env = Env::default();
    let (client, admin, platform_wallet, payment_token) = setup_contract(&env);

    let seller = Address::generate(&env);
    let creator = Address::generate(&env);
    let bidder1 = Address::generate(&env);
    let bidder2 = Address::generate(&env);

    // Mint tokens
    let token_admin = token::StellarAssetClient::new(&env, &payment_token);
    token_admin.mint(&seller, &10_000i128);
    token_admin.mint(&bidder1, &10_000i128);
    token_admin.mint(&bidder2, &10_000i128);

    // Create auction
    let auction_id = create_test_auction(&client, &seller, &creator, &payment_token, AuctionFormat::English);

    // Advance time past start
    env.ledger().set_timestamp(env.ledger().timestamp() + 120);

    // Activate
    client.activate_auction(&auction_id);

    // Bidder 1 places bid at 200
    client.place_bid(&auction_id, &bidder1, &200i128);

    let auction = client.get_auction(&auction_id);
    assert_eq!(auction.highest_bid, 200);
    assert_eq!(auction.highest_bidder.unwrap(), bidder1);

    // Bidder 2 outbids at 350
    client.place_bid(&auction_id, &bidder2, &350i128);

    let auction = client.get_auction(&auction_id);
    assert_eq!(auction.highest_bid, 350);
    assert_eq!(auction.highest_bidder.unwrap(), bidder2);

    // Advance past end
    env.ledger().set_timestamp(env.ledger().timestamp() + 4000);

    // Close
    client.close_auction(&auction_id);
    let auction = client.get_auction(&auction_id);
    assert_eq!(auction.status, AuctionStatus::Ended);

    // Settle — distributes to seller, creator, platform
    client.settle_auction(&auction_id);
    let auction = client.get_auction(&auction_id);
    assert_eq!(auction.status, AuctionStatus::Settled);
}

#[test]
#[should_panic(expected = "Bid below reserve price")]
fn test_english_bid_below_reserve_fails() {
    let env = Env::default();
    let (client, _admin, _platform_wallet, payment_token) = setup_contract(&env);

    let seller = Address::generate(&env);
    let creator = Address::generate(&env);
    let bidder = Address::generate(&env);

    token::StellarAssetClient::new(&env, &payment_token).mint(&bidder, &10_000i128);

    let auction_id = create_test_auction(&client, &seller, &creator, &payment_token, AuctionFormat::English);
    env.ledger().set_timestamp(env.ledger().timestamp() + 120);
    client.activate_auction(&auction_id);

    // Bid 50 when reserve is 100
    client.place_bid(&auction_id, &bidder, &50i128);
}

#[test]
#[should_panic(expected = "Bid must exceed highest bid")]
fn test_english_bid_too_low_increment_fails() {
    let env = Env::default();
    let (client, _admin, _platform_wallet, payment_token) = setup_contract(&env);

    let seller = Address::generate(&env);
    let creator = Address::generate(&env);
    let bidder1 = Address::generate(&env);
    let bidder2 = Address::generate(&env);

    token::StellarAssetClient::new(&env, &payment_token).mint(&bidder1, &10_000i128);
    token::StellarAssetClient::new(&env, &payment_token).mint(&bidder2, &10_000i128);

    let auction_id = create_test_auction(&client, &seller, &creator, &payment_token, AuctionFormat::English);
    env.ledger().set_timestamp(env.ledger().timestamp() + 120);
    client.activate_auction(&auction_id);

    client.place_bid(&auction_id, &bidder1, &200i128);
    // Bid 205 when min increment is 10 and highest is 200 (needs 210)
    client.place_bid(&auction_id, &bidder2, &205i128);
}

// ═════════════════════════════════════════════════════════════════════════════
//  Dutch Auction Tests
// ═════════════════════════════════════════════════════════════════════════════

#[test]
fn test_dutch_auction_full_flow() {
    let env = Env::default();
    let (client, _admin, _platform_wallet, payment_token) = setup_contract(&env);

    let seller = Address::generate(&env);
    let creator = Address::generate(&env);
    let buyer = Address::generate(&env);
    let platform_wallet = Address::generate(&env);

    token::StellarAssetClient::new(&env, &payment_token).mint(&buyer, &10_000i128);

    let auction_id = create_test_auction(&client, &seller, &creator, &payment_token, AuctionFormat::Dutch);

    env.ledger().set_timestamp(env.ledger().timestamp() + 120);
    client.activate_auction(&auction_id);

    // Fast-forward 200 seconds → price should be 1000 - 200 = 800
    env.ledger().set_timestamp(env.ledger().timestamp() + 200);

    let current_price = client.get_dutch_price(&auction_id);
    assert_eq!(current_price, 800);

    // Buy now at current price
    client.buy_now(&auction_id, &buyer);

    let auction = client.get_auction(&auction_id);
    assert_eq!(auction.status, AuctionStatus::Ended);
    assert_eq!(auction.highest_bid, 800);
    assert_eq!(auction.highest_bidder.unwrap(), buyer);
}

#[test]
fn test_dutch_price_below_reserve_floor() {
    let env = Env::default();
    let (client, _admin, _platform_wallet, payment_token) = setup_contract(&env);

    let seller = Address::generate(&env);
    let creator = Address::generate(&env);

    let auction_id = create_test_auction(&client, &seller, &creator, &payment_token, AuctionFormat::Dutch);

    env.ledger().set_timestamp(env.ledger().timestamp() + 120);
    client.activate_auction(&auction_id);

    // Fast-forward well past — price should floor at reserve
    env.ledger().set_timestamp(env.ledger().timestamp() + 10000);

    let current_price = client.get_dutch_price(&auction_id);
    assert_eq!(current_price, 100); // Reserve is the floor
}

// ═════════════════════════════════════════════════════════════════════════════
//  Sealed-Bid Auction Tests
// ═════════════════════════════════════════════════════════════════════════════

#[test]
fn test_sealed_bid_full_flow() {
    let env = Env::default();
    let (client, _admin, _platform_wallet, payment_token) = setup_contract(&env);

    let seller = Address::generate(&env);
    let creator = Address::generate(&env);
    let bidder1 = Address::generate(&env);
    let bidder2 = Address::generate(&env);

    token::StellarAssetClient::new(&env, &payment_token).mint(&bidder1, &10_000i128);
    token::StellarAssetClient::new(&env, &payment_token).mint(&bidder2, &10_000i128);

    // Create sealed-bid auction
    let now = env.ledger().timestamp();
    let start = now + 60;
    let commit_deadline = start + 1800;
    let reveal_deadline = start + 3600;

    let auction_id = client.create_auction(
        &seller,
        &creator,
        &AuctionFormat::SealedBid,
        &ItemType::Digital {
            nft_contract: Address::generate(&env),
            token_id: 1,
        },
        &payment_token,
        &100i128,
        &500u32,
        &start,
        &reveal_deadline,
        &String::from_str(&env, "ipfs://sealed"),
        &0i128, &0i128, &0i128,
        &commit_deadline,
        &reveal_deadline,
    );

    env.ledger().set_timestamp(env.ledger().timestamp() + 120);
    client.activate_auction(&auction_id);

    // ── Commit phase ────────────────────────────────────────────────────────
    let salt1 = BytesN::<32>::from_array(&env, &[1u8; 32]);
    let salt2 = BytesN::<32>::from_array(&env, &[2u8; 32]);

    // Compute commitments
    let mut preimage1 = soroban_sdk::Bytes::new(&env);
    preimage1.append(&300i128.to_be_bytes().into());
    preimage1.append(&salt1.to_array().into());
    let commitment1 = env.crypto().sha256(&preimage1);

    let mut preimage2 = soroban_sdk::Bytes::new(&env);
    preimage2.append(&500i128.to_be_bytes().into());
    preimage2.append(&salt2.to_array().into());
    let commitment2 = env.crypto().sha256(&preimage2);

    client.commit_bid(&auction_id, &bidder1, &commitment1, &300i128);
    client.commit_bid(&auction_id, &bidder2, &commitment2, &500i128);

    // ── Reveal phase ────────────────────────────────────────────────────────
    env.ledger().set_timestamp(commit_deadline + 10);

    client.reveal_bid(&auction_id, &bidder1, &300i128, &salt1);
    client.reveal_bid(&auction_id, &bidder2, &500i128, &salt2);

    // ── Finalize ────────────────────────────────────────────────────────────
    env.ledger().set_timestamp(reveal_deadline + 10);

    client.close_auction(&auction_id);

    let auction = client.get_auction(&auction_id);
    assert_eq!(auction.status, AuctionStatus::Ended);
    assert_eq!(auction.highest_bid, 500);
    assert_eq!(auction.highest_bidder.unwrap(), bidder2);
}

// ═════════════════════════════════════════════════════════════════════════════
//  Royalty Split Tests
// ═════════════════════════════════════════════════════════════════════════════

#[test]
fn test_royalty_calculation() {
    use crate::royalty;

    // 1000 stroops, 5% royalty (500 bps), 2.5% platform fee (250 bps)
    let breakdown = royalty::calculate_split(1000, 500, 250);

    assert_eq!(breakdown.royalty_amount, 50);    // 5% of 1000
    assert_eq!(breakdown.platform_fee_amount, 25); // 2.5% of 1000
    assert_eq!(breakdown.seller_amount, 925);     // 1000 - 50 - 25
    assert_eq!(breakdown.total, 1000);
}

#[test]
fn test_english_auction_royalty_distribution() {
    let env = Env::default();
    let (client, admin, platform_wallet, payment_token) = setup_contract(&env);

    let seller = Address::generate(&env);
    let creator = Address::generate(&env);
    let bidder = Address::generate(&env);

    let token_admin = token::StellarAssetClient::new(&env, &payment_token);
    token_admin.mint(&bidder, &10_000i128);

    let auction_id = create_test_auction(&client, &seller, &creator, &payment_token, AuctionFormat::English);

    env.ledger().set_timestamp(env.ledger().timestamp() + 120);
    client.activate_auction(&auction_id);
    client.place_bid(&auction_id, &bidder, &1000i128);

    env.ledger().set_timestamp(env.ledger().timestamp() + 4000);

    client.close_auction(&auction_id);
    client.settle_auction(&auction_id);

    // Verify balances: platform should have received 25 (2.5% of 1000)
    // Creator should have received 50 (5% of 1000)
    // Seller should have received 925
    let token_client = token::TokenClient::new(&env, &payment_token);
    assert_eq!(token_client.balance(&platform_wallet), 25);
    assert_eq!(token_client.balance(&creator), 50);
    assert_eq!(token_client.balance(&seller), 925);
}

// ═════════════════════════════════════════════════════════════════════════════
//  Admin / Cancel Tests
// ═════════════════════════════════════════════════════════════════════════════

#[test]
fn test_cancel_auction() {
    let env = Env::default();
    let (client, _admin, _platform_wallet, payment_token) = setup_contract(&env);

    let seller = Address::generate(&env);
    let creator = Address::generate(&env);

    let auction_id = create_test_auction(&client, &seller, &creator, &payment_token, AuctionFormat::English);

    client.cancel_auction(&auction_id);
    let auction = client.get_auction(&auction_id);
    assert_eq!(auction.status, AuctionStatus::Cancelled);
}

#[test]
fn test_pause_platform() {
    let env = Env::default();
    let (client, admin, platform_wallet, _payment_token) = setup_contract(&env);

    client.update_config(&admin, &Option::None, &Option::None, &Option::Some(true));
    assert!(client.is_paused());

    client.update_config(&admin, &Option::None, &Option::None, &Option::Some(false));
    assert!(!client.is_paused());
}
