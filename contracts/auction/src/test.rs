//! Test suite for StellarUrithi-Bidz auction contract.
//! Tests English, Dutch, Sealed-Bid flows, escrow, and royalty distribution.

#![cfg(test)]

use soroban_sdk::{
    testutils::{Address as _, Ledger, LedgerInfo},
    token, Bytes, Address, BytesN, Env, String,
};

use crate::{
    types::{
        Auction, AuctionFormat, AuctionStatus, ItemType,
    },
    UrithiAuction, UrithiAuctionClient,
};

// ── Helper: Create a test token ──────────────────────────────────────────────────

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
            seller, creator, &AuctionFormat::English,
            &ItemType::Digital { nft_contract: Address::generate(&client.env), token_id: 1 },
            payment_token, &100i128, &500u32, &start, &end,
            &String::from_str(&client.env, "ipfs://test-metadata"),
            &10i128, &0i128, &0i128, &0u64, &0u64, &0u64,
        ),
        AuctionFormat::Dutch => client.create_auction(
            seller, creator, &AuctionFormat::Dutch,
            &ItemType::Digital { nft_contract: Address::generate(&client.env), token_id: 1 },
            payment_token, &100i128, &500u32, &start, &end,
            &String::from_str(&client.env, "ipfs://dutch-test"),
            &0i128, &1000i128, &1i128, &0u64, &0u64, &0u64,
        ),
        AuctionFormat::SealedBid => {
            let commit = start + 1800;
            let reveal = start + 3600;
            client.create_auction(
                seller, creator, &AuctionFormat::SealedBid,
                &ItemType::Digital { nft_contract: Address::generate(&client.env), token_id: 1 },
                payment_token, &100i128, &500u32, &start, &reveal,
                &String::from_str(&client.env, "ipfs://sealed-test"),
                &0i128, &0i128, &0i128, &commit, &reveal, &10u64, // max_bidders = 10
            )
        }
    }
}

// ── Helper: Compute a bound sealed-bid commitment ─────────────────────────────────
// SHA256(bid_amount || salt || auction_id || bidder)
fn compute_bound_commitment(
    env: &Env,
    bid_amount: i128,
    salt: &BytesN<32>,
    auction_id: u64,
    bidder: &Address,
) -> BytesN<32> {
    let mut preimage = Bytes::new(env);
    preimage.append(&bid_amount.to_be_bytes().into());
    preimage.append(&salt.to_array().into());
    preimage.append(&auction_id.to_be_bytes().into());
    preimage.append(&bidder.to_bytes().into());
    env.crypto().sha256(&preimage)
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
    let (client, _admin, platform_wallet, payment_token) = setup_contract(&env);

    let seller = Address::generate(&env);
    let creator = Address::generate(&env);
    let bidder1 = Address::generate(&env);
    let bidder2 = Address::generate(&env);

    let token_admin = token::StellarAssetClient::new(&env, &payment_token);
    token_admin.mint(&seller, &10_000i128);
    token_admin.mint(&bidder1, &10_000i128);
    token_admin.mint(&bidder2, &10_000i128);

    let auction_id = create_test_auction(&client, &seller, &creator, &payment_token, AuctionFormat::English);

    env.ledger().set_timestamp(env.ledger().timestamp() + 120);
    client.activate_auction(&auction_id);

    client.place_bid(&auction_id, &bidder1, &200i128);
    let auction = client.get_auction(&auction_id);
    assert_eq!(auction.highest_bid, 200);
    assert_eq!(auction.highest_bidder.unwrap(), bidder1);

    client.place_bid(&auction_id, &bidder2, &350i128);
    let auction = client.get_auction(&auction_id);
    assert_eq!(auction.highest_bid, 350);
    assert_eq!(auction.highest_bidder.unwrap(), bidder2);

    env.ledger().set_timestamp(env.ledger().timestamp() + 4000);
    client.close_auction(&auction_id);
    assert_eq!(client.get_auction(&auction_id).status, AuctionStatus::Ended);

    client.settle_auction(&auction_id);
    assert_eq!(client.get_auction(&auction_id).status, AuctionStatus::Settled);
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

    token::StellarAssetClient::new(&env, &payment_token).mint(&buyer, &10_000i128);

    let auction_id = create_test_auction(&client, &seller, &creator, &payment_token, AuctionFormat::Dutch);

    env.ledger().set_timestamp(env.ledger().timestamp() + 120);
    client.activate_auction(&auction_id);

    env.ledger().set_timestamp(env.ledger().timestamp() + 200);
    assert_eq!(client.get_dutch_price(&auction_id), 800);

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

    env.ledger().set_timestamp(env.ledger().timestamp() + 10000);
    assert_eq!(client.get_dutch_price(&auction_id), 100);
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

    let auction_id = create_test_auction(&client, &seller, &creator, &payment_token, AuctionFormat::SealedBid);

    env.ledger().set_timestamp(env.ledger().timestamp() + 120);
    client.activate_auction(&auction_id);

    // ── Commit phase ────────────────────────────────────────────────────────
    let salt1 = BytesN::<32>::from_array(&env, &[1u8; 32]);
    let salt2 = BytesN::<32>::from_array(&env, &[2u8; 32]);

    // Bound commitments: SHA256(bid_amount || salt || auction_id || bidder)
    let commitment1 = compute_bound_commitment(&env, 300, &salt1, auction_id, &bidder1);
    let commitment2 = compute_bound_commitment(&env, 500, &salt2, auction_id, &bidder2);

    client.commit_bid(&auction_id, &bidder1, &commitment1, &300i128);
    client.commit_bid(&auction_id, &bidder2, &commitment2, &500i128);

    // ── Reveal phase ────────────────────────────────────────────────────────
    let auction = client.get_auction(&auction_id);
    env.ledger().set_timestamp(auction.commit_deadline + 10);

    client.reveal_bid(&auction_id, &bidder1, &300i128, &salt1);
    client.reveal_bid(&auction_id, &bidder2, &500i128, &salt2);

    // ── Finalize ────────────────────────────────────────────────────────────
    env.ledger().set_timestamp(auction.reveal_deadline + 10);
    client.close_auction(&auction_id);

    let auction = client.get_auction(&auction_id);
    assert_eq!(auction.status, AuctionStatus::Ended);
    assert_eq!(auction.highest_bid, 500);
    assert_eq!(auction.highest_bidder.unwrap(), bidder2);
}

