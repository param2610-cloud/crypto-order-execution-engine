import { Job, Processor, QueueEvents, Worker } from 'bullmq';
import { env } from '@config/env';
import { createRedisConnection } from '@config/redis';
import { OrderJobPayload, OrderLifecycleStatus } from '@type-defs/order.types';
import { websocketManager } from '@ws/websocket.manager';
import { logger } from '@utils/logger';
import { dexRouter } from '@dex/router';
import { logSignatureExplorerHint, sendAndConfirm } from '@dex/solana';

const ORDER_QUEUE_NAME = 'orders';
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = Math.max(1, env.queue.rateLimit);
let availableSlots = RATE_LIMIT_MAX;
let windowStartedAt = Date.now();

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const acquireRateLimit = async () => {
  while (true) {
    const now = Date.now();
    if (now - windowStartedAt >= RATE_LIMIT_WINDOW_MS) {
      windowStartedAt = now;
      availableSlots = RATE_LIMIT_MAX;
    }

    if (availableSlots > 0) {
      availableSlots -= 1;
      return;
    }

    await delay(200);
  }
};

const recordStatus = async (job: Job<OrderJobPayload>, status: OrderLifecycleStatus, detail?: string, link?: string) => {
  const emitted = new Set(job.data.emittedStatuses ?? []);
  if (emitted.has(status)) {
    if (detail) websocketManager.sendStatus(job.data.orderId, status, detail, link);
    return;
  }

  emitted.add(status);
  job.data.emittedStatuses = Array.from(emitted);
  try {
    await job.updateData(job.data);
  } catch (error) {
    logger.queue.warn({ orderId: job.data.orderId, status, error }, 'Failed to persist lifecycle status');
  }
  websocketManager.sendStatus(job.data.orderId, status, detail, link);
};

export const orderProcessor: Processor<OrderJobPayload> = async (job: Job<OrderJobPayload>) => {
  logger.queue.info({ orderId: job.data.orderId }, 'Order job dequeued');
  await recordStatus(job, 'queued');
  await recordStatus(job, 'routing');
  await acquireRateLimit();

  try {
    const route = await dexRouter.findBestRoute(job.data);
    await recordStatus(job, 'building');
    const built = await route.buildTransaction();

    const signature = await sendAndConfirm(built.transaction, {
      additionalSigners: built.signers,
      onSubmitted: async (sig) => {
        job.data.lastTxSignature = sig;
        await recordStatus(job, 'submitted', sig, `https://explorer.solana.com/tx/${sig}?cluster=devnet`);
      }
    });

    logSignatureExplorerHint(signature);
    await recordStatus(job, 'confirmed', signature, `https://explorer.solana.com/tx/${signature}?cluster=devnet`);

    return {
      jobId: job.id,
      dex: route.bestDex,
      signature
    };
  } catch (error) {
    job.data.lastError = error instanceof Error ? error.message : String(error);
    try {
      await job.updateData(job.data);
    } catch (updateError) {
      logger.queue.warn({ orderId: job.data.orderId, updateError }, 'Failed to persist error payload');
    }
    logger.queue.error({ orderId: job.data.orderId, error }, 'Order execution failed');
    throw error;
  }
};

/**
 * Starts the BullMQ worker responsible for order execution.
 * Later days will extend this worker with quote aggregation + transaction submission.
 */
export class OrderWorker {
  private readonly worker: Worker<OrderJobPayload>;
  private readonly events: QueueEvents;

  constructor() {
    const connection = createRedisConnection();
    this.worker = new Worker<OrderJobPayload>(ORDER_QUEUE_NAME, orderProcessor, {
      connection,
      concurrency: env.queue.concurrency
    });

    this.events = new QueueEvents(ORDER_QUEUE_NAME, {
      connection: createRedisConnection()
    });

    this.bindListeners();
  }

  private bindListeners() {
    this.worker.on('completed', (job: Job<OrderJobPayload>) => {
      logger.queue.info({ jobId: job.id, orderId: job?.data?.orderId }, 'Order job completed');
    });

    this.worker.on('failed', (job: Job<OrderJobPayload> | undefined, error: Error) => {
      const orderId = job?.data?.orderId;
      logger.queue.error({ orderId, error }, 'Order job failed');
      if (job) {
        void recordStatus(job, 'failed', error.message);
      }
    });

    this.worker.on('error', (error: Error) => {
      logger.queue.error({ error }, 'Worker runtime error');
    });

    this.events.on('failed', ({ jobId, failedReason }: { jobId?: string; failedReason: string }) => {
      logger.queue.error({ jobId, failedReason }, 'QueueEvents failed event');
    });
  }

  async shutdown() {
    await Promise.all([this.worker.close(), this.events.close()]);
  }
}

export const orderWorker = new OrderWorker();
