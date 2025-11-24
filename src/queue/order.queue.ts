import { JobsOptions, Queue } from 'bullmq';
import { createRedisConnection } from '@config/redis';
import { env } from '@config/env';
import { logger } from '@utils/logger';
import { OrderJobPayload } from '@type-defs/order.types';

const ORDER_QUEUE_NAME = 'orders';

const queueConnection = createRedisConnection();

/**
 * Thin wrapper around BullMQ Queue so services do not rely on BullMQ directly.
 */
export const orderQueue = new Queue<OrderJobPayload, unknown, 'execute-order'>(ORDER_QUEUE_NAME, {
  connection: queueConnection,
  defaultJobOptions: {
    attempts: env.queue.retryAttempts,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 500
  }
});

export const enqueueOrderJob = async (payload: OrderJobPayload, jobOptions?: JobsOptions) => {
  logger.queue.info({ orderId: payload.orderId }, 'Queueing order');
  await orderQueue.add('execute-order', payload, jobOptions);
};
