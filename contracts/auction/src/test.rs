#![cfg(test)]

use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token, Address, BytesN, Env, String,
};

use crate::{
    types::{
AuctionFormat, AuctionStatus, CreateAuctionParams,
        DigitalItem, ItemType,
    },
    sealed_bid::{build_commitment_message, hmac_sha256},
    UrithiAuction, UrithiAuctionClient,
};

fn create_token<'a>(env: &Env, admin: &Address) -> (Address, token::StellarAssetClient<'a>) {
    let sac = env.register_stellar_asset_contract_v2(admin.clone());
    let asset = sac.address();
    (asset.clone(), token::StellarAssetClient::new(env, &asset))
}

/// Returns (client, admin, platform_wallet, payment_token, nft_token).
/// The nft_token is a real SAC — needed for allowance/transfer in settle_auction tests.
fn setup_contract<'a>(env: &Env) -> (UrithiAuctionClient<'a>, Address, Address, Address, Address) {
    let admin = Address::generate(env);
    let platform_wallet = Address::generate(env);
    let (payment_token, token_admin) = create_token(env, &admin);
    let (nft_token, _nft_admin) = create_token(env, &admin);

    let contract_id = env.register(UrithiAuction, ());
    let client = UrithiAuctionClient::new(env, &contract_id);
    client.initialize(&admin, &250u32, &1500u32, &platform_wallet);
    token_admin.mint(&admin, &1_000_000_000_000_000i128);
    (client, admin, platform_wallet, payment_token, nft_token)
}

fn create_test_auction(
    client: &UrithiAuctionClient,
    seller: &Address,
    creator: &Address,
    payment_token: &Address,
    format: AuctionFormat,
) -> u64 {
    let now = client.env.ledger().timestamp();
    let start = now + 60;
    let end = start + 3600;

    // Use payment_token as NFT contract (a real SAC) so allowance/transfer calls work
    let item = ItemType::Digital(DigitalItem { nft_contract: payment_token.clone(), token_id: 1 });

    match format {
        AuctionFormat::English => client.create_auction(&CreateAuctionParams {
            seller: seller.clone(), original_creator: creator.clone(),
            format: AuctionFormat::English, item, payment_token: payment_token.clone(),
            reserve_price: 100, royalty_bps: 500, start_time: start, end_time: end,
            metadata_uri: String::from_str(&client.env, "ipfs://test"),
            min_increment: 10, start_price: 0, price_decay_per_second: 0,
            commit_deadline: 0, reveal_deadline: 0, max_bidders: 0,
        }),
        AuctionFormat::Dutch => client.create_auction(&CreateAuctionParams {
            seller: seller.clone(), original_creator: creator.clone(),
            format: AuctionFormat::Dutch, item, payment_token: payment_token.clone(),
            reserve_price: 100, royalty_bps: 500, start_time: start, end_time: end,
            metadata_uri: String::from_str(&client.env, "ipfs://dutch"),
            min_increment: 0, start_price: 1000, price_decay_per_second: 1,
            commit_deadline: 0, reveal_deadline: 0, max_bidders: 0,
        }),
        AuctionFormat::SealedBid => {
            let commit = start + 1800;
            let reveal = start + 3600;
            client.create_auction(&CreateAuctionParams {
                seller: seller.clone(), original_creator: creator.clone(),
                format: AuctionFormat::SealedBid, item, payment_token: payment_token.clone(),
                reserve_price: 100, royalty_bps: 500, start_time: start, end_time: reveal,
                metadata_uri: String::from_str(&client.env, "ipfs://sealed"),
                min_increment: 0, start_price: 0, price_decay_per_second: 0,
                commit_deadline: commit, reveal_deadline: reveal, max_bidders: 10,
            })
        }
    }
}

/// Compute HMAC-SHA256 commitment matching the contract's verification.
fn compute_hmac_commitment(
    env: &Env,
    bid_amount: i128,
    salt: &BytesN<32>,
    auction_id: u64,
    bidder: &Address,
) -> BytesN<32> {
    let message = build_commitment_message(env, bid_amount, auction_id, bidder);
    hmac_sha256(env, salt, &message)
}

// ═════════════════════════════════════════════════════════════════════════════