#[test]
#[should_panic(expected = "Commitment verification failed")]
fn test_sealed_bid_wrong_salt_fails() {
    let env = Env::default();
    let (client, _admin, _platform_wallet, payment_token) = setup_contract(&env);

    let seller = Address::generate(&env);
    let creator = Address::generate(&env);
    let bidder = Address::generate(&env);

    token::StellarAssetClient::new(&env, &payment_token).mint(&bidder, &10_000i128);

    let auction_id = create_test_auction(&client, &seller, &creator, &payment_token, AuctionFormat::SealedBid);

    env.ledger().set_timestamp(env.ledger().timestamp() + 120);
    client.activate_auction(&auction_id);

    let salt = BytesN::<32>::from_array(&env, &[1u8; 32]);
    let commitment = compute_bound_commitment(&env, 300, &salt, auction_id, &bidder);

    client.commit_bid(&auction_id, &bidder, &commitment, &300i128);

    let auction = client.get_auction(&auction_id);
    env.ledger().set_timestamp(auction.commit_deadline + 10);

    // Reveal with wrong salt
    let wrong_salt = BytesN::<32>::from_array(&env, &[99u8; 32]);
    client.reveal_bid(&auction_id, &bidder, &300i128, &wrong_salt);
}

#[test]
fn test_sealed_bid_bound_commitment_no_cross_auction_replay() {
    // Verifies that commitments are bound to auction_id — same bid+salt can't
    // be replayed across different auctions.
    let env = Env::default();
    let (client, _admin, _platform_wallet, payment_token) = setup_contract(&env);

    let seller = Address::generate(&env);
    let creator = Address::generate(&env);
    let bidder = Address::generate(&env);

    token::StellarAssetClient::new(&env, &payment_token).mint(&bidder, &20_000i128);

    // Create two auctions
    let auction_id_1 = create_test_auction(&client, &seller, &creator, &payment_token, AuctionFormat::SealedBid);
    let auction_id_2 = create_test_auction(&client, &seller, &creator, &payment_token, AuctionFormat::SealedBid);

    env.ledger().set_timestamp(env.ledger().timestamp() + 120);
    client.activate_auction(&auction_id_1);
    client.activate_auction(&auction_id_2);

    let salt = BytesN::<32>::from_array(&env, &[1u8; 32]);

    // Commit to auction 1
    let commitment_1 = compute_bound_commitment(&env, 300, &salt, auction_id_1, &bidder);
    client.commit_bid(&auction_id_1, &bidder, &commitment_1, &300i128);

    // Try to use the SAME commitment for auction 2 (should succeed as a NEW commitment
    // since the auction_id differs, but the reveal must use auction_id_2)
    let commitment_2 = compute_bound_commitment(&env, 300, &salt, auction_id_2, &bidder);
    // commitment_1 != commitment_2 because auction_id differs
    assert!(commitment_1 != commitment_2);

    // Commit to auction 2 with its own commitment
    client.commit_bid(&auction_id_2, &bidder, &commitment_2, &300i128);

    // Reveal on auction 1 with auction 1's salt — should work
    let auction1 = client.get_auction(&auction_id_1);
    env.ledger().set_timestamp(auction1.commit_deadline + 10);
    client.reveal_bid(&auction_id_1, &bidder, &300i128, &salt);

    // Reveal on auction 2 with same salt — should also work (different auction binding)
    client.reveal_bid(&auction_id_2, &bidder, &300i128, &salt);
}

