//! Escrow module — handles bid fund locking and refunds.
//! All bid amounts are held in the auction contract escrow until auction resolution.

use soroban_sdk::{token, Address, Env};

/// Transfer bid funds from bidder into the auction contract escrow.
/// Returns the token client for subsequent operations.
/// Lock bid funds from bidder into the auction contract escrow.
///
/// NOTE: Caller (place_bid, commit_bid, buy_now) MUST call bidder.require_auth()
/// BEFORE invoking lock_bid. soroban-sdk v22 rejects duplicate require_auth()
/// calls for the same address within a single call tree (Error(Auth, ExistingValue)).
pub fn lock_bid(env: &Env, payment_token: &Address, bidder: &Address, amount: i128) {
    let token_client = token::Client::new(env, payment_token);
    token_client.transfer(bidder, &env.current_contract_address(), &amount);
}

/// Refund a previously-locked bid amount back to the bidder.
/// Called when a higher bid displaces the previous highest bidder (English auction).
pub fn refund_bid(env: &Env, payment_token: &Address, bidder: &Address, amount: i128) {
    let token_client = token::Client::new(env, payment_token);
    token_client.transfer(&env.current_contract_address(), bidder, &amount);
}

/// Refund all sealed-bid participants who did not win.
/// Called after winner is determined in sealed-bid reveal phase.
#[allow(dead_code)]
pub fn refund_losing_sealed_bids(
    env: &Env,
    payment_token: &Address,
    bidders_and_amounts: &[(Address, i128)],
) {
    let token_client = token::Client::new(env, payment_token);
    for (bidder, amount) in bidders_and_amounts {
        token_client.transfer(&env.current_contract_address(), bidder, amount);
    }
}