#[test]
fn test_initialize() {
    let env = Env::default();
    env.mock_all_auths_allowing_non_root_auth();
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
    env.mock_all_auths_allowing_non_root_auth();
    let admin = Address::generate(&env);
    let pw = Address::generate(&env);
    let contract_id = env.register(UrithiAuction, ());
    let client = UrithiAuctionClient::new(&env, &contract_id);
    client.initialize(&admin, &250u32, &1500u32, &pw);
    client.initialize(&admin, &250u32, &1500u32, &pw);
}

// ═════════════════════════════════════════════════════════════════════════════
//  English Auction
// ═════════════════════════════════════════════════════════════════════════════

#[test]
fn test_english_auction_full_flow() {
    let env = Env::default();
    env.mock_all_auths_allowing_non_root_auth();
    let (client, _admin, _pw, payment_token, _nft) = setup_contract(&env);
    let seller = Address::generate(&env);
    let creator = Address::generate(&env);
    let bidder1 = Address::generate(&env);
    let bidder2 = Address::generate(&env);

    let ta = token::StellarAssetClient::new(&env, &payment_token);
    ta.mint(&bidder1, &10_000i128);
    ta.mint(&bidder2, &10_000i128);
    // Seller needs exactly 1 token unit for the NFT transfer in settle_auction
    ta.mint(&seller, &1i128);

    let auction_id = create_test_auction(&client, &seller, &creator, &payment_token, AuctionFormat::English);
    env.ledger().set_timestamp(env.ledger().timestamp() + 120);
    client.activate_auction(&auction_id);

    client.place_bid(&auction_id, &bidder1, &200i128);
    let a = client.get_auction(&auction_id);
    assert_eq!(a.highest_bid, 200);
    assert_eq!(a.highest_bidder.unwrap(), bidder1);

    client.place_bid(&auction_id, &bidder2, &350i128);
    let a = client.get_auction(&auction_id);
    assert_eq!(a.highest_bid, 350);
    assert_eq!(a.highest_bidder.unwrap(), bidder2);

    env.ledger().set_timestamp(env.ledger().timestamp() + 4000);
    // Must approve BEFORE close — approve_nft_transfer requires Created or Active
    client.approve_nft_transfer(&auction_id);
    client.close_auction(&auction_id);
    assert_eq!(client.get_auction(&auction_id).status, AuctionStatus::Ended);

    client.settle_auction(&auction_id);
    assert_eq!(client.get_auction(&auction_id).status, AuctionStatus::Settled);
}

#[test]
#[should_panic(expected = "Bid below reserve price")]
fn test_english_bid_below_reserve_fails() {
    let env = Env::default();
    env.mock_all_auths_allowing_non_root_auth();
    let (client, _a, _p, pt, _nft) = setup_contract(&env);
    let seller = Address::generate(&env);
    let creator = Address::generate(&env);
    let bidder = Address::generate(&env);
    token::StellarAssetClient::new(&env, &pt).mint(&bidder, &10_000i128);
    let aid = create_test_auction(&client, &seller, &creator, &pt, AuctionFormat::English);
    env.ledger().set_timestamp(env.ledger().timestamp() + 120);
    client.activate_auction(&aid);
    client.place_bid(&aid, &bidder, &50i128);
}

#[test]
#[should_panic(expected = "Bid must exceed highest bid")]
fn test_english_bid_too_low_increment_fails() {
    let env = Env::default();
    env.mock_all_auths_allowing_non_root_auth();
    let (client, _a, _p, pt, _nft) = setup_contract(&env);
    let s = Address::generate(&env);
    let c = Address::generate(&env);
    let b1 = Address::generate(&env);
    let b2 = Address::generate(&env);
    token::StellarAssetClient::new(&env, &pt).mint(&b1, &10_000i128);
    token::StellarAssetClient::new(&env, &pt).mint(&b2, &10_000i128);
    let aid = create_test_auction(&client, &s, &c, &pt, AuctionFormat::English);
    env.ledger().set_timestamp(env.ledger().timestamp() + 120);
    client.activate_auction(&aid);
    client.place_bid(&aid, &b1, &200i128);
    client.place_bid(&aid, &b2, &205i128);
}

// ═════════════════════════════════════════════════════════════════════════════
//  Dutch Auction
// ═════════════════════════════════════════════════════════════════════════════

