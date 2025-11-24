import { QuoteResponse } from '@dex/router.interface';
import { orderHistoryRepository, OrderHistoryRecord } from '@repositories/order-history.repository';
import { OrderJobPayload, OrderLifecycleStatus } from '@type-defs/order.types';

export interface ListHistoryParams {
  limit?: number;
  cursor?: string;
}

export interface ListHistoryResponse {
  data: OrderHistoryRecord[];
  pagination: {
    limit: number;
    nextCursor: string | null;
    hasMore: boolean;
  };
}

class OrderHistoryService {
  private initialization?: Promise<void>;

  async init() {
    if (!this.initialization) {
      this.initialization = orderHistoryRepository.init();
    }
    await this.initialization;
  }

  private async ensureReady() {
    await this.init();
  }

  async recordNewOrder(order: OrderJobPayload) {
    await this.ensureReady();
    await orderHistoryRepository.insertOrder({
      orderId: order.orderId,
      orderType: order.orderType,
      tokenIn: order.tokenIn,
      tokenOut: order.tokenOut,
      amount: order.amount,
      receivedAt: order.receivedAt,
      status: 'pending',
      detail: 'Order accepted'
    });
  }

  async appendStatus(
    orderId: string,
    status: OrderLifecycleStatus,
    detail?: string,
    link?: string,
    extras?: { dex?: string; txHash?: string; executedAmount?: string; lastError?: string }
  ) {
    await this.ensureReady();
    await orderHistoryRepository.appendStatus({
      orderId,
      status,
      detail,
      link,
      explorerLink: link,
      dex: extras?.dex,
      txHash: extras?.txHash,
      executedAmount: extras?.executedAmount,
      lastError: extras?.lastError
    });
  }

  async recordRoutingDecision(orderId: string, quote: QuoteResponse) {
    await this.ensureReady();
    await orderHistoryRepository.recordRoutingDecision(orderId, quote);
  }

  async list(params: ListHistoryParams = {}): Promise<ListHistoryResponse> {
    await this.ensureReady();
    const normalizedLimit = Math.min(Math.max(params.limit ?? 50, 1), 200);
    const cursorIso = params.cursor && !Number.isNaN(Date.parse(params.cursor))
      ? new Date(params.cursor).toISOString()
      : null;

    const { rows, nextCursor } = await orderHistoryRepository.listOrders({
      limit: normalizedLimit,
      cursor: cursorIso
    });

    return {
      data: rows,
      pagination: {
        limit: normalizedLimit,
        nextCursor,
        hasMore: Boolean(nextCursor)
      }
    };
  }
}

export const orderHistoryService = new OrderHistoryService();
