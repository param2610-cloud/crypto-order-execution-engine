import { z } from 'zod';

/**
 * Shared request + job definitions for an order lifecycle. Day-2+ will extend this union with limit/sniper shapes.
 */
export const marketOrderSchema = z.object({
  tokenIn: z.string().min(1, 'tokenIn is required'),
  tokenOut: z.string().min(1, 'tokenOut is required'),
  amount: z.number().positive('amount must be positive'),
  orderType: z.literal('market')
});

export type MarketOrderInput = z.infer<typeof marketOrderSchema>;

export type OrderLifecycleStatus =
  | 'pending'
  | 'queued'
  | 'routing'
  | 'building'
  | 'submitted'
  | 'confirmed'
  | 'failed';

export interface OrderJobPayload extends MarketOrderInput {
  orderId: string;
  receivedAt: string;
  lastTxSignature?: string;
  emittedStatuses?: OrderLifecycleStatus[];
  lastError?: string;
}

export interface OrderStatusMessage {
  orderId: string;
  status: OrderLifecycleStatus;
  detail?: string;
}
