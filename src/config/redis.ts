import IORedis, { RedisOptions } from 'ioredis';
import { env } from './env';
import { logger } from '@utils/logger';

/**
 * Provides shared Redis connection helpers for BullMQ queues, workers, and future caches.
 */
const baseOptions: RedisOptions = env.redis.url
  ? { maxRetriesPerRequest: null, lazyConnect: false }
  : {
      host: env.redis.host,
      port: env.redis.port,
      username: env.redis.username,
      password: env.redis.password,
      db: env.redis.db,
      maxRetriesPerRequest: null,
      lazyConnect: false
    };

const instantiateRedis = () => (env.redis.url ? new IORedis(env.redis.url, baseOptions) : new IORedis(baseOptions));

export const createRedisConnection = () => {
  const instance = instantiateRedis();
  instance.on('error', (error) => logger.app.error({ error }, 'Redis error'));
  instance.on('connect', () => logger.app.info('Redis connected'));
  return instance;
};

export const redis = createRedisConnection();
