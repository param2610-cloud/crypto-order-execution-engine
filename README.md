# Order Execution Engine

A high-performance, production-ready order execution engine for Solana DEX trading, built with Node.js, TypeScript, and modern web technologies. Supports real-time WebSocket streaming, queue-based processing, and integration with Raydium and Meteora DEXes.

## 🚀 Features

- **Market Orders**: Execute market orders on Solana devnet with optimal DEX routing
- **Real-time WebSocket Streaming**: Live status updates for order lifecycle
- **Queue-based Processing**: BullMQ with Redis for reliable, concurrent order processing
- **DEX Routing**: Automatic best-route selection between Raydium and Meteora
- **Slippage Protection**: Configurable slippage handling with minimum output guarantees
- **Transaction Monitoring**: Full transaction lifecycle tracking with Solana explorer links
- **Error Handling**: Comprehensive error handling with retry logic and graceful failures
- **Clean Architecture**: Modular, testable codebase following Clean Architecture principles
- **Order History**: PostgreSQL-backed audit trail with REST + UI access

## 🎯 Order Type Decision

We intentionally focused on **market orders** because real-time execution + routing showcases the hardest parts of the assignment (DEX discovery, queue orchestration, and WS streaming). Market orders are also the backbone for limit/sniper features: limit orders reuse the same validation + queue path but add price triggers before dispatch, while sniper orders plug into the same router once a token-listing event flips them from `pending` to `routing`.

- **Extending to Limit Orders**: Store desired price + condition in Postgres, requeue jobs when on-chain price >= target, then reuse the current worker pipeline unchanged.
- **Extending to Sniper Orders**: Ingest launch/migration events (Meteora, Pump, etc.), hydrate the same `MarketOrderInput`, and dispatch through the existing BullMQ worker so routing + devnet execution stay identical.

## 🎨 Frontend

A React-based UI for order execution with real-time WebSocket updates.
- **Live Demo**: https://crypto-order-execution-engine.vercel.app/
- **Features**: Concurrent order submission, live status tracking, DEX routing logs
- **Technologies**: React, Vite, WebSocket client
- **Location**: `frontend/` folder

## 🏗️ Architecture & Design Decisions

### Clean Architecture
The codebase follows Clean Architecture principles with clear separation of concerns:
- **Controllers**: Handle HTTP/WebSocket requests and responses
- **Services**: Business logic for order processing
- **Queues**: Asynchronous job processing with BullMQ
- **DEX Layer**: Abstraction for different DEX integrations (Raydium, Meteora)
- **Utils**: Shared utilities and helpers

### Technology Choices
- **Fastify**: High-performance web framework with built-in WebSocket support
- **BullMQ**: Robust queue system with Redis backend for job processing
- **TypeScript**: Type safety and better developer experience
- **Pino**: Structured logging for production monitoring
- **Raydium SDK v2**: Official SDK for Raydium DEX integration
- **Meteora SDK**: Dynamic AMM SDK for Meteora pools

### Key Design Decisions
- **WebSocket Lifecycle**: Single HTTP endpoint with automatic upgrade to WebSocket for order tracking
- **Queue Concurrency**: Configurable concurrency (default: 10) with rate limiting (100 jobs/min)
- **DEX Routing**: Best-quote selection based on estimated output, considering fees and price impact
- **Transaction Format**: Uses VersionedTransaction (V0) for modern Solana features
- **Error Tolerance**: Exponential backoff retries for transient failures
- **Modular DEX Clients**: Easy to extend with new DEX integrations

## 📋 Prerequisites

- Node.js 18+
- Redis server
- Solana devnet wallet with SOL for fees
- npm or yarn

## 🛠️ Setup Instructions

### 1. Clone and Install
```bash
git clone <repository-url>
cd order-execution-engine
npm install
```

### 2. Environment Configuration
Create a `.env` file in the root directory:
```env
# Database
POSTGRES_URL=postgresql://postgres:postgres@localhost:5432/order_history
POSTGRES_POOL_MAX=10
POSTGRES_IDLE_TIMEOUT_MS=30000

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
SLIPPAGE=0.01
```

