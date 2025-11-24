import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Mock Redis for tests
jest.mock('@config/redis', () => ({
  createRedisConnection: jest.fn(() => ({
    on: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn(),
    close: jest.fn()
  }))
}));

// Mock logger
jest.mock('@utils/logger', () => ({
  logger: {
    app: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
    dex: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
    ws: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
    queue: { info: jest.fn(), error: jest.fn(), warn: jest.fn() }
  }
}));

// Mock Solana connection
jest.mock('@dex/solana', () => ({
  getConnection: jest.fn(() => ({})),
  getWallet: jest.fn(() => ({ publicKey: 'mock-public-key' })),
  sendAndConfirm: jest.fn().mockResolvedValue('mock-signature'),
  logSignatureExplorerHint: jest.fn()
}));

// Mock DEX clients
jest.mock('@dex/raydium.client', () => ({
  RaydiumClient: jest.fn().mockImplementation(() => ({
    getQuote: jest.fn().mockResolvedValue({
      dex: 'raydium',
      estimatedOut: 1000000n,
      minOut: 950000n,
      priceImpactBps: 50,
      feeBps: 25,
      poolId: 'raydium-pool-id',
      request: {}
    }),
    buildSwapTx: jest.fn().mockResolvedValue({
      transaction: {},
      signers: []
    })
  }))
}));

jest.mock('@dex/meteora.client', () => ({
  MeteoraClient: jest.fn().mockImplementation(() => ({
    getQuote: jest.fn().mockResolvedValue({
      dex: 'meteora',
      estimatedOut: 950000n,
      minOut: 900000n,
      priceImpactBps: 75,
      feeBps: 30,
      poolId: 'meteora-pool-id',
      request: {}
    }),
    buildSwapTx: jest.fn().mockResolvedValue({
      transaction: {},
      signers: []
    })
  }))
}));

// Mock nanoid
jest.mock('nanoid', () => ({
  customAlphabet: jest.fn(() => jest.fn(() => 'mock-nanoid'))
}));