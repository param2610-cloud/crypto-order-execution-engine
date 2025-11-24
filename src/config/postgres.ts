import { Pool, PoolClient } from 'pg';
import { env } from '@config/env';
import { logger } from '@utils/logger';

let pool: Pool | null = null;

const createPool = (): Pool => {
  if (!env.database.url) {
    throw new Error('POSTGRES_URL environment variable is required to persist order history');
  }

  const instance = new Pool({
    connectionString: env.database.url,
    max: env.database.poolSize,
    idleTimeoutMillis: env.database.idleTimeoutMs,
    ssl: env.database.ssl ? { rejectUnauthorized: false } : undefined
  });

  instance.on('error', (error) => {
    logger.app.error({ error }, 'Unexpected PostgreSQL client error');
  });

  return instance;
};

export const getPostgresPool = (): Pool => {
  if (!pool) {
    pool = createPool();
  }
  return pool;
};

export const initPostgres = async () => {
  const client: PoolClient = await getPostgresPool().connect();
  try {
    await client.query('SELECT 1');
    logger.app.info('PostgreSQL connectivity verified');
  } finally {
    client.release();
  }
};

export const closePostgres = async () => {
  if (!pool) return;
  await pool.end();
  logger.app.info('PostgreSQL pool closed');
  pool = null;
};
