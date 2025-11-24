import BN from 'bn.js';
import Decimal from 'decimal.js';
import { CurveCalculator, FeeOn, Raydium, TxVersion, type CpmmParsedRpcData } from '@raydium-io/raydium-sdk-v2';
import { PublicKey } from '@solana/web3.js';
import { NATIVE_MINT, createAssociatedTokenAccountInstruction, getAssociatedTokenAddress, getAccount } from '@solana/spl-token';
import { DexClient, QuoteRequest, QuoteResponse, SwapBuildParams, BuiltTransaction } from './router.interface';
import { ensureWrappedSolBalance, getConnection, getWallet } from './solana';
import { logger } from '@utils/logger';

type PoolCandidate = {
  poolId: string;
  poolInfo: any;
  poolKeys: any;
  rpcData: CpmmParsedRpcData;
};

const DEVNET_RAYDIUM_POOLS: string[] = [
  "AWVFpbFFnx2VkwLh5FrkFAjkxvTu8tFQYALm4tuN8wqd",
];

const MAX_POOLS_TO_EVALUATE = 3;

export class RaydiumClient implements DexClient {
  readonly name = 'raydium' as const;
  private raydium: Raydium | undefined;
  private initializing?: Promise<void>;

  constructor() {
    this.initializing = this.initialize();
  }

  private amountToBn(value: bigint | BN): BN {
    return BN.isBN(value) ? value : new BN(value.toString());
  }

  private calculateFeeBps(inputAmount: BN, tradeFee: BN): number {
    if (inputAmount.isZero() || tradeFee.isZero()) return 0;
    const ratio = new Decimal(tradeFee.toString()).div(new Decimal(inputAmount.toString()));
    return Number(ratio.mul(10_000).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber());
  }

  private resolveDirection(tokenIn: PublicKey, mintA: PublicKey | null, mintB: PublicKey | null): boolean | null {
    if (mintA && tokenIn.equals(mintA)) return true;
    if (mintB && tokenIn.equals(mintB)) return false;
    return null;
  }

  private selectReserves(rpcData: CpmmParsedRpcData, baseIn: boolean) {
    return {
      reserveIn: baseIn ? rpcData.baseReserve : rpcData.quoteReserve,
      reserveOut: baseIn ? rpcData.quoteReserve : rpcData.baseReserve
    };
  }

  private simulateSwap(
    inputAmount: BN,
    rpcData: CpmmParsedRpcData,
    baseIn: boolean
  ) {
    if (!rpcData.configInfo) {
      throw new Error('Raydium pool missing config info');
    }

    const { reserveIn, reserveOut } = this.selectReserves(rpcData, baseIn);
    if (reserveIn.isZero() || reserveOut.isZero()) {
      return null;
    }

    return CurveCalculator.swapBaseInput(
      inputAmount,
      reserveIn,
      reserveOut,
      rpcData.configInfo.tradeFeeRate,
      rpcData.configInfo.creatorFeeRate,
      rpcData.configInfo.protocolFeeRate,
      rpcData.configInfo.fundFeeRate,
      rpcData.feeOn === FeeOn.BothToken || rpcData.feeOn === FeeOn.OnlyTokenB
    );
  }

  private toSlippageFraction(slippageBps: number): number {
    if (slippageBps <= 0) return 0;
    return Math.min(1, slippageBps / 10_000);
  }

  private normalizePubKey(value: PublicKey | string | undefined | null): PublicKey | null {
    if (!value) return null;
    if (value instanceof PublicKey) return value;
    try {
      return new PublicKey(value);
    } catch {
      return null;
    }
  }

  private resolveMintAddress(value: unknown): PublicKey | null {
    if (!value) return null;
    if (value instanceof PublicKey) return value;
    if (typeof value === 'string') {
      return this.normalizePubKey(value);
    }
    if (typeof value === 'object') {
      const addressLike = (value as Record<string, unknown>)?.address ?? (value as Record<string, unknown>)?.mint ?? (value as Record<string, unknown>)?.mintAddress;
      if (addressLike) {
        return this.resolveMintAddress(addressLike);
      }
    }
    return null;
  }

  private derivePoolMints(poolInfo: any, poolKeys: any): { mintA: PublicKey | null; mintB: PublicKey | null } {
    const mintA = this.resolveMintAddress(poolInfo?.mintA) ?? this.resolveMintAddress(poolInfo?.mintA?.address) ?? this.normalizePubKey(poolKeys?.mintA);
    const mintB = this.resolveMintAddress(poolInfo?.mintB) ?? this.resolveMintAddress(poolInfo?.mintB?.address) ?? this.normalizePubKey(poolKeys?.mintB);
    return { mintA, mintB };
  }