#[test]
fn test_dutch_auction_full_flow() {
    let env = Env::default();
    env.mock_all_auths_allowing_non_root_auth();
    let (client, _a, _p, pt, _nft) = setup_contract(&env);
    let s = Address::generate(&env);
    let c = Address::generate(&env);
    let buyer = Address::generate(&env);
    token::StellarAssetClient::new(&env, &pt).mint(&buyer, &10_000i128);
    let aid = create_test_auction(&client, &s, &c, &pt, AuctionFormat::Dutch);
    env.ledger().set_timestamp(env.ledger().timestamp() + 120);
    client.activate_auction(&aid);
    env.ledger().set_timestamp(env.ledger().timestamp() + 140);
    assert_eq!(client.get_dutch_price(&aid), 800);
    client.buy_now(&aid, &buyer);
    let a = client.get_auction(&aid);
    assert_eq!(a.status, AuctionStatus::Ended);
    assert_eq!(a.highest_bid, 800);
    assert_eq!(a.highest_bidder.unwrap(), buyer);
}

#[test]
fn test_dutch_price_below_reserve_floor() {
    let env = Env::default();
    env.mock_all_auths_allowing_non_root_auth();
    let (client, _a, _p, pt, _nft) = setup_contract(&env);
    let s = Address::generate(&env);
    let c = Address::generate(&env);
    let aid = create_test_auction(&client, &s, &c, &pt, AuctionFormat::Dutch);
    env.ledger().set_timestamp(env.ledger().timestamp() + 120);
    client.activate_auction(&aid);
    env.ledger().set_timestamp(env.ledger().timestamp() + 10000);
    assert_eq!(client.get_dutch_price(&aid), 100);
}

// ═════════════════════════════════════════════════════════════════════════════
//  Sealed-Bid Auction
// ═════════════════════════════════════════════════════════════════════════════

#[test]
fn test_sealed_bid_full_flow() {
    let env = Env::default();
    env.mock_all_auths_allowing_non_root_auth();
    let (client, _a, _p, pt, _nft) = setup_contract(&env);
    let s = Address::generate(&env);
    let c = Address::generate(&env);
    let b1 = Address::generate(&env);
    let b2 = Address::generate(&env);
    token::StellarAssetClient::new(&env, &pt).mint(&b1, &10_000i128);
    token::StellarAssetClient::new(&env, &pt).mint(&b2, &10_000i128);

    let aid = create_test_auction(&client, &s, &c, &pt, AuctionFormat::SealedBid);
    env.ledger().set_timestamp(env.ledger().timestamp() + 120);
    client.activate_auction(&aid);

    let salt1 = BytesN::<32>::from_array(&env, &[1u8; 32]);
    let salt2 = BytesN::<32>::from_array(&env, &[2u8; 32]);

    let c1 = compute_hmac_commitment(&env, 300, &salt1, aid, &b1);
    let c2 = compute_hmac_commitment(&env, 500, &salt2, aid, &b2);

    client.commit_bid(&aid, &b1, &c1, &300i128);
    client.commit_bid(&aid, &b2, &c2, &500i128);

    let a = client.get_auction(&aid);
    env.ledger().set_timestamp(a.commit_deadline + 10);

    client.reveal_bid(&aid, &b1, &300i128, &salt1);
    client.reveal_bid(&aid, &b2, &500i128, &salt2);

    env.ledger().set_timestamp(a.reveal_deadline + 10);
    client.close_auction(&aid);

    let a = client.get_auction(&aid);
    assert_eq!(a.status, AuctionStatus::Ended);
    assert_eq!(a.highest_bid, 500);
    assert_eq!(a.highest_bidder.unwrap(), b2);
}

#[test]
#[should_panic(expected = "Commitment verification failed")]
fn test_sealed_bid_wrong_salt_fails() {
    let env = Env::default();
    env.mock_all_auths_allowing_non_root_auth();
    let (client, _a, _p, pt, _nft) = setup_contract(&env);
    let s = Address::generate(&env);
    let c = Address::generate(&env);
    let b = Address::generate(&env);
    token::StellarAssetClient::new(&env, &pt).mint(&b, &10_000i128);
    let aid = create_test_auction(&client, &s, &c, &pt, AuctionFormat::SealedBid);
    env.ledger().set_timestamp(env.ledger().timestamp() + 120);
    client.activate_auction(&aid);

    let salt = BytesN::<32>::from_array(&env, &[1u8; 32]);
    let comm = compute_hmac_commitment(&env, 300, &salt, aid, &b);
    client.commit_bid(&aid, &b, &comm, &300i128);

    let a = client.get_auction(&aid);
    env.ledger().set_timestamp(a.commit_deadline + 10);
    let wrong_salt = BytesN::<32>::from_array(&env, &[99u8; 32]);
    client.reveal_bid(&aid, &b, &300i128, &wrong_salt);
}

