import Decimal from 'decimal.js';
import { PublicKey } from '@solana/web3.js';
import { env } from '@config/env';
import { OrderJobPayload } from '@type-defs/order.types';
import { logger } from '@utils/logger';
import { MeteoraClient } from './meteora.client';
import { RaydiumClient } from './raydium.client';
import { DexRoutePlan, DexRouter, QuoteRequest, QuoteResponse, RoutingError } from './router.interface';
import { getMintDecimals, getWallet } from './solana';

const ROUTE_TIMEOUT_MS = 5_000;
const DEFAULT_SLIPPAGE_BPS = Math.max(1, Math.floor(env.trading.slippage * 10_000));

const stringifyQuote = (quote?: QuoteResponse | null) => {
  if (!quote) return null;
  return {
    dex: quote.dex,
    estimatedOut: quote.estimatedOut.toString(),
    minOut: quote.minOut.toString(),
    feeBps: quote.feeBps,
    priceImpactBps: quote.priceImpactBps,
    poolId: quote.poolId
  };
};

export class SolanaDexRouter implements DexRouter {
  constructor(
    private readonly raydium: RaydiumClient = new RaydiumClient(),
    private readonly meteora: MeteoraClient = new MeteoraClient()
  ) {}

  async findBestRoute(order: OrderJobPayload): Promise<DexRoutePlan> {
    const tokenIn = new PublicKey(order.tokenIn);
    const tokenOut = new PublicKey(order.tokenOut);
    const amountLamports = await this.toLamports(order.amount, tokenIn);

    const request: QuoteRequest = {
      tokenIn,
      tokenOut,
      amount: amountLamports,
      slippageBps: DEFAULT_SLIPPAGE_BPS
    };

    const [raydiumQuote, meteoraQuote] = await Promise.allSettled([
      this.withTimeout(this.raydium.getQuote(request), ROUTE_TIMEOUT_MS),
      this.withTimeout(this.meteora.getQuote(request), ROUTE_TIMEOUT_MS)
    ]);

    const successfulQuotes: QuoteResponse[] = [];
    if (raydiumQuote.status === 'fulfilled') successfulQuotes.push(raydiumQuote.value);
    if (meteoraQuote.status === 'fulfilled') successfulQuotes.push(meteoraQuote.value);

    if (!successfulQuotes.length) {
      throw new RoutingError('Unable to fetch quotes from Raydium or Meteora', {
        orderId: order.orderId,
        raydiumError: raydiumQuote.status === 'rejected' ? raydiumQuote.reason?.message ?? String(raydiumQuote.reason) : null,
        meteoraError: meteoraQuote.status === 'rejected' ? meteoraQuote.reason?.message ?? String(meteoraQuote.reason) : null
      });
    }

    const bestQuote = successfulQuotes.reduce((best, current) =>
      current.estimatedOut > best.estimatedOut ? current : best
    );
    const client = bestQuote.dex === 'raydium' ? this.raydium : this.meteora;

    logger.dex.info(
      {
        event: 'DEX_ROUTE',
        orderId: order.orderId,
        bestDex: bestQuote.dex,
        raydiumQuote: stringifyQuote(raydiumQuote.status === 'fulfilled' ? raydiumQuote.value : null),
        meteoraQuote: stringifyQuote(meteoraQuote.status === 'fulfilled' ? meteoraQuote.value : null)
      },
      'DEX_ROUTE decision'
    );

    return {
      bestDex: bestQuote.dex,
      quote: bestQuote,
      buildTransaction: () => client.buildSwapTx({ order, quote: bestQuote, wallet: getWallet() })
    };
  }

  private async toLamports(amount: number, mint: PublicKey): Promise<bigint> {
    if (amount <= 0) {
      throw new Error('Amount must be positive');
    }
    // Amount is expected in smallest units (lamports) from the API payload
    // No scaling needed - clients must provide amounts in token's base units
    return BigInt(Math.floor(amount));
  }

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new RoutingError('Quote request timed out', { timeoutMs: ms }));
      }, ms);

      promise
        .then((value) => resolve(value))
        .catch((error) => reject(error))
        .finally(() => clearTimeout(timer));
    });
  }
}

export const dexRouter = new SolanaDexRouter();
