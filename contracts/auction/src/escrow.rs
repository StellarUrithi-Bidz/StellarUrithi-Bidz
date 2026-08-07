//! Escrow module — handles bid fund locking and refunds.
//! All bid amounts are held in the auction contract escrow until auction resolution.

use soroban_sdk::{Address, Env, token};

/// Transfer bid funds from bidder into the auction contract escrow.
/// Returns the token client for subsequent operations.
pub fn lock_bid(
    env: &Env,
    payment_token: &Address,
    bidder: &Address,
    amount: i128,
) {
    bidder.require_auth();

    let token_client = token::Client::new(env, payment_token);
    token_client.transfer(
        bidder,
        &env.current_contract_address(),
        &amount,
    );
}

/// Refund a previously-locked bid amount back to the bidder.
/// Called when a higher bid displaces the previous highest bidder (English auction).
pub fn refund_bid(
    env: &Env,
    payment_token: &Address,
    bidder: &Address,
    amount: i128,
) {
    let token_client = token::Client::new(env, payment_token);
    token_client.transfer(
        &env.current_contract_address(),
        bidder,
        &amount,
    );
}

/// Refund all sealed-bid participants who did not win.
/// Called after winner is determined in sealed-bid reveal phase.
pub fn refund_losing_sealed_bids(
    env: &Env,
    payment_token: &Address,
    bidders_and_amounts: &[(Address, i128)],
) {
    let token_client = token::Client::new(env, payment_token);
    for (bidder, amount) in bidders_and_amounts {
        token_client.transfer(
            &env.current_contract_address(),
            bidder,
            amount,
        );
    }
}