### 3. Start Redis
```bash
# Using Docker
docker run -d -p 6379:6379 redis:alpine

# Or install Redis locally and start the service
```

### 4. Run the Application
```bash
npm run dev
```

The server will start on `http://localhost:8080` with hot reload enabled.

## 📖 Usage

### Live Demo
- **Frontend**: https://crypto-order-execution-engine.vercel.app/
- **Backend API**: https://crypto-order-execution-engine-production.up.railway.app
- **History Tab**: Track persisted executions under the `History` navigation item

### Submit an Order (HTTP only)
```bash
curl -X POST https://crypto-order-execution-engine-production.up.railway.app/api/orders/execute \
  -H "Content-Type: application/json" \
  -d '{
    "tokenIn": "7667oZyeKhXWkFXma7zP9rXhSspbHqVSAXfNVSiwZaJx",
    "tokenOut": "52oX2aHhnhN8vYbtAhDLGjFKE1eEpNuu1Y3U2t4ALRQT",
    "amount": 10,
    "orderType": "market"
  }'
```

### Monitor via WebSocket
Connect to the WebSocket endpoint with the orderId:
```javascript
const ws = new WebSocket('wss://crypto-order-execution-engine-production.up.railway.app/api/orders/execute?orderId=YOUR_ORDER_ID');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Order status:', data);
};
```

### Expected WebSocket Messages
```json
{"orderId":"abc123","status":"pending"}
{"orderId":"abc123","status":"queued"}
{"orderId":"abc123","status":"routing"}
{"orderId":"abc123","status":"building"}
{"orderId":"abc123","status":"submitted","detail":"signature","link":"https://explorer.solana.com/tx/..."}
{"orderId":"abc123","status":"confirmed","detail":"signature","link":"https://explorer.solana.com/tx/..."}

### Single-Connection Upgrade (POST → WebSocket)

Clients that set `Connection: Upgrade` and `Upgrade: websocket` on the initial `POST /api/orders/execute` request will reuse the same TCP connection for streaming updates. The server validates the JSON body, returns the `orderId` via headers, hijacks the socket, and begins pushing lifecycle events without requiring a follow-up GET request. Example (Undici):

```javascript
import { request } from 'undici';

const { socket } = await request('https://crypto-order-execution-engine-production.up.railway.app/api/orders/execute', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Connection': 'Upgrade',
    'Upgrade': 'websocket'
  },
  body: JSON.stringify(orderPayload),
  upgrade: 'websocket'
});

socket.on('message', (message) => {
  console.log('status update', message.toString());
});
```

### Verify the POST Upgrade Flow

Run the provided script to ensure your deployment (local or remote) allows POST-based upgrades through whatever proxies/CDNs sit in front of it:

```bash
npm run verify:upgrade # defaults to http://localhost:8080
# or point to prod
TARGET_URL=https://crypto-order-execution-engine-production.up.railway.app npm run verify:upgrade
```

The script sends the JSON payload, expects an HTTP `101 Switching Protocols`, and logs the raw WebSocket frame bytes it receives before closing the socket.

> **Browser compatibility**: The POST-upgrade handshake currently requires a low-level HTTP client (Node.js, curl, etc.). Browsers cannot issue POST requests that upgrade to WebSockets, so the React frontend keeps using the classic POST + WebSocket GET flow.

> **Hosted environment note**: Railway’s edge proxies terminate the connection before Fastify reads the JSON body whenever `Connection: Upgrade` is included on a POST. You’ll see a `400` response with `"Body cannot be empty when content-type is set to 'application/json'"`. Run the script against a local deployment (or any environment where the client connects directly to Fastify) to exercise the full POST-upgrade flow.

If the headers are omitted, the API falls back to the regular POST+GET pattern shown above.
```

## 🧪 Testing

### Run Unit Tests
```bash
npm test
```

### Run with Coverage
```bash
npm run test:coverage
```