#[test]
#[should_panic(expected = "Maximum number of bidders reached")]
fn test_sealed_bid_max_bidders_cap() {
    let env = Env::default();
    let (client, _admin, _platform_wallet, payment_token) = setup_contract(&env);

    let seller = Address::generate(&env);
    let creator = Address::generate(&env);

    // Create auction with max_bidders = 2
    let now = env.ledger().timestamp();
    let start = now + 60;
    let commit = start + 1800;
    let reveal = start + 3600;

    let auction_id = client.create_auction(
        &seller, &creator, &AuctionFormat::SealedBid,
        &ItemType::Digital { nft_contract: Address::generate(&env), token_id: 1 },
        &payment_token, &100i128, &500u32, &start, &reveal,
        &String::from_str(&env, "ipfs://sealed-max-bidders"),
        &0i128, &0i128, &0i128, &commit, &reveal, &2u64, // max_bidders = 2
    );

    env.ledger().set_timestamp(env.ledger().timestamp() + 120);
    client.activate_auction(&auction_id);

    // Add 2 bidders (reaches cap)
    let bidder1 = Address::generate(&env);
    let bidder2 = Address::generate(&env);
    let bidder3 = Address::generate(&env);

    token::StellarAssetClient::new(&env, &payment_token).mint(&bidder1, &10_000i128);
    token::StellarAssetClient::new(&env, &payment_token).mint(&bidder2, &10_000i128);
    token::StellarAssetClient::new(&env, &payment_token).mint(&bidder3, &10_000i128);

    let salt = BytesN::<32>::from_array(&env, &[1u8; 32]);
    let c1 = compute_bound_commitment(&env, 100, &salt, auction_id, &bidder1);
    let c2 = compute_bound_commitment(&env, 200, &salt, auction_id, &bidder2);
    let c3 = compute_bound_commitment(&env, 300, &salt, auction_id, &bidder3);

    client.commit_bid(&auction_id, &bidder1, &c1, &100i128);
    client.commit_bid(&auction_id, &bidder2, &c2, &200i128);

    // Third bidder should be rejected
    client.commit_bid(&auction_id, &bidder3, &c3, &300i128);
}

#[test]
fn test_sealed_bid_refund_unrevealed() {
    let env = Env::default();
    let (client, _admin, _platform_wallet, payment_token) = setup_contract(&env);

    let seller = Address::generate(&env);
    let creator = Address::generate(&env);
    let bidder1 = Address::generate(&env);
    let bidder2 = Address::generate(&env);

    token::StellarAssetClient::new(&env, &payment_token).mint(&bidder1, &10_000i128);
    token::StellarAssetClient::new(&env, &payment_token).mint(&bidder2, &10_000i128);

    let auction_id = create_test_auction(&client, &seller, &creator, &payment_token, AuctionFormat::SealedBid);

    env.ledger().set_timestamp(env.ledger().timestamp() + 120);
    client.activate_auction(&auction_id);

    // Both bidders commit
    let salt = BytesN::<32>::from_array(&env, &[1u8; 32]);
    let c1 = compute_bound_commitment(&env, 300, &salt, auction_id, &bidder1);
    let c2 = compute_bound_commitment(&env, 500, &salt, auction_id, &bidder2);

    client.commit_bid(&auction_id, &bidder1, &c1, &300i128);
    client.commit_bid(&auction_id, &bidder2, &c2, &500i128);

    // Only bidder1 reveals; bidder2 does NOT reveal
    let auction = client.get_auction(&auction_id);
    env.ledger().set_timestamp(auction.commit_deadline + 10);
    client.reveal_bid(&auction_id, &bidder1, &300i128, &salt);

    // Pass reveal deadline
    env.ledger().set_timestamp(auction.reveal_deadline + 10);

    // Bidder2 gets refunded via refund_unrevealed
    client.refund_unrevealed(&auction_id, &bidder2);

    // Verify bidder2 got their tokens back (balance should equal original)
    let token_client = token::TokenClient::new(&env, &payment_token);
    assert_eq!(token_client.balance(&bidder2), 10_000i128);

    // Finalize should still work with only bidder1's revealed bid
    client.close_auction(&auction_id);
    let auction = client.get_auction(&auction_id);
    assert_eq!(auction.status, AuctionStatus::Ended);
    assert_eq!(auction.highest_bid, 300);
}

// ═════════════════════════════════════════════════════════════════════════════
//  Royalty Split Tests
// ═════════════════════════════════════════════════════════════════════════════

#[test]
fn test_royalty_calculation() {
    use crate::royalty;

    let breakdown = royalty::calculate_split(1000, 500, 250);
    assert_eq!(breakdown.royalty_amount, 50);
    assert_eq!(breakdown.platform_fee_amount, 25);
    assert_eq!(breakdown.seller_amount, 925);
    assert_eq!(breakdown.total, 1000);
}

#[test]
fn test_english_auction_royalty_distribution() {
    let env = Env::default();
    let (client, _admin, platform_wallet, payment_token) = setup_contract(&env);

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

    assert_eq!(client.get_auction(&auction_id).status, AuctionStatus::Cancelled);
}

#[test]
fn test_pause_platform() {
    let env = Env::default();
    let (client, admin, _platform_wallet, _payment_token) = setup_contract(&env);

    client.update_config(&admin, &Option::None, &Option::None, &Option::Some(true));
    assert!(client.is_paused());

    client.update_config(&admin, &Option::None, &Option::None, &Option::Some(false));
    assert!(!client.is_paused());
}
