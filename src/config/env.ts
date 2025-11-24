const createMemoryStorage = () => {
  const store = new Map<string, string>();
  return {
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
};

// Polyfill browser storage APIs that Raydium SDK expects.
if (typeof globalThis.localStorage === 'undefined') {
  (globalThis as any).localStorage = createMemoryStorage();
}

if (typeof globalThis.sessionStorage === 'undefined') {
  (globalThis as any).sessionStorage = createMemoryStorage();
}

import dotenv from 'dotenv';

/**
 * Loads environment variables once so that every module reads a consistent snapshot.
 */
dotenv.config();

const toNumber = (value: string | undefined, fallback: number) => {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: toNumber(process.env.PORT, 8080),
  redis: {
    url: process.env.REDIS_URL,
    host: process.env.REDIS_HOST ?? '127.0.0.1',
    port: toNumber(process.env.REDIS_PORT, 6379),
    username: process.env.REDIS_USERNAME,
    password: process.env.REDIS_PASSWORD,
    db: toNumber(process.env.REDIS_DB, 0)
  },
  queue: {
    concurrency: 10,
    rateLimit: 100,
    retryAttempts: 3
  },
  solana: {
    rpcUrl: process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com',
    commitment: (process.env.SOLANA_COMMITMENT as 'processed' | 'confirmed' | 'finalized') ?? 'confirmed'
  },
  wallet: {
    secretKey: process.env.WALLET_PRIVATE_KEY ?? ''
  },
  trading: {
    slippage: Number(process.env.SLIPPAGE ?? 0.01)
  },
  dex: {
    raydiumApiHost: process.env.RAYDIUM_API_HOST ?? 'https://api-v3-devnet.raydium.io'
  }
};
