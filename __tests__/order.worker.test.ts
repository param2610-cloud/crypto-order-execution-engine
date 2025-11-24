import { OrderWorker } from '@queue/order.worker';
import { orderQueue, enqueueOrderJob } from '@queue/order.queue';
import { OrderJobPayload } from '@type-defs/order.types';
import { websocketManager } from '@ws/websocket.manager';

jest.mock('@queue/order.queue', () => {
  const orderQueue = {
    add: jest.fn(async (_name?: string, _payload?: any, _options?: any) => undefined)
  };

  return {
    orderQueue,
    enqueueOrderJob: jest.fn(async (payload, jobOptions) => {
      await orderQueue.add('execute-order', payload, jobOptions);
    })
  };
});
jest.mock('@ws/websocket.manager');
jest.mock('@dex/router', () => ({
  dexRouter: {
    findBestRoute: jest.fn().mockResolvedValue({
      bestDex: 'raydium',
      quote: { poolId: 'test-pool' },
      buildTransaction: jest.fn().mockResolvedValue({ transaction: {}, signers: [] })
    })
  }
}));
jest.mock('@dex/solana', () => ({
  sendAndConfirm: jest.fn().mockResolvedValue('test-signature')
}));

// Mock the processor function
jest.mock('@queue/order.worker', () => ({
  OrderWorker: jest.fn().mockImplementation(() => ({
    shutdown: jest.fn()
  })),
  orderProcessor: jest.fn()
}));

describe('OrderWorker', () => {
  let worker: OrderWorker;

  beforeEach(() => {
    jest.clearAllMocks();
    worker = new OrderWorker();
  });

  afterEach(async () => {
    await worker.shutdown();
  });

  describe('Queue Integration', () => {
    it('should enqueue order job with correct options', async () => {
      const mockPayload: OrderJobPayload = {
        orderId: 'test-order',
        tokenIn: 'token-in',
        tokenOut: 'token-out',
        amount: 1000,
        orderType: 'market',
        receivedAt: new Date().toISOString()
      };

      await enqueueOrderJob(mockPayload);

      expect(orderQueue.add).toHaveBeenCalledWith('execute-order', mockPayload, undefined);
    });

    it('should support custom job options', async () => {
      const mockPayload: OrderJobPayload = {
        orderId: 'test-order',
        tokenIn: 'token-in',
        tokenOut: 'token-out',
        amount: 1000,
        orderType: 'market',
        receivedAt: new Date().toISOString()
      };

      const jobOptions = { delay: 1000 };
      await enqueueOrderJob(mockPayload, jobOptions);

      expect(orderQueue.add).toHaveBeenCalledWith('execute-order', mockPayload, jobOptions);
    });
  });
});