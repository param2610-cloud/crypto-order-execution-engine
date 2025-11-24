# Quick Start Guide - Updated Raydium Integration

## Prerequisites

1. **Environment Variables** - Create/update `.env`:
```env
# Database
POSTGRES_URL=postgresql://postgres:postgres@localhost:5432/order_history

# Solana Configuration
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_COMMITMENT=confirmed
WALLET_PRIVATE_KEY=<your-base58-encoded-private-key>

# Redis Configuration
REDIS_HOST=127.0.0.1
REDIS_PORT=6379

# Server Configuration
PORT=8080
NODE_ENV=development

# Trading Configuration
SLIPPAGE=0.10
```

2. **Redis Server Running**:
```powershell
# If using Docker:
docker run -d -p 6379:6379 redis:alpine

# Or install Redis on Windows and start the service
```

## Installation

```powershell
npm install
```

## Running the Application

### Option 1: Full Order Execution Engine

```powershell
# Start the server with hot reload
npm run dev
```

The server will:
- Start Fastify HTTP server on port 8080
- Initialize WebSocket manager
- Connect to Redis
- Start BullMQ worker with concurrency 10
- Initialize Raydium and Meteora clients

### Option 2: Standalone Test Script

Test just the Raydium swap logic:

```powershell
npx tsx scripts/test-raydium-swap.ts
```

This script:
- Connects directly to devnet
- Initializes Raydium SDK
- Fetches pool info
- Builds and submits a swap transaction
- Shows detailed logs and transaction results

## Testing the Order Flow

### 1. Submit an Order

```powershell
curl -X POST http://localhost:8080/api/orders `
  -H "Content-Type: application/json" `
  -H "Connection: Upgrade" `
  -H "Upgrade: websocket" `
  -d '{
    \"tokenIn\": \"7667oZyeKhXWkFXma7zP9rXhSspbHqVSAXfNVSiwZaJx\",
    \"tokenOut\": \"52oX2aHhnhN8vYbtAhDLGjFKE1eEpNuu1Y3U2t4ALRQT\",
    \"amount\": 10,
    \"orderType\": \"market\"
  }'
```

### 2. Monitor WebSocket Events

The WebSocket connection will receive status updates:

```json
{"status": "queued", "orderId": "ord_abc123", "timestamp": 1234567890}
{"status": "routing", "orderId": "ord_abc123", "timestamp": 1234567891}
{"status": "building", "orderId": "ord_abc123", "timestamp": 1234567892}
{"status": "submitted", "orderId": "ord_abc123", "detail": "5xYz...", "timestamp": 1234567893}
{"status": "confirmed", "orderId": "ord_abc123", "detail": "5xYz...", "timestamp": 1234567895}
```

## Debug Scripts

### Inspect Pool Data

```powershell
npx tsx scripts/inspect-pool.ts AWVFpbFFnx2VkwLh5FrkFAjkxvTu8tFQYALm4tuN8wqd
```

### Debug Pool Reserves

```powershell
npx tsx scripts/debug-pools.ts
```

## Key Implementation Details

### Pool Configuration
Currently configured for the devnet pool:
- **Pool ID**: `AWVFpbFFnx2VkwLh5FrkFAjkxvTu8tFQYALm4tuN8wqd`
- **Token In**: `7667oZyeKhXWkFXma7zP9rXhSspbHqVSAXfNVSiwZaJx`
- **Token Out**: `52oX2aHhnhN8vYbtAhDLGjFKE1eEpNuu1Y3U2t4ALRQT`

### Slippage Handling
The critical fix applied:
- Quote calculation includes slippage in `minOut`
- Transaction builder uses `minOut` directly
- SDK receives `slippage: 0` to prevent double-application

### Transaction Format
- Uses **VersionedTransaction (V0)** for modern Solana features
- Automatically handles transaction signing and submission
- Supports both legacy and V0 transactions in the pipeline

## Troubleshooting

### "Transaction simulation failed"
- Check your wallet has sufficient SOL (need ~0.01 SOL for fees)
- Verify token accounts exist for both input and output tokens
- Check RPC endpoint is responsive

### "Pool not found"
- Ensure using devnet pools
- Verify pool ID is correct
- Check Raydium API is accessible

### "WebSocket connection failed"
- Ensure HTTP → WebSocket upgrade headers are correct
- Check no proxy blocking WebSocket upgrade
- Verify Redis is running (queue depends on it)

### "Rate limit exceeded"
- Default: 100 jobs/min
- Adjust in `src/config/env.ts` if needed
- Wait 60 seconds for rate limit window to reset

## Expected Transaction Flow

1. **HTTP POST** → Order created, WebSocket upgraded
2. **Queue** → Order added to BullMQ with retry logic
3. **Worker** → Dequeues order (concurrency: 10)
4. **Routing** → Queries Raydium + Meteora for quotes
5. **Best Route** → Selects DEX with highest output
6. **Build TX** → Constructs VersionedTransaction with correct slippage
7. **Submit** → Signs and sends to Solana devnet
8. **Confirm** → Waits for finalization
9. **WebSocket** → Streams status at each step

## Logs

Application logs show:
- DEX routing decisions with quote comparisons
- Transaction signatures with explorer links
- Pool selection and reserve information
- Queue processing metrics

Example log:
```json
{
  "level": "info",
  "event": "DEX_ROUTE",
  "orderId": "ord_abc123",
  "bestDex": "raydium",
  "raydiumQuote": {
    "estimatedOut": "4990000000",
    "minOut": "4491000000",
    "feeBps": 25,
    "priceImpactBps": 0
  }
}
```

## Architecture

```
HTTP POST → WebSocket Upgrade
     ↓
Order Controller
     ↓
Order Queue (BullMQ)
     ↓
Order Worker (concurrency: 10)
     ↓
DEX Router (Raydium + Meteora)
     ↓
Best Quote Selected
     ↓
Transaction Builder (V0)
     ↓
Solana devnet Submission
     ↓
WebSocket Status Stream
```

## Next Steps

- Add more devnet pools to `DEVNET_RAYDIUM_POOLS`
- Implement Meteora client with similar pattern
- Add price oracle integration
- Enhance retry logic for network failures
- Add transaction receipt parsing
