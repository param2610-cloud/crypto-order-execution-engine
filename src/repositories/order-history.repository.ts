import { Pool } from 'pg';
import { getPostgresPool } from '@config/postgres';
import { OrderLifecycleStatus } from '@type-defs/order.types';
import { QuoteResponse } from '@dex/router.interface';
import { logger } from '@utils/logger';

export interface StatusHistoryEntry {
  status: OrderLifecycleStatus;
  detail?: string | null;
  link?: string | null;
  recordedAt: string;
}

export interface OrderHistoryRecord {
  orderId: string;
  orderType: string;
  tokenIn: string;
  tokenOut: string;
  amount: string;
  status: OrderLifecycleStatus;
  dex?: string | null;
  txHash?: string | null;
  executedAmount?: string | null;
  quoteResponse?: Record<string, unknown> | null;
  statusHistory: StatusHistoryEntry[];
  lastError?: string | null;
  explorerLink?: string | null;
  receivedAt: string;
  updatedAt: string;
}

export interface ListOrdersParams {
  limit: number;
  cursor?: string | null;
}

export interface ListOrdersResult {
  rows: OrderHistoryRecord[];
  nextCursor: string | null;
}

interface NewOrderRecord {
  orderId: string;
  orderType: string;
  tokenIn: string;
  tokenOut: string;
  amount: number;
  receivedAt: string;
  status: OrderLifecycleStatus;
  detail?: string;
}

interface AppendStatusParams {
  orderId: string;
  status: OrderLifecycleStatus;
  detail?: string;
  link?: string;
  explorerLink?: string;
  txHash?: string;
  dex?: string;
  executedAmount?: string;
  lastError?: string;
}

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS order_history (
  order_id VARCHAR(64) PRIMARY KEY,
  order_type VARCHAR(16) NOT NULL,
  token_in VARCHAR(64) NOT NULL,
  token_out VARCHAR(64) NOT NULL,
  amount NUMERIC(38, 18) NOT NULL,
  status VARCHAR(32) NOT NULL,
  dex VARCHAR(32),
  tx_hash VARCHAR(128),
  executed_amount NUMERIC(38, 18),
  quote_response JSONB,
  status_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_error TEXT,
  explorer_link TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

const UPDATED_AT_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS idx_order_history_updated_at
ON order_history (updated_at DESC);
`;

const STATUS_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS idx_order_history_status
ON order_history (status);
`;

const listQuery = `
SELECT
  order_id,
  order_type,
  token_in,
  token_out,
  amount,
  status,
  dex,
  tx_hash,
  executed_amount,
  quote_response,
  status_history,
  last_error,
  explorer_link,
  received_at,
  updated_at
FROM order_history
WHERE ($2::timestamptz IS NULL OR updated_at < $2::timestamptz)
ORDER BY updated_at DESC
LIMIT $1;
`;

const toIsoString = (value: unknown): string => {
  if (value instanceof Date) return value.toISOString();
  return new Date(value as string).toISOString();
};

const toHistoryEntries = (value: unknown): StatusHistoryEntry[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => ({
      status: entry.status as OrderLifecycleStatus,
      detail: entry.detail ?? null,
      link: entry.link ?? null,
      recordedAt: entry.recordedAt ? new Date(entry.recordedAt).toISOString() : new Date().toISOString()
    }))
    .filter((entry) => Boolean(entry.status));
};

class OrderHistoryRepository {
  private initialized = false;

  private get pool(): Pool {
    return getPostgresPool();
  }

  async init() {
    if (this.initialized) return;
    await this.pool.query(CREATE_TABLE_SQL);
    await this.pool.query(UPDATED_AT_INDEX_SQL);
    await this.pool.query(STATUS_INDEX_SQL);
    this.initialized = true;
    logger.app.info('order_history table ready');
  }

