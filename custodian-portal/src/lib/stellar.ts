// Stellar / Soroban interaction helpers for Custodian Portal

import {
  SorobanRpc,
  TransactionBuilder,
  Networks,
  BASE_FEE,
  Contract,
  Address,
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

export async function computeDocumentHash(file: File): Promise<{ bytes: Uint8Array; hex: string }> {
  const arrayBuffer = await file.arrayBuffer();
  const digestBuffer = await window.crypto.subtle.digest("SHA-256", arrayBuffer);
  const bytes = new Uint8Array(digestBuffer);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return { bytes, hex };
}

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

  // Step 1: Simulate transaction
  const simResponse = await rpc.simulateTransaction(tx);
  if ("error" in simResponse && simResponse.error) {
    throw new Error(`Simulation failed: ${JSON.stringify(simResponse.error)}`);
  }

  // Step 2: Assemble
  const assembledTx = SorobanRpc.assembleTransaction(tx, simResponse);

  // Step 3: Sign via Freighter
  let signedTxXdr: string;
  try {
    const txXdr = assembledTx.build().toXDR();
    const signedResult = await freighterSignTransaction(txXdr, {
      networkPassphrase: NETWORK_PASSPHRASE,
    });
    signedTxXdr = typeof signedResult === "string" ? signedResult : (signedResult as any).signedTxXdr || signedResult;
  } catch (err) {
    if (typeof window !== "undefined" && (window as any).freighter?.signTransaction) {
      const txXdr = assembledTx.build().toXDR();
      const signedResult = await (window as any).freighter.signTransaction(txXdr, {
        networkPassphrase: NETWORK_PASSPHRASE,
      });
      signedTxXdr = (signedResult as any).signedTxXdr || signedResult;
    } else {
      throw new Error(`Freighter signing failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Step 4: Submit
  const signedTransaction = TransactionBuilder.fromXDR(signedTxXdr, NETWORK_PASSPHRASE);
  const sendResponse = await rpc.sendTransaction(signedTransaction);

  if ("errorResultXdr" in sendResponse && sendResponse.errorResultXdr) {
    throw new Error(`Transaction failed: ${sendResponse.errorResultXdr}`);
  }

  const txHash = sendResponse.hash;
  if (!txHash) {
    throw new Error("Transaction submission returned unexpected response");
  }

  // Step 5: Poll status
  let status: string = sendResponse.status;
  let attempts = 0;
  while (status === "PENDING" && attempts < 15) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    attempts++;
    try {
      const txResult = await rpc.getTransaction(txHash);
      status = String(txResult.status);
      if (status === "SUCCESS") return { txHash, result: txResult };
      if (status === "FAILED") throw new Error(`Transaction ${txHash} failed on-chain`);
    } catch (pollErr: any) {
      if (pollErr.message && pollErr.message.includes("failed on-chain")) throw pollErr;
    }
  }

  return { txHash, result: sendResponse };
}

export function addressToScVal(address: string): xdr.ScVal {
  return new Address(address).toScVal();
}

export function u64ToScVal(value: bigint): xdr.ScVal {
  return nativeToScVal(value, { type: "u64" });
}

export function bytesNToScVal(bytes: Uint8Array): xdr.ScVal {
  return nativeToScVal(bytes, { type: "bytes" });
}