### Test Scripts
- `scripts/test-raydium-swap.ts`: Test Raydium swap logic directly
- `scripts/inspect-pool.ts`: Inspect pool data
- `scripts/debug-pools.ts`: Debug pool reserves
- `scripts/test-ws.js`: Test WebSocket connection

## 📚 API Reference

### HTTP Endpoints

#### POST /api/orders/execute
Submit a market order for execution.

**Request Body:**
```json
{
  "tokenIn": "string",
  "tokenOut": "string",
  "amount": "number",
  "orderType": "market"
}
```

**Response:**
```json
{
  "orderId": "string",
  "status": "pending"
}
```

#### GET /api/orders/history
Stream order records directly from PostgreSQL with cursor-based pagination.

**Query Params:**

| Name | Type | Description |
| --- | --- | --- |
| `limit` | number (1-200) | Max rows per page (default 50) |
| `cursor` | ISO timestamp | Keyset cursor returned from previous call |

**Response:**
```json
{
  "data": [
    {
      "orderId": "abc123",
      "status": "confirmed",
      "dex": "raydium",
      "txHash": "...",
      "statusHistory": [ { "status": "pending", "detail": "Order accepted", "recordedAt": "..." } ]
    }
  ],
  "pagination": {
    "limit": 50,
    "nextCursor": null,
    "hasMore": false
  }
}
```

### WebSocket Endpoint

#### GET /api/orders/execute?orderId={orderId}
WebSocket endpoint for real-time order status updates.

**Message Format:**
```json
{
  "orderId": "string",
  "status": "pending|queued|routing|building|submitted|confirmed|failed",
  "detail": "string?", // Transaction signature for submitted/confirmed
  "link": "string?" // Explorer link for submitted/confirmed
}
```

## 🔧 Configuration

### Environment Variables
- `SOLANA_RPC_URL`: Solana RPC endpoint
- `WALLET_PRIVATE_KEY`: Base58-encoded private key
- `REDIS_HOST/PORT`: Redis connection details
- `PORT`: Server port (default: 8080)
- `SLIPPAGE`: Slippage tolerance (default: 0.10)

### Queue Configuration
- **Concurrency**: 10 workers
- **Rate Limit**: 100 jobs/minute
- **Retries**: 3 attempts with exponential backoff

## 📹 Demo & Proof

- **Video walkthrough**: _Pending upload_
- **Backend deployment**: https://crypto-order-execution-engine-production.up.railway.app
- **Frontend dashboard**: https://crypto-order-execution-engine.vercel.app/
- **Transaction proof**: every executed order emits the confirmed signature and explorer link over WebSocket *and* persists it in Postgres. You can fetch the latest 100 log lines (including signatures) via `GET https://crypto-order-execution-engine-production.up.railway.app/logs` or by opening the `History` tab in the UI to copy the explorer link.

## 🐛 Troubleshooting

### Common Issues
- **"Transaction simulation failed"**: Check wallet balance and token accounts
- **"WebSocket connection failed"**: Verify upgrade headers and Redis connection
- **"Pool not found"**: Ensure using devnet pools and correct pool IDs
- **"Rate limit exceeded"**: Wait for rate limit window or adjust configuration

### Logs
Application uses structured logging with Pino. Key log events:
- DEX routing decisions
- Transaction submissions with explorer links
- Queue processing metrics
- Error details with context

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

### Development Guidelines
- Follow TypeScript best practices
- Maintain Clean Architecture principles
- Add comprehensive error handling
- Include meaningful logs
- Write unit tests for new features

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 📚 Additional Resources

- **Backend API**: https://crypto-order-execution-engine-production.up.railway.app
- [Quick Start Guide](./QUICKSTART.md)
- [Raydium Integration Changes](./RAYDIUM_INTEGRATION_CHANGES.md)
- [Raydium SDK Documentation](https://docs.raydium.io/)
- [Meteora SDK Documentation](https://docs.meteora.ag/)
- [BullMQ Documentation](https://docs.bullmq.io/)
- [Fastify Documentation](https://www.fastify.io/docs/latest/)</content>
<parameter name="filePath">c:\Users\param\Core\Code\full_time-assignment\Order_execution_engine\README.md