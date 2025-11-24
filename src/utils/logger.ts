import pino from 'pino';

/**
 * Centralized logger factory that exposes scoped loggers for each subsystem.
 * Future days can extend this to push logs to external sinks without touching callers.
 */
const baseLogger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  transport: process.env.NODE_ENV === 'development' ? { target: 'pino-pretty', options: { translateTime: 'SYS:standard' } } : undefined
});

export const logger = {
  base: baseLogger,
  app: baseLogger.child({ scope: 'http' }),
  ws: baseLogger.child({ scope: 'ws' }),
  queue: baseLogger.child({ scope: 'queue' }),
  dex: baseLogger.child({ scope: 'dex' })
};

export const getLogger = (scope: string) => baseLogger.child({ scope });
