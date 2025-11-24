import BN from 'bn.js';
import Decimal from 'decimal.js';
import AmmImpl from '@meteora-ag/dynamic-amm-sdk';
import { PublicKey, Transaction } from '@solana/web3.js';
import { DexClient, QuoteRequest, QuoteResponse, SwapBuildParams, BuiltTransaction } from './router.interface';
import { logger } from '@utils/logger';
import { getConnection } from './solana';

type MeteoraQuote = {
	poolAddress: PublicKey;
	swapOutAmount: BN;
	minSwapOutAmount: BN;
	fee: BN;
	priceImpactBps: number;
};

export class MeteoraClient implements DexClient {
	readonly name = 'meteora' as const;
	private readonly poolCache = new Map<string, AmmImpl>();

	async getQuote(request: QuoteRequest): Promise<QuoteResponse> {
		const connection = this.getMeteoraConnection();
		const pools = await AmmImpl.searchPoolsByToken(connection, request.tokenIn);
		const matches = pools.filter((pool) =>
			this.matchPool(pool.account.tokenAMint, pool.account.tokenBMint, request.tokenIn, request.tokenOut)
		);

		if (!matches.length) {
			throw new Error('No Meteora pools available for requested pair');
		}

		let best: { quote: MeteoraQuote; request: QuoteRequest } | undefined;
		for (const pool of matches) {
			try {
				const quote = await this.fetchPoolQuote(pool.publicKey, request);
				if (!best || quote.swapOutAmount.gt(best.quote.swapOutAmount)) {
					best = { quote, request };
				}
			} catch (error) {
				logger.dex.warn({ dex: this.name, pool: pool.publicKey.toBase58(), error }, 'Failed to quote Meteora pool');
			}
		}

		if (!best) {
			throw new Error('Meteora pools failed to return a quote');
		}

		const { quote } = best;
		const minOut = BigInt(quote.minSwapOutAmount.toString());
		const estimatedOut = BigInt(quote.swapOutAmount.toString());
		return {
			dex: this.name,
			estimatedOut,
			minOut,
			priceImpactBps: quote.priceImpactBps,
			feeBps: this.calculateFeeBps(request.amount, quote.fee),
			poolId: quote.poolAddress.toBase58(),
			routeMeta: {
				poolAddress: quote.poolAddress.toBase58()
			},
			request
		};
	}

	async buildSwapTx({ quote, wallet }: SwapBuildParams): Promise<BuiltTransaction> {
		const poolAddress = quote.poolId;
		if (!poolAddress) {
			throw new Error('Missing Meteora pool id');
		}
		const amm = await this.loadPool(new PublicKey(poolAddress));
		const meteoraTx = await amm.swap(
			wallet.publicKey,
			quote.request.tokenIn,
			new BN(quote.request.amount.toString()),
			new BN(quote.minOut.toString())
		);

		const transaction = Transaction.from(meteoraTx.serialize());
		return { transaction, signers: [] };
	}

	private matchPool(
		tokenA: PublicKey,
		tokenB: PublicKey,
		input: PublicKey,
		output: PublicKey
	): boolean {
		const direct = tokenA.equals(input) && tokenB.equals(output);
		const reverse = tokenB.equals(input) && tokenA.equals(output);
		return direct || reverse;
	}

	private async fetchPoolQuote(poolAddress: PublicKey, request: QuoteRequest): Promise<MeteoraQuote> {
		const amm = await this.loadPool(poolAddress);
		await amm.updateState();
		const slippagePercent = Math.min(100, request.slippageBps / 100);
		const quote = amm.getSwapQuote(request.tokenIn, new BN(request.amount.toString()), slippagePercent);
		return {
			poolAddress,
			swapOutAmount: quote.swapOutAmount,
			minSwapOutAmount: quote.minSwapOutAmount,
			fee: quote.fee,
			priceImpactBps: Number(
				quote.priceImpact.mul(10_000).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber()
			)
		};
	}

	private calculateFeeBps(amount: bigint, fee: BN): number {
		if (fee.isZero() || amount === 0n) return 0;
		const ratio = new Decimal(fee.toString()).div(new Decimal(amount.toString()));
		return Number(ratio.mul(10_000).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber());
	}

	private async loadPool(poolAddress: PublicKey): Promise<AmmImpl> {
		const cacheKey = poolAddress.toBase58();
		if (this.poolCache.has(cacheKey)) {
			return this.poolCache.get(cacheKey)!;
		}

		const amm = await AmmImpl.create(this.getMeteoraConnection(), poolAddress, { cluster: 'devnet' });
		this.poolCache.set(cacheKey, amm);
		return amm;
	}

	private getMeteoraConnection(): Parameters<typeof AmmImpl.create>[0] {
		return getConnection() as unknown as Parameters<typeof AmmImpl.create>[0];
	}
}
