// Stellar / Soroban interaction helpers
// Provides contract invocation, transaction building, and asset utilities.

import {
  SorobanRpc,
  TransactionBuilder,
  Networks,
  BASE_FEE,
  Contract,
  Address,
  scValToNative,
  nativeToScVal,
  xdr,
} from "@stellar/stellar-sdk";

const NETWORK_PASSPHRASE =
  process.env.NEXT_PUBLIC_STELLAR_NETWORK === "mainnet"
    ? Networks.PUBLIC
    : Networks.TESTNET;

const RPC_URL =
  process.env.NEXT_PUBLIC_STELLAR_NETWORK === "mainnet"
    ? "https://soroban.stellar.org"
    : "https://soroban-testnet.stellar.org";

const CONTRACT_ID = process.env.NEXT_PUBLIC_CONTRACT_ID || "";

export function getContractId(): string {
  return CONTRACT_ID;
}

export function getNetworkPassphrase(): string {
  return NETWORK_PASSPHRASE;
}

export function getRpcUrl(): string {
  return RPC_URL;
}

// ── Contract Invocation ───────────────────────────────────────────────────────────
// Complete flow: builds, simulates, signs via Freighter, and submits to Stellar.
// Uses Freighter's signTransaction() for the user signature and SorobanRpc's
// sendTransaction() for submission. Returns the transaction hash for tracking.

export async function invokeContract(
  method: string,
  args: xdr.ScVal[],
  signerAddress: string
): Promise<{ txHash: string; result: unknown }> {
  const rpc = new SorobanRpc.Server(RPC_URL);
  const contract = new Contract(CONTRACT_ID);

  const sourceAccount = await rpc.getAccount(signerAddress);

  const tx = new TransactionBuilder(sourceAccount, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();

  // Step 1: Simulate the transaction to get the proper resource fees
  const simResponse = await rpc.simulateTransaction(tx);
  if ("error" in simResponse) {
    throw new Error(`Simulation failed: ${JSON.stringify(simResponse.error)}`);
  }

  // Step 2: Assemble the transaction with simulation results
  const assembledTx = SorobanRpc.assembleTransaction(tx, simResponse);

  // Step 3: Sign via Freighter wallet
  let signedTxXdr: string;
  try {
    // @ts-expect-error Freighter injects window.freighter at runtime
    const freighter = window.freighter;
    if (!freighter?.signTransaction) {
      throw new Error("Freighter wallet not detected. Please install the Freighter extension.");
    }
    const signedResult = await freighter.signTransaction(
      assembledTx.build().toEnvelope().toXDR('base64'),
      { networkPassphrase: NETWORK_PASSPHRASE }
    );
    signedTxXdr = signedResult.signedTxXdr || signedResult;
  } catch (err) {
    throw new Error(
      `Freighter signing failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // Step 4: Submit the signed transaction
  const sendResponse = await rpc.sendTransaction(signedTxXdr);

  if ("errorResultXdr" in sendResponse && sendResponse.errorResultXdr) {
    throw new Error(`Transaction failed: ${sendResponse.errorResultXdr}`);
  }

  if ("hash" in sendResponse && sendResponse.hash) {
    return {
      txHash: sendResponse.hash,
      result: sendResponse,
    };
  }

  throw new Error("Transaction submission returned unexpected response");
}

// ── Type Converters ───────────────────────────────────────────────────────────────

export function addressToScVal(address: string): xdr.ScVal {
  return new Address(address).toScVal();
}

export function i128ToScVal(value: bigint): xdr.ScVal {
  return nativeToScVal(value, { type: "i128" });
}

export function u64ToScVal(value: bigint): xdr.ScVal {
  return nativeToScVal(value, { type: "u64" });
}

export function u32ToScVal(value: number): xdr.ScVal {
  return nativeToScVal(value, { type: "u32" });
}

export function stringToScVal(value: string): xdr.ScVal {
  return nativeToScVal(value, { type: "string" });
}

// ── Event Parsing ─────────────────────────────────────────────────────────────────

export function parseAuctionEvent(topics: xdr.ScVal[], data: xdr.ScVal): {
  eventType: string;
  auctionId: number;
  payload: Record<string, unknown>;
} {
  const eventType = scValToNative(topics[0]) as string;
  const auctionId = Number(scValToNative(topics[1]));
  const payload = scValToNative(data) as Record<string, unknown>;

  return { eventType, auctionId, payload };
}

// ── Format Helpers ────────────────────────────────────────────────────────────────

export function formatStroops(amount: string | number): string {
  const num = typeof amount === "string" ? BigInt(amount) : BigInt(amount);
  // XLM has 7 decimal places; adjust for other tokens
  const divisor = BigInt(10_000_000);
  const whole = num / divisor;
  const remainder = num % divisor;
  const remainderStr = remainder.toString().padStart(7, "0");
  const trimmed = remainderStr.replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole.toString();
}

export function formatAddress(addr: string, chars = 4): string {
  if (!addr) return "";
  return `${addr.slice(0, chars + 2)}...${addr.slice(-chars)}`;
}

export function formatTimeRemaining(endTime: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = endTime - now;

  if (diff <= 0) return "Ended";

  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  const seconds = diff % 60;

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function bpsToPercentage(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}