#[test]
fn test_sealed_bid_bound_commitment_no_cross_auction_replay() {
    let env = Env::default();
    env.mock_all_auths_allowing_non_root_auth();
    let (client, _a, _p, pt, _nft) = setup_contract(&env);
    let s = Address::generate(&env);
    let c = Address::generate(&env);
    let b = Address::generate(&env);
    token::StellarAssetClient::new(&env, &pt).mint(&b, &20_000i128);

    let aid1 = create_test_auction(&client, &s, &c, &pt, AuctionFormat::SealedBid);
    let aid2 = create_test_auction(&client, &s, &c, &pt, AuctionFormat::SealedBid);
    env.ledger().set_timestamp(env.ledger().timestamp() + 120);
    client.activate_auction(&aid1);
    client.activate_auction(&aid2);

    let salt = BytesN::<32>::from_array(&env, &[1u8; 32]);

    let comm1 = compute_hmac_commitment(&env, 300, &salt, aid1, &b);
    let comm2 = compute_hmac_commitment(&env, 300, &salt, aid2, &b);
    assert!(comm1 != comm2);

    client.commit_bid(&aid1, &b, &comm1, &300i128);
    client.commit_bid(&aid2, &b, &comm2, &300i128);

    let a1 = client.get_auction(&aid1);
    env.ledger().set_timestamp(a1.commit_deadline + 10);
    client.reveal_bid(&aid1, &b, &300i128, &salt);
    client.reveal_bid(&aid2, &b, &300i128, &salt);
}

#[test]
#[should_panic(expected = "Maximum number of bidders reached")]
fn test_sealed_bid_max_bidders_cap() {
    let env = Env::default();
    env.mock_all_auths_allowing_non_root_auth();
    let (client, _a, _p, pt, _nft) = setup_contract(&env);
    let s = Address::generate(&env);
    let c = Address::generate(&env);
    let now = env.ledger().timestamp();
    let start = now + 60;
    let commit = start + 1800;
    let reveal = start + 3600;

    let item = ItemType::Digital(DigitalItem { nft_contract: pt.clone(), token_id: 1 });
    let aid = client.create_auction(&CreateAuctionParams {
        seller: s.clone(), original_creator: c.clone(),
        format: AuctionFormat::SealedBid, item, payment_token: pt.clone(),
        reserve_price: 100, royalty_bps: 500, start_time: start, end_time: reveal,
        metadata_uri: String::from_str(&env, "ipfs://cap"),
        min_increment: 0, start_price: 0, price_decay_per_second: 0,
        commit_deadline: commit, reveal_deadline: reveal, max_bidders: 2,
    });

    env.ledger().set_timestamp(env.ledger().timestamp() + 120);
    client.activate_auction(&aid);

    let b1 = Address::generate(&env);
    let b2 = Address::generate(&env);
    let b3 = Address::generate(&env);
    token::StellarAssetClient::new(&env, &pt).mint(&b1, &10_000i128);
    token::StellarAssetClient::new(&env, &pt).mint(&b2, &10_000i128);
    token::StellarAssetClient::new(&env, &pt).mint(&b3, &10_000i128);

    let salt = BytesN::<32>::from_array(&env, &[1u8; 32]);
    client.commit_bid(&aid, &b1, &compute_hmac_commitment(&env, 100, &salt, aid, &b1), &100i128);
    client.commit_bid(&aid, &b2, &compute_hmac_commitment(&env, 200, &salt, aid, &b2), &200i128);
    client.commit_bid(&aid, &b3, &compute_hmac_commitment(&env, 300, &salt, aid, &b3), &300i128);
}