  async insertOrder(record: NewOrderRecord) {
    const historyEntry = {
      status: record.status,
      detail: record.detail ?? 'Order accepted',
      recordedAt: record.receivedAt ?? new Date().toISOString()
    } satisfies StatusHistoryEntry;

    const query = `
      INSERT INTO order_history (
        order_id, order_type, token_in, token_out, amount, status, status_history, received_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, jsonb_build_array($7::jsonb), $8::timestamptz, $8::timestamptz
      )
      ON CONFLICT (order_id) DO NOTHING;
    `;

    await this.pool.query(query, [
      record.orderId,
      record.orderType,
      record.tokenIn,
      record.tokenOut,
      record.amount,
      record.status,
      JSON.stringify(historyEntry),
      record.receivedAt
    ]);
  }

  async appendStatus(params: AppendStatusParams) {
    const historyEntry = {
      status: params.status,
      detail: params.detail ?? null,
      link: params.link ?? null,
      recordedAt: new Date().toISOString()
    } satisfies StatusHistoryEntry;

    const explorerLink = params.explorerLink ?? params.link ?? null;

    const sets = [
      'status = $2',
      'status_history = status_history || jsonb_build_array($3::jsonb)',
      'updated_at = NOW()'
    ];

    const values: Array<string | null> = [params.orderId, params.status, JSON.stringify(historyEntry)];
    let index = 4;

    if (explorerLink) {
      sets.push(`explorer_link = $${index}`);
      values.push(explorerLink);
      index += 1;
    }

    if (params.txHash) {
      sets.push(`tx_hash = $${index}`);
      values.push(params.txHash);
      index += 1;
    }

    if (params.dex) {
      sets.push(`dex = $${index}`);
      values.push(params.dex);
      index += 1;
    }

    if (params.executedAmount) {
      sets.push(`executed_amount = $${index}`);
      values.push(params.executedAmount);
      index += 1;
    }

    if (params.lastError) {
      sets.push(`last_error = $${index}`);
      values.push(params.lastError);
      index += 1;
    }

    const query = `UPDATE order_history SET ${sets.join(', ')} WHERE order_id = $1`;
    const result = await this.pool.query(query, values);
    if (result.rowCount === 0) {
      logger.app.warn({ orderId: params.orderId }, 'appendStatus called before order record existed');
    }
  }

  async recordRoutingDecision(orderId: string, quote: QuoteResponse) {
    const payload = {
      dex: quote.dex,
      poolId: quote.poolId,
      estimatedOut: quote.estimatedOut.toString(),
      minOut: quote.minOut.toString(),
      feeBps: quote.feeBps,
      priceImpactBps: quote.priceImpactBps
    };

    const query = `
      UPDATE order_history
      SET dex = $2,
          quote_response = $3::jsonb,
          updated_at = NOW()
      WHERE order_id = $1;
    `;

    await this.pool.query(query, [orderId, quote.dex, JSON.stringify(payload)]);
  }

  async listOrders(params: ListOrdersParams): Promise<ListOrdersResult> {
    const cursor = params.cursor ?? null;
    const result = await this.pool.query(listQuery, [params.limit, cursor]);

    const rows: OrderHistoryRecord[] = result.rows.map((row: Record<string, any>) => ({
      orderId: row.order_id,
      orderType: row.order_type,
      tokenIn: row.token_in,
      tokenOut: row.token_out,
      amount: row.amount,
      status: row.status,
      dex: row.dex,
      txHash: row.tx_hash,
      executedAmount: row.executed_amount,
      quoteResponse: row.quote_response,
      statusHistory: toHistoryEntries(row.status_history),
      lastError: row.last_error,
      explorerLink: row.explorer_link,
      receivedAt: toIsoString(row.received_at),
      updatedAt: toIsoString(row.updated_at)
    }));

    const nextCursor = rows.length === params.limit ? rows[rows.length - 1].updatedAt : null;
    return { rows, nextCursor };
  }
}

export const orderHistoryRepository = new OrderHistoryRepository();
