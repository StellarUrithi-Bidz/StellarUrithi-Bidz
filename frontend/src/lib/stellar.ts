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
// NOTE: This is the transaction-building layer. For production, integrate with
// @stellar/freighter-api's signTransaction() and the SorobanRpc.sendTransaction()
// to complete the sign-and-submit flow. The current implementation prepares the
// transaction XDR — the caller is responsible for passing it to Freighter for signing
// and then submitting the signed envelope to the Stellar network.

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

  const preparedTx = rpc.prepareTransaction(tx);

  // Production integration point:
  // 1. Serialize preparedTx to XDR
  // 2. Pass to Freighter's signTransaction() for user signature
  // 3. Submit signed envelope via rpc.sendTransaction()
  // 4. Return the txHash from the submission response

  return {
    txHash: "",
    result: preparedTx,
  };
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