  private async loadPoolResources(poolId: string): Promise<PoolCandidate> {
    const raydium = await this.ensureRaydium();
    
    // Fetch pool info from API
    const poolData = await raydium.api.fetchPoolById({ ids: poolId });
    if (!poolData || poolData.length === 0) {
      throw new Error(`Pool ${poolId} not found via Raydium API`);
    }
    
    const poolInfo = poolData[0];
    
    // Fetch RPC data for reserve information
    const poolPubkey = new PublicKey(poolId);
    const rpcResponse = await (raydium as any).cpmm.getPoolInfoFromRpc(poolPubkey);
    const { poolKeys, rpcData } = rpcResponse ?? {};
    
    if (!poolKeys || !rpcData) {
      throw new Error(`Failed to load Raydium pool RPC data for ${poolId}`);
    }

    return { poolId, poolInfo, poolKeys, rpcData };
  }

  private async initialize() {
    try {
      this.raydium = await Raydium.load({
        owner: getWallet(),
        connection: getConnection(),
        cluster: 'devnet' as any,
        disableFeatureCheck: true,
        disableLoadToken: false,
      });
      
      logger.dex.info({ dex: this.name, message: 'Raydium SDK initialized with CPMM support' });
    } catch (error) {
      logger.dex.error({ dex: this.name, error: 'Failed to initialize Raydium SDK' });
      this.raydium = undefined;
      this.initializing = undefined;
      throw error;
    }
  }

  private async ensureRaydium(): Promise<Raydium> {
    if (!this.raydium) {
      this.initializing = this.initializing ?? this.initialize();
      await this.initializing;
    }
    return this.raydium!;
  }

  async getQuote(request: QuoteRequest): Promise<QuoteResponse> {
    await this.ensureRaydium();
    const pools = await this.fetchCandidates(request);
    if (!pools.length) {
      throw new Error('No Raydium pools available for requested pair');
    }

    // ✅ Execute all quote calculations in parallel
    const quotePromises = pools.map(candidate => this.computeQuote(candidate, request));
    const quotes = await Promise.all(quotePromises);

    // Filter out null quotes and find best
    const validQuotes = quotes.filter((q): q is QuoteResponse => q !== null);
    
    if (validQuotes.length === 0) {
      throw new Error('Unable to compute Raydium quote');
    }

    // Find best quote
    const best = validQuotes.reduce((best, current) =>
      current.estimatedOut > best.estimatedOut ? current : best
    );

    return best;
  }


  async buildSwapTx({ quote, wallet }: SwapBuildParams): Promise<BuiltTransaction> {
  if (!quote.poolId) {
    throw new Error('Missing poolId in quote');
  }

  if (quote.request.tokenIn.equals(NATIVE_MINT)) {
    await ensureWrappedSolBalance(quote.request.amount);
  }

  const poolResources = await this.loadPoolResources(quote.poolId);
  const { mintA, mintB } = this.derivePoolMints(poolResources.poolInfo, poolResources.poolKeys);
  if (!mintA || !mintB) {
    throw new Error('Unable to resolve pool mint metadata');
  }

  const baseInRouteMeta = (quote.routeMeta as { baseIn?: boolean } | undefined)?.baseIn;
  const baseIn = baseInRouteMeta ?? this.resolveDirection(quote.request.tokenIn, mintA, mintB);
  if (baseIn === null) {
    throw new Error('Requested input mint does not match Raydium pool');
  }

  const inputAmount = this.amountToBn(quote.request.amount);
  const minOutputAmount = this.amountToBn(quote.minOut);

  logger.dex.info({
    poolId: quote.poolId,
    inputAmount: inputAmount.toString(),
    minOutputAmount: minOutputAmount.toString(),
    baseIn,
  }, 'Building swap transaction');

  const raydium = await this.ensureRaydium();

  // Build swap with slippage = 0 (already included in minOut)
  const { transaction, signers } = await (raydium as any).cpmm.swap({
    poolInfo: poolResources.poolInfo as any,
    poolKeys: poolResources.poolKeys,
    baseIn,
    inputAmount,
    swapResult: {
      inputAmount: inputAmount,
      outputAmount: minOutputAmount,
    } as any,
    slippage: 0, // Already calculated in minOut
    txVersion: TxVersion.V0,
  } as any);

  if (!transaction) {
    throw new Error('Raydium SDK did not return a swap transaction');
  }

  return {
    transaction,
    signers: Array.isArray(signers) ? signers : [],
  };
}


