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
import { signTransaction as freighterSignTransaction } from "@stellar/freighter-api";

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
// Polls until the transaction status is confirmed.

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
  if ("error" in simResponse && simResponse.error) {
    throw new Error(`Simulation failed: ${JSON.stringify(simResponse.error)}`);
  }

  // Step 2: Assemble the transaction with simulation results
  const assembledTx = SorobanRpc.assembleTransaction(tx, simResponse);

  // Step 3: Sign via Freighter wallet
  let signedTxXdr: string;
  try {
    const txXdr = assembledTx.build().toXDR();
    const signedResult = await freighterSignTransaction(txXdr, {
      networkPassphrase: NETWORK_PASSPHRASE,
    });
    signedTxXdr = typeof signedResult === "string" ? signedResult : (signedResult as any).signedTxXdr || signedResult;
  } catch (err) {
    // Fallback to window.freighter if extension injected global
    if (typeof window !== "undefined" && (window as any).freighter?.signTransaction) {
      const txXdr = assembledTx.build().toXDR();
      const signedResult = await (window as any).freighter.signTransaction(txXdr, {
        networkPassphrase: NETWORK_PASSPHRASE,
      });
      signedTxXdr = (signedResult as any).signedTxXdr || signedResult;
    } else {
      throw new Error(
        `Freighter signing failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // Step 4: Submit the signed transaction
  const signedTransaction = TransactionBuilder.fromXDR(signedTxXdr, NETWORK_PASSPHRASE);
  const sendResponse = await rpc.sendTransaction(signedTransaction);

  if ("errorResultXdr" in sendResponse && sendResponse.errorResultXdr) {
    throw new Error(`Transaction failed: ${sendResponse.errorResultXdr}`);
  }

  const txHash = sendResponse.hash;
  if (!txHash) {
    throw new Error("Transaction submission returned unexpected response");
  }

  // Step 5: Poll transaction status until confirmed (up to 30 seconds)
  let status = sendResponse.status;
  let attempts = 0;
  while (status === "PENDING" && attempts < 15) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    attempts++;
    try {
      const txResult = await rpc.getTransaction(txHash);
      status = txResult.status;
      if (status === "SUCCESS") {
        return { txHash, result: txResult };
      }
      if (status === "FAILED") {
        throw new Error(`Transaction ${txHash} failed on-chain`);
      }
    } catch (pollErr: any) {
      if (pollErr.message && pollErr.message.includes("failed on-chain")) {
        throw pollErr;
      }
    }
  }

  return {
    txHash,
    result: sendResponse,
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

export function boolToScVal(value: boolean): xdr.ScVal {
  return nativeToScVal(value, { type: "bool" });
}

export function bytesNToScVal(bytes: Uint8Array): xdr.ScVal {
  return nativeToScVal(bytes, { type: "bytes" });
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
