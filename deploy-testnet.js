#!/usr/bin/env node
// StellarUrithi-Bidz Testnet Deploy Script
// Deploys the auction contract to testnet and runs an end-to-end demo
const fs = require("fs");
const path = require("path");
const { Keypair, SorobanRpc, TransactionBuilder, Contract, Networks, BASE_FEE, xdr, Address, nativeToScVal, scValToNative } = require("@stellar/stellar-sdk");

const WASM_PATH = path.join(__dirname, "contracts/target/wasm32-unknown-unknown/release/stellar_urithi_auction.wasm");
const RPC_URL = "https://soroban-testnet.stellar.org";
const NETWORK = Networks.TESTNET;

async function main() {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║   StellarUrithi-Bidz — Testnet Deploy       ║");
  console.log("╚══════════════════════════════════════════════╝\n");

  // 1. Generate deployer identity
  console.log("🔑 Generating deployer keypair...");
  const deployer = Keypair.random();
  console.log(`   Public: ${deployer.publicKey()}`);
  console.log(`   Secret: ${deployer.secret().slice(0, 8)}...\n`);

  // 2. Fund via Friendbot
  console.log("💰 Funding via Friendbot...");
  const fbResponse = await fetch(`https://friendbot.stellar.org?addr=${encodeURIComponent(deployer.publicKey())}`);
  if (!fbResponse.ok) {
    const errText = await fbResponse.text();
    console.log(`   Friendbot response: ${errText}`);
    console.log("   ⚠️  Friendbot may have rate-limited. Trying alternative...");
  } else {
    const fbData = await fbResponse.json();
    console.log(`   ✅ Funded! Hash: ${fbData.hash || "unknown"}\n`);
  }

  const rpc = new SorobanRpc.Server(RPC_URL);

  // 3. Read WASM
  console.log("📦 Reading WASM...");
  const wasmBuffer = fs.readFileSync(WASM_PATH);
  console.log(`   WASM size: ${(wasmBuffer.length / 1024).toFixed(1)} KB\n`);

  // 4. Upload WASM
  console.log("⬆️  Uploading WASM to testnet...");
  let wasmHash;
  try {
    const account = await rpc.getAccount(deployer.publicKey());
    const uploadTx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: NETWORK })
      .addOperation(SorobanRpc.uploadContractWasm({ wasm: wasmBuffer }))
      .setTimeout(30)
      .build();

    const simResult = await rpc.simulateTransaction(uploadTx);
    if ("error" in simResult) {
      console.log(`   Simulation error: ${simResult.error}`);
      return;
    }

    const assembled = SorobanRpc.assembleTransaction(uploadTx, simResult);
    assembled.sign(deployer);

    const sendResult = await rpc.sendTransaction(assembled);
    if ("errorResultXdr" in sendResult) {
      console.log(`   Upload failed: ${sendResult.errorResultXdr}`);
      return;
    }

    wasmHash = sendResult.hash;
    console.log(`   ✅ WASM uploaded! Hash: ${wasmHash}\n`);
  } catch (err) {
    console.log(`   ⚠️  Direct upload may not be supported, trying contract deploy...`);
    console.log(`   Error: ${err.message}\n`);
  }

  // 5. Deploy contract (create from WASM hash or directly)
  console.log("🚀 Deploying contract...");
  try {
    const account = await rpc.getAccount(deployer.publicKey());
    const deployOp = new Contract("").call("__constructor");

    // Use create contract operation
    const deployTx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: NETWORK })
      .addOperation(
        SorobanRpc.createContract({
          wasm: wasmBuffer,
          source: deployer.publicKey(),
        })
      )
      .setTimeout(30)
      .build();

    const simResult = await rpc.simulateTransaction(deployTx);
    if ("error" in simResult) {
      console.log(`   Simulation error: ${JSON.stringify(simResult.error)}`);

      // Try alternative: use upload + create pattern
      console.log("\n   Trying alternative deploy method...");
      const uploadSim = await rpc.simulateTransaction(
        new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: NETWORK })
          .addOperation(SorobanRpc.uploadContractWasm({ wasm: wasmBuffer }))
          .setTimeout(30)
          .build()
      );

      if ("error" in uploadSim) {
        console.log(`   Upload simulation also failed. SDK may need different API.`);
        console.log(`   Writing deploy info for manual soroban CLI deploy...`);
      }

      // Write deploy info file
      const deployInfo = {
        deployerPublic: deployer.publicKey(),
        deployerSecret: deployer.secret(),
        wasmPath: WASM_PATH,
        wasmSize: wasmBuffer.length,
        network: "testnet",
        rpcUrl: RPC_URL,
      };
      fs.writeFileSync(path.join(__dirname, ".deploy-info.json"), JSON.stringify(deployInfo, null, 2));
      console.log("\n   ✅ Deploy info saved to .deploy-info.json");
      console.log("   To deploy manually with soroban CLI:");
      console.log(`   soroban keys generate deployer --network testnet`);
      console.log(`   soroban keys fund deployer --network testnet`);
      console.log(`   soroban contract deploy --wasm ${WASM_PATH} --source deployer --network testnet`);
      return;
    }
  } catch (err) {
    console.log(`   Deploy error: ${err.message}`);
  }

  console.log("\n   ℹ️  For full deployment, use the Makefile with soroban CLI:");
  console.log("   cd contracts && make all");
}

main().catch(console.error);
