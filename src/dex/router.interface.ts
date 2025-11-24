import { Keypair, PublicKey, Signer, Transaction, VersionedTransaction } from '@solana/web3.js';
import { OrderJobPayload } from '@type-defs/order.types';

export type SupportedDex = 'raydium' | 'meteora';

export interface QuoteRequest {
  tokenIn: PublicKey;
  tokenOut: PublicKey;
  amount: bigint;
  slippageBps: number;
}

export interface QuoteResponse {
  dex: SupportedDex;
  estimatedOut: bigint;
  minOut: bigint;
  priceImpactBps: number;
  feeBps: number;
  poolId?: string;
  routeMeta?: Record<string, unknown>;
  request: QuoteRequest;
}

export interface BuiltTransaction {
  transaction: Transaction | VersionedTransaction;
  signers: Signer[];
}

export interface SwapBuildParams {
  order: OrderJobPayload;
  quote: QuoteResponse;
  wallet: Keypair;
}

export interface DexClient {
  readonly name: SupportedDex;
  getQuote(request: QuoteRequest): Promise<QuoteResponse>;
  buildSwapTx(params: SwapBuildParams): Promise<BuiltTransaction>;
}

export interface DexRoutePlan {
  bestDex: SupportedDex;
  quote: QuoteResponse;
  buildTransaction: () => Promise<BuiltTransaction>;
}

export interface DexRouter {
  findBestRoute(order: OrderJobPayload): Promise<DexRoutePlan>;
}

export class RoutingError extends Error {
  constructor(message: string, readonly context?: Record<string, unknown>) {
    super(message);
    this.name = 'RoutingError';
  }
}
