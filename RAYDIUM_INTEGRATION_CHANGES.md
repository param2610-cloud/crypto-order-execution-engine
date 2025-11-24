# Raydium Integration Changes

## Overview
Updated the order execution engine to use the working Raydium CPMM swap implementation provided by the user. The key changes ensure proper slippage handling and transaction building.

## Key Changes Made

### 1. **Raydium Client** (`src/dex/raydium.client.ts`)

#### SDK Initialization
- **Before**: Used `cluster: 'devnet'` and `blockhashCommitment: 'finalized'`
- **After**: Uses `cluster: 'devnet' as any`, `disableFeatureCheck: true`, and `disableLoadToken: false`

```typescript
this.raydium = await Raydium.load({
  owner: getWallet(),
  connection: getConnection(),
  cluster: 'devnet' as any,
  disableFeatureCheck: true,
  disableLoadToken: false,
});
```

#### Pool Loading Strategy
- **Before**: Only used `raydium.cpmm.getPoolInfoFromRpc()`
- **After**: First fetches pool via API, then gets RPC data for reserves

```typescript
const poolData = await raydium.api.fetchPoolById({ ids: poolId });
const poolInfo = poolData[0];
const rpcResponse = await raydium.cpmm.getPoolInfoFromRpc(poolPubkey);
```

#### Critical Slippage Fix
- **Before**: Simulated swap, then passed both `swapResult.outputAmount` and `slippage` to SDK
- **After**: Uses `quote.minOut` (which already includes slippage) as `outputAmount`, and passes `slippage: 0` to SDK

This is the **most important change** - the working code revealed that the slippage should be baked into the `minOutputAmount`, not passed as a separate parameter.

```typescript
// Old approach (incorrect):
const swapResult = this.simulateSwap(...);
await raydium.cpmm.swap({
  swapResult: {
    outputAmount: swapResult.outputAmount, // raw simulation output
  },
  slippage: slippageFraction, // SDK applies slippage again!
});

// New approach (correct):
const minOutputAmount = this.amountToBn(quote.minOut); // already includes slippage
await raydium.cpmm.swap({
  swapResult: {
    outputAmount: minOutputAmount, // min output with slippage applied
  },
  slippage: 0, // Don't double-apply slippage!
});
```

#### Transaction Version
- **Before**: Used `TxVersion.LEGACY`
- **After**: Uses `TxVersion.V0` (VersionedTransaction)

#### Removed ATA Pre-creation
- The working code doesn't manually create ATAs before the swap
- The Raydium SDK handles this internally

### 2. **Solana Helper** (`src/dex/solana.ts`)

#### VersionedTransaction Support
Added support for both legacy `Transaction` and `VersionedTransaction` in the `sendAndConfirm` function:

```typescript
export const sendAndConfirm = async (
  transaction: Transaction | VersionedTransaction, 
  options?: SendAndConfirmOptions
): Promise<string> => {
  // ...
  if (transaction instanceof VersionedTransaction) {
    transaction.sign([wallet, ...signers]);
    signature = await connection.sendTransaction(transaction, {
      skipPreflight: false,
      maxRetries: 3,
    });
  } else {
    // Legacy transaction handling
  }
  // ...
}
```

### 3. **Router Interface** (`src/dex/router.interface.ts`)

Updated the `BuiltTransaction` interface to support both transaction types:

```typescript
export interface BuiltTransaction {
  transaction: Transaction | VersionedTransaction;
  signers: Signer[];
}
```

### 4. **Test Script** (`scripts/test-raydium-swap.ts`)

Created a standalone test script that mirrors the exact working code provided, allowing verification of:
- SDK initialization
- Pool fetching
- Slippage calculation
- Transaction building and submission
- Balance verification

## Pool Configuration

The Raydium client is configured to use:
```typescript
const DEVNET_RAYDIUM_POOLS: string[] = [
  "AWVFpbFFnx2VkwLh5FrkFAjkxvTu8tFQYALm4tuN8wqd",
];
```

## Testing

Run the standalone test:
```bash
npx tsx scripts/test-raydium-swap.ts
```

Run the full order execution engine:
```bash
npm run dev
```

## Environment Variables Required

```env
WALLET_PRIVATE_KEY=<base58-encoded-keypair>
SOLANA_RPC_URL=https://api.devnet.solana.com
```

## Expected Behavior

1. Order received via HTTP POST to `/api/orders`
2. WebSocket upgrade with order ID
3. Order queued in BullMQ
4. Worker dequeues and routes through Raydium/Meteora
5. Best quote selected (Raydium with correct slippage)
6. Transaction built with `TxVersion.V0`
7. Transaction signed and submitted to devnet
8. Confirmation awaited
9. WebSocket events stream status updates:
   - `queued`
   - `routing`
   - `building`
   - `submitted` (with signature)
   - `confirmed` (with signature)

## Key Learnings

1. **Slippage must not be double-applied**: Calculate min output with slippage, then pass `slippage: 0` to SDK
2. **Use API for pool metadata**: `fetchPoolById()` provides better pool information than RPC alone
3. **V0 transactions**: Modern Raydium swaps use VersionedTransaction format
4. **SDK configuration matters**: `disableFeatureCheck` and `disableLoadToken` flags are important for devnet
