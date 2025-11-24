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

### Submit an Order
```bash
curl -X POST http://localhost:8080/api/orders/execute \
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
const ws = new WebSocket('ws://localhost:8080/api/orders/execute?orderId=YOUR_ORDER_ID');

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

- [Backend Task 2 Specification](./Backend Task 2_ Order Execution Engine.pdf)
- [Fast-Track Guide](./Solana DevNet Order Engine_ Fast-Track Guide.pdf)
- [Raydium SDK Documentation](https://docs.raydium.io/)
- [Meteora SDK Documentation](https://docs.meteora.ag/)
- [BullMQ Documentation](https://docs.bullmq.io/)
- [Fastify Documentation](https://www.fastify.io/docs/latest/)</content>
<parameter name="filePath">c:\Users\param\Core\Code\full_time-assignment\Order_execution_engine\README.md