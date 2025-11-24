import { OrderService } from '@services/order.service';
import { enqueueOrderJob } from '@queue/order.queue';
import { generateOrderId } from '@utils/id';
import { logger } from '@utils/logger';
import { MarketOrderInput, OrderJobPayload } from '@type-defs/order.types';
import { orderHistoryService } from '@services/order-history.service';

jest.mock('@queue/order.queue');
jest.mock('@utils/id');
jest.mock('@utils/logger');
jest.mock('@services/order-history.service');

describe('OrderService', () => {
  let service: OrderService;

  beforeEach(() => {
    service = new OrderService();
    jest.resetAllMocks();
  });

  describe('submitMarketOrder', () => {
    const validPayload: MarketOrderInput = {
      tokenIn: 'So11111111111111111111111111111111111111112',
      tokenOut: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      amount: 1000000,
      orderType: 'market'
    };

    it('should validate and enqueue valid market order', async () => {
      const mockOrderId = 'generated-order-id-123';
      (generateOrderId as jest.Mock).mockReturnValue(mockOrderId);

      const result = await service.submitMarketOrder(validPayload);

      expect(generateOrderId).toHaveBeenCalled();
      expect(enqueueOrderJob).toHaveBeenCalledWith({
        ...validPayload,
        orderId: mockOrderId,
        receivedAt: expect.any(String)
      });
      expect(orderHistoryService.recordNewOrder).toHaveBeenCalledWith(expect.objectContaining({ orderId: mockOrderId }));
      expect(logger.app.info).toHaveBeenCalledWith(
        { orderId: mockOrderId, tokenIn: validPayload.tokenIn, tokenOut: validPayload.tokenOut },
        'Market order validated'
      );

      expect(result).toEqual({
        ...validPayload,
        orderId: mockOrderId,
        receivedAt: expect.any(String)
      });
    });

    it('should throw on invalid payload', async () => {
      const invalidPayload = {
        tokenIn: '',
        tokenOut: 'invalid',
        amount: -100,
        orderType: 'invalid'
      };

      await expect(service.submitMarketOrder(invalidPayload as any)).rejects.toThrow();
      expect(enqueueOrderJob).not.toHaveBeenCalled();
    });

    it('should handle enqueue failure', async () => {
      const mockOrderId = 'order-123';
      (generateOrderId as jest.Mock).mockReturnValue(mockOrderId);
      (enqueueOrderJob as jest.Mock).mockRejectedValue(new Error('Queue error'));

      await expect(service.submitMarketOrder(validPayload)).rejects.toThrow('Queue error');
      expect(logger.app.info).toHaveBeenCalled();
    });

    it('should generate unique order IDs for each submission', async () => {
      const mockOrderId1 = 'order-1';
      const mockOrderId2 = 'order-2';
      (generateOrderId as jest.Mock)
        .mockReturnValueOnce(mockOrderId1)
        .mockReturnValueOnce(mockOrderId2);

      const result1 = await service.submitMarketOrder(validPayload);
      const result2 = await service.submitMarketOrder(validPayload);

      expect(result1.orderId).toBe(mockOrderId1);
      expect(result2.orderId).toBe(mockOrderId2);
      expect(enqueueOrderJob).toHaveBeenCalledTimes(2);
    });

    it('should include timestamp in job payload', async () => {
      const mockOrderId = 'order-timestamp-test';
      (generateOrderId as jest.Mock).mockReturnValue(mockOrderId);

      const beforeCall = new Date();
      const result = await service.submitMarketOrder(validPayload);
      const afterCall = new Date();

      expect(result.receivedAt).toBeDefined();
      const receivedAt = new Date(result.receivedAt);
      expect(receivedAt.getTime()).toBeGreaterThanOrEqual(beforeCall.getTime());
      expect(receivedAt.getTime()).toBeLessThanOrEqual(afterCall.getTime());
    });

    it('should validate amount is positive', async () => {
      const zeroAmountPayload = { ...validPayload, amount: 0 };

      await expect(service.submitMarketOrder(zeroAmountPayload)).rejects.toThrow();
      expect(enqueueOrderJob).not.toHaveBeenCalled();
    });

    it('should validate token addresses are non-empty', async () => {
      const emptyTokenIn = { ...validPayload, tokenIn: '' };

      await expect(service.submitMarketOrder(emptyTokenIn)).rejects.toThrow();
      expect(enqueueOrderJob).not.toHaveBeenCalled();
    });

    it('should validate order type is market', async () => {
      const invalidType = { ...validPayload, orderType: 'limit' as any };

      await expect(service.submitMarketOrder(invalidType)).rejects.toThrow();
      expect(enqueueOrderJob).not.toHaveBeenCalled();
    });

    it('should handle large amounts', async () => {
      const largeAmountPayload = { ...validPayload, amount: Number.MAX_SAFE_INTEGER };

      const mockOrderId = 'large-order';
      (generateOrderId as jest.Mock).mockReturnValue(mockOrderId);

      const result = await service.submitMarketOrder(largeAmountPayload);

      expect(result.amount).toBe(Number.MAX_SAFE_INTEGER);
      expect(enqueueOrderJob).toHaveBeenCalledWith(
        expect.objectContaining({ amount: Number.MAX_SAFE_INTEGER })
      );
    });
  });
});