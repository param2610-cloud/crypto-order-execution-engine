import { PublicKey, Connection } from '@solana/web3.js';
import { Raydium } from '@raydium-io/raydium-sdk-v2';

async function main() {
  const RPC = "https://api.devnet.solana.com";
  const poolIdStr = process.argv[2];
  if (!poolIdStr) {
    console.error("Usage: ts-node scripts/inspect-pool.ts <POOL_PUBKEY>");
    process.exit(1);
  }

  const poolPubkey = new PublicKey(poolIdStr);
  const connection = new Connection(RPC, "confirmed");

  console.log("Loading Raydium...");
  const raydium = await Raydium.load({
    connection,
    cluster: "devnet",
    disableFeatureCheck: true,            // ok
    urlConfigs: { BASE_HOST: "https://api-v3-devnet.raydium.io" },
  });

  console.log("\nRaydium loaded.");
  console.log("\nTrying CPMM...");

  // ---- Try CPMM ----
  try {
    const cpmmInfo = await (raydium as any).cpmm.getRpcPoolInfo(poolPubkey);
    console.log("\n=== CPMM POOL DETECTED ===");
    console.log("mintA:", cpmmInfo.mintA?.toBase58?.());
    console.log("mintB:", cpmmInfo.mintB?.toBase58?.());
    console.log("baseReserve:", cpmmInfo.baseReserve?.toString?.());
    console.log("quoteReserve:", cpmmInfo.quoteReserve?.toString?.());
  } catch (err) {
    console.log("CPMM failed:", (err as any)?.message ?? err);
  }

  console.log("\nFetching raw account...");
  const raw = await connection.getAccountInfo(poolPubkey);
  if (!raw) {
    console.log("RAW ACCOUNT NOT FOUND");
  } else {
    console.log("lamports:", raw.lamports);
    console.log("owner:", raw.owner.toBase58());
    console.log("data length:", raw.data.length);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
});
