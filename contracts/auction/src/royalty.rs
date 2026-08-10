//! Royalty-split module — distributes proceeds on auction settlement.
//!
//! On every hammer sale, the winning bid is split three ways:
//! 1. Seller receives the net proceeds (winning_bid - royalty - platform_fee).
//! 2. Original creator receives royalty (winning_bid * royalty_bps / 10_000).
//! 3. Platform receives fee (winning_bid * platform_fee_bps / 10_000).
//!
//! This directly delivers one of Afristore's roadmap items: auto-royalty payments.

use soroban_sdk::{token, Address, Env};

/// Breakdown of proceeds from a settled auction.
/// `total` is stored for audit/event purposes but not read in distribution logic.
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct ProceedsBreakdown {
    pub seller_amount: i128,
    pub royalty_amount: i128,
    pub platform_fee_amount: i128,
    pub total: i128,
}

/// Calculate the royalty and fee split for a given winning bid.
/// All bps values are in basis points (1/100th of a percent).
/// Panics on arithmetic overflow since these are financial calculations.
pub fn calculate_split(
    winning_bid: i128,
    royalty_bps: u32,
    platform_fee_bps: u32,
) -> ProceedsBreakdown {
    let royalty_amount = winning_bid
        .checked_mul(royalty_bps as i128)
        .expect("Royalty calculation overflow")
        .checked_div(10_000)
        .expect("Royalty division overflow");

    let platform_fee_amount = winning_bid
        .checked_mul(platform_fee_bps as i128)
        .expect("Platform fee calculation overflow")
        .checked_div(10_000)
        .expect("Platform fee division overflow");

    let seller_amount = winning_bid
        .checked_sub(royalty_amount)
        .expect("Seller amount underflow")
        .checked_sub(platform_fee_amount)
        .expect("Seller amount underflow after fees");

    ProceedsBreakdown {
        seller_amount,
        royalty_amount,
        platform_fee_amount,
        total: winning_bid,
    }
}

/// Distribute the winning bid according to the royalty split.
/// Transfers from the auction contract escrow to each party.
pub fn distribute_proceeds(
    env: &Env,
    payment_token: &Address,
    seller: &Address,
    original_creator: &Address,
    platform_wallet: &Address,
    breakdown: &ProceedsBreakdown,
) {
    let token_client = token::Client::new(env, payment_token);
    let contract_address = env.current_contract_address();

    // Transfer seller proceeds
    if breakdown.seller_amount > 0 {
        token_client.transfer(&contract_address, seller, &breakdown.seller_amount);
    }

    // Transfer royalty to original creator
    if breakdown.royalty_amount > 0 {
        token_client.transfer(
            &contract_address,
            original_creator,
            &breakdown.royalty_amount,
        );
    }

    // Transfer platform fee
    if breakdown.platform_fee_amount > 0 {
        token_client.transfer(
            &contract_address,
            platform_wallet,
            &breakdown.platform_fee_amount,
        );
    }
}