#[test]
fn test_sealed_bid_refund_unrevealed() {
    let env = Env::default();
    env.mock_all_auths_allowing_non_root_auth();
    let (client, _a, _p, pt, _nft) = setup_contract(&env);
    let s = Address::generate(&env);
    let c = Address::generate(&env);
    let b1 = Address::generate(&env);
    let b2 = Address::generate(&env);
    token::StellarAssetClient::new(&env, &pt).mint(&b1, &10_000i128);
    token::StellarAssetClient::new(&env, &pt).mint(&b2, &10_000i128);

    let aid = create_test_auction(&client, &s, &c, &pt, AuctionFormat::SealedBid);
    env.ledger().set_timestamp(env.ledger().timestamp() + 120);
    client.activate_auction(&aid);

    let salt = BytesN::<32>::from_array(&env, &[1u8; 32]);
    client.commit_bid(&aid, &b1, &compute_hmac_commitment(&env, 300, &salt, aid, &b1), &300i128);
    client.commit_bid(&aid, &b2, &compute_hmac_commitment(&env, 500, &salt, aid, &b2), &500i128);

    let a = client.get_auction(&aid);
    env.ledger().set_timestamp(a.commit_deadline + 10);
    client.reveal_bid(&aid, &b1, &300i128, &salt);

    env.ledger().set_timestamp(a.reveal_deadline + 10);
    client.refund_unrevealed(&aid, &b2);

    let tc = token::TokenClient::new(&env, &pt);
    assert_eq!(tc.balance(&b2), 10_000i128);

    client.close_auction(&aid);
    let a = client.get_auction(&aid);
    assert_eq!(a.status, AuctionStatus::Ended);
    assert_eq!(a.highest_bid, 300);
}

// ═════════════════════════════════════════════════════════════════════════════
//  Royalty
// ═════════════════════════════════════════════════════════════════════════════

#[test]
fn test_royalty_calculation() {
    use crate::royalty;
    let b = royalty::calculate_split(1000, 500, 250);
    assert_eq!(b.royalty_amount, 50);
    assert_eq!(b.platform_fee_amount, 25);
    assert_eq!(b.seller_amount, 925);
    assert_eq!(b.total, 1000);
}

#[test]
fn test_english_auction_royalty_distribution() {
    let env = Env::default();
    env.mock_all_auths_allowing_non_root_auth();
    let (client, _a, pw, pt, _nft) = setup_contract(&env);
    let s = Address::generate(&env);
    let c = Address::generate(&env);
    let b = Address::generate(&env);
    token::StellarAssetClient::new(&env, &pt).mint(&b, &10_000i128);
    // Seller needs exactly 1 token unit for NFT transfer in settle_auction
    token::StellarAssetClient::new(&env, &pt).mint(&s, &1i128);

    let aid = create_test_auction(&client, &s, &c, &pt, AuctionFormat::English);
    env.ledger().set_timestamp(env.ledger().timestamp() + 120);
    client.activate_auction(&aid);
    client.place_bid(&aid, &b, &1000i128);
    env.ledger().set_timestamp(env.ledger().timestamp() + 4000);
    // Must approve BEFORE close — approve_nft_transfer requires Created or Active
    client.approve_nft_transfer(&aid);
    client.close_auction(&aid);
    client.settle_auction(&aid);

    let tc = token::TokenClient::new(&env, &pt);
    assert_eq!(tc.balance(&pw), 25);
    assert_eq!(tc.balance(&c), 50);
    assert_eq!(tc.balance(&s), 925);
}

// ═════════════════════════════════════════════════════════════════════════════
//  Admin / Cancel
// ═════════════════════════════════════════════════════════════════════════════

#[test]
fn test_cancel_auction() {
    let env = Env::default();
    env.mock_all_auths_allowing_non_root_auth();
    let (client, _a, _p, pt, _nft) = setup_contract(&env);
    let s = Address::generate(&env);
    let c = Address::generate(&env);
    let aid = create_test_auction(&client, &s, &c, &pt, AuctionFormat::English);
    client.cancel_auction(&aid);
    assert_eq!(client.get_auction(&aid).status, AuctionStatus::Cancelled);
}

#[test]
fn test_pause_platform() {
    let env = Env::default();
    env.mock_all_auths_allowing_non_root_auth();
    let (client, admin, _p, _pt, _nft) = setup_contract(&env);
    client.update_config(&admin, &Option::None, &Option::None, &Option::Some(true));
    assert!(client.is_paused());
    client.update_config(&admin, &Option::None, &Option::None, &Option::Some(false));
    assert!(!client.is_paused());
}
