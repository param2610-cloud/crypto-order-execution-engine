import { buildApp } from './app';
import { env } from '@config/env';
import { logger } from '@utils/logger';
import { orderWorker } from '@queue/order.worker';
import { getConnection } from '@dex/solana';
import { initPostgres, closePostgres } from '@config/postgres';
import { orderHistoryService } from '@services/order-history.service';

const app = buildApp();

const start = async () => {
  try {
    await initPostgres();
    await orderHistoryService.init();
    await app.listen({ port: env.port, host: '0.0.0.0' });
    const connection = getConnection();
    logger.app.info({ port: env.port }, 'HTTP server started');
    logger.dex.info(
      { rpcUrl: env.solana.rpcUrl, rpcEndpoint: connection.rpcEndpoint ?? env.solana.rpcUrl },
      'Solana RPC configured',
    );
  } catch (error) {
    logger.app.error({ error }, 'Failed to start HTTP server');
    process.exit(1);
  }
};

start();

const shutdown = async (signal: NodeJS.Signals) => {
  logger.app.info({ signal }, 'Shutdown requested');
  try {
    await Promise.all([orderWorker.shutdown(), app.close(), closePostgres()]);
    process.exit(0);
  } catch (error) {
    logger.app.error({ error }, 'Graceful shutdown failed');
    process.exit(1);
  }
};

const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
signals.forEach((signal) => {
  process.on(signal, () => void shutdown(signal));
});
