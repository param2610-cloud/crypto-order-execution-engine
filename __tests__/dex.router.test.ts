import { SolanaDexRouter } from '@dex/router';
import { RaydiumClient } from '@dex/raydium.client';
import { MeteoraClient } from '@dex/meteora.client';
import { OrderJobPayload } from '@type-defs/order.types';
import { PublicKey } from '@solana/web3.js';

describe('SolanaDexRouter', () => {
  let router: SolanaDexRouter;
  let mockRaydium: jest.Mocked<RaydiumClient>;
  let mockMeteora: jest.Mocked<MeteoraClient>;

  beforeEach(() => {
    mockRaydium = new RaydiumClient() as jest.Mocked<RaydiumClient>;
    mockMeteora = new MeteoraClient() as jest.Mocked<MeteoraClient>;
    router = new SolanaDexRouter(mockRaydium, mockMeteora);
  });

  describe('findBestRoute', () => {
    const mockOrder: OrderJobPayload = {
      orderId: 'test-order',
      tokenIn: 'So11111111111111111111111111111111111111112', // WSOL
      tokenOut: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
      amount: 1000000, // 0.001 SOL
      orderType: 'market',
      receivedAt: new Date().toISOString()
    };

    it('should select Raydium when it has better quote', async () => {
      mockRaydium.getQuote.mockResolvedValue({
        dex: 'raydium',
        estimatedOut: 2000000n,
        minOut: 1900000n,
        priceImpactBps: 50,
        feeBps: 25,
        poolId: 'raydium-pool',
        request: { tokenIn: new PublicKey(mockOrder.tokenIn), tokenOut: new PublicKey(mockOrder.tokenOut), amount: 1000000n, slippageBps: 100 }
      });

      mockMeteora.getQuote.mockResolvedValue({
        dex: 'meteora',
        estimatedOut: 1800000n,
        minOut: 1700000n,
        priceImpactBps: 75,
        feeBps: 30,
        poolId: 'meteora-pool',
        request: { tokenIn: new PublicKey(mockOrder.tokenIn), tokenOut: new PublicKey(mockOrder.tokenOut), amount: 1000000n, slippageBps: 100 }
      });

      const result = await router.findBestRoute(mockOrder);

      expect(result.bestDex).toBe('raydium');
      expect(result.quote.estimatedOut).toBe(2000000n);
    });

    it('should select Meteora when it has better quote', async () => {
      mockRaydium.getQuote.mockResolvedValue({
        dex: 'raydium',
        estimatedOut: 1500000n,
        minOut: 1425000n,
        priceImpactBps: 100,
        feeBps: 25,
        poolId: 'raydium-pool',
        request: { tokenIn: new PublicKey(mockOrder.tokenIn), tokenOut: new PublicKey(mockOrder.tokenOut), amount: 1000000n, slippageBps: 100 }
      });

      mockMeteora.getQuote.mockResolvedValue({
        dex: 'meteora',
        estimatedOut: 1600000n,
        minOut: 1520000n,
        priceImpactBps: 75,
        feeBps: 30,
        poolId: 'meteora-pool',
        request: { tokenIn: new PublicKey(mockOrder.tokenIn), tokenOut: new PublicKey(mockOrder.tokenOut), amount: 1000000n, slippageBps: 100 }
      });

      const result = await router.findBestRoute(mockOrder);

      expect(result.bestDex).toBe('meteora');
      expect(result.quote.estimatedOut).toBe(1600000n);
    });

    it('should throw RoutingError when both DEXes fail', async () => {
      mockRaydium.getQuote.mockRejectedValue(new Error('Raydium timeout'));
      mockMeteora.getQuote.mockRejectedValue(new Error('Meteora timeout'));

      await expect(router.findBestRoute(mockOrder)).rejects.toThrow('Unable to fetch quotes');
    });

    it('should convert amount to lamports correctly', async () => {
      const orderWithDecimal: OrderJobPayload = { ...mockOrder, amount: 1.5 };

      mockRaydium.getQuote.mockResolvedValue({
        dex: 'raydium',
        estimatedOut: 3000000n,
        minOut: 2850000n,
        priceImpactBps: 50,
        feeBps: 25,
        poolId: 'raydium-pool',
        request: { tokenIn: new PublicKey(orderWithDecimal.tokenIn), tokenOut: new PublicKey(orderWithDecimal.tokenOut), amount: 1n, slippageBps: 100 }
      });

      await router.findBestRoute(orderWithDecimal);

      expect(mockRaydium.getQuote).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 1n })
      );
    });
  });
});