  private async fetchCandidates(request: QuoteRequest): Promise<PoolCandidate[]> {
    const candidates: PoolCandidate[] = [];
    logger.dex.info({ dex: this.name, poolsConfigured: DEVNET_RAYDIUM_POOLS.length, poolIds: DEVNET_RAYDIUM_POOLS }, 'Scanning Raydium pools');

    for (const poolId of DEVNET_RAYDIUM_POOLS.slice(0, MAX_POOLS_TO_EVALUATE)) {
      try {
        const poolResources = await this.loadPoolResources(poolId);
        const { mintA, mintB } = this.derivePoolMints(poolResources.poolInfo, poolResources.poolKeys);

        if (!mintA || !mintB) {
          logger.dex.warn({ dex: this.name, poolId }, 'Pool missing mint metadata');
          continue;
        }

        const matchesPair =
          (request.tokenIn.equals(mintA) && request.tokenOut.equals(mintB)) ||
          (request.tokenIn.equals(mintB) && request.tokenOut.equals(mintA));

        if (!matchesPair) {
          logger.dex.debug({ poolId, requestIn: request.tokenIn.toBase58(), poolMintA: mintA.toBase58(), poolMintB: mintB.toBase58() }, 'Token mismatch: skipping pool');
          continue;
        }

        candidates.push(poolResources);
      } catch (error: any) {
        const errorMessage = typeof error === 'object' && error !== null && 'stack' in error ? (error as any).stack : String(error);
        logger.dex.warn({ dex: this.name, poolId, error: errorMessage }, 'Failed to fetch pool info or build keys');
      }
    }

    if (candidates.length === 0) {
      logger.dex.warn({ dex: this.name, request }, 'No candidate pools matched the requested pair');
    } else {
      logger.dex.info({ dex: this.name, matched: candidates.length }, 'Raydium candidates ready');
    }
    return candidates;
  }

  private async computeQuote(candidate: PoolCandidate, request: QuoteRequest): Promise<QuoteResponse | null> {
  const { poolInfo, poolKeys, rpcData } = candidate;
  if (!poolInfo) {
    logger.dex.warn({ poolId: candidate.poolId }, 'poolInfo is undefined');
    return null;
  }

  const { mintA, mintB } = this.derivePoolMints(poolInfo, poolKeys);
  if (!mintA || !mintB) {
    logger.dex.warn(
      { poolId: candidate.poolId, hasMintA: !!mintA, hasMintB: !!mintB },
      'Missing mint data'
    );
    return null;
  }

  const baseIn = this.resolveDirection(request.tokenIn, mintA, mintB);
  if (baseIn === null) {
    logger.dex.debug(
      {
        poolId: candidate.poolId,
        requestTokenIn: request.tokenIn.toBase58(),
        mintA: mintA.toBase58(),
        mintB: mintB.toBase58(),
      },
      'Token mismatch: request token not in pool'
    );
    return null;
  }

  const inputAmount = this.amountToBn(request.amount);
  if (inputAmount.isZero()) {
    logger.dex.warn({ poolId: candidate.poolId }, 'Zero amount requested');
    return null;
  }

  // **CRITICAL FIX: Use actual reserves to calculate output**
  if (!rpcData.baseReserve || !rpcData.quoteReserve) {
    logger.dex.warn({ poolId: candidate.poolId }, 'Pool reserves not available');
    return null;
  }

  const reserveIn = baseIn ? rpcData.baseReserve : rpcData.quoteReserve;
  const reserveOut = baseIn ? rpcData.quoteReserve : rpcData.baseReserve;

  // Calculate expected output using constant product formula
  // outputAmount = (inputAmount * reserveOut) / (reserveIn + inputAmount)
  // With 0.25% trade fee
  const inputAfterFee = inputAmount.mul(new BN(9975)).div(new BN(10000));
  const numerator = inputAfterFee.mul(reserveOut);
  const denominator = reserveIn.add(inputAfterFee);
  const expectedOutputBN = numerator.div(denominator);

  const estimatedOut = BigInt(expectedOutputBN.toString());
  if (estimatedOut <= 0n) {
    logger.dex.debug({ poolId: candidate.poolId }, 'Calculated zero output');
    return null;
  }

  // Apply slippage to get minimum output
  const minOut = (estimatedOut * BigInt(10_000 - request.slippageBps)) / 10_000n;
  
  const priceImpactBps = this.estimatePriceImpact(
    request.amount,
    reserveIn
  );
  
  // Calculate fee from the trade fee (0.25%)
  const tradeFee = inputAmount.mul(new BN(25)).div(new BN(10000));
  const feeBps = this.calculateFeeBps(inputAmount, tradeFee);

  logger.dex.info({
    poolId: candidate.poolId,
    inputAmount: inputAmount.toString(),
    reserveIn: reserveIn.toString(),
    reserveOut: reserveOut.toString(),
    estimatedOut: estimatedOut.toString(),
    minOut: minOut.toString(),
  }, 'Quote calculated from reserves');

  return {
    dex: this.name,
    estimatedOut,
    minOut,
    priceImpactBps,
    feeBps,
    poolId: candidate.poolId,
    routeMeta: {
      baseIn,
    },
    request,
  };
}


  private estimatePriceImpact(amount: bigint, reserveIn: BN): number {
    const reserve = new Decimal(reserveIn.toString());
    if (reserve.isZero()) return 0;
    const ratio = new Decimal(amount.toString()).div(reserve);
    return Number(ratio.mul(10_000).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toString());
  }
}
