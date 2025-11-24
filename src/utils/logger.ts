import pino from 'pino';
import fs from 'fs';
import path from 'path';

/**
 * Centralized logger factory that exposes scoped loggers for each subsystem.
 * Future days can extend this to push logs to external sinks without touching callers.
 */

// Create logs directory if it doesn't exist
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const baseLogger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  transport: process.env.NODE_ENV === 'development' ? { target: 'pino-pretty', options: { translateTime: 'SYS:standard' } } : undefined
}, pino.multistream([
  { stream: process.stdout },
  { stream: fs.createWriteStream(path.join(logsDir, 'app.log'), { flags: 'a' }) }
]));

export const logger = {
  base: baseLogger,
  app: baseLogger.child({ scope: 'http' }),
  ws: baseLogger.child({ scope: 'ws' }),
  queue: baseLogger.child({ scope: 'queue' }),
  dex: baseLogger.child({ scope: 'dex' })
};

export const getLogger = (scope: string) => baseLogger.child({ scope });
