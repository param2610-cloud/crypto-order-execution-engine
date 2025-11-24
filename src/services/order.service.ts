import { enqueueOrderJob } from '@queue/order.queue';
import { OrderJobPayload, MarketOrderInput, marketOrderSchema } from '@type-defs/order.types';
import { generateOrderId } from '@utils/id';
import { logger } from '@utils/logger';

/**
 * Encapsulates order validation + persistence before queueing.
 */
export class OrderService {
  async submitMarketOrder(payload: unknown): Promise<OrderJobPayload> {
    const parsed: MarketOrderInput = marketOrderSchema.parse(payload);
    const orderId = parsed.orderId || generateOrderId();

    const jobPayload: OrderJobPayload = {
      ...parsed,
      orderId,
      receivedAt: new Date().toISOString()
    };

    logger.app.info({ orderId, tokenIn: parsed.tokenIn, tokenOut: parsed.tokenOut }, 'Market order validated');
    await enqueueOrderJob(jobPayload);
    return jobPayload;
  }
}

export const orderService = new OrderService();
