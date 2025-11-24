import { FastifyInstance } from 'fastify';
import fs from 'fs';
import path from 'path';

/**
 * Logs route for retrieving application logs in production.
 * This provides an alternative to console logs when hosted on platforms like Railway.
 */
export async function logsRoutes(app: FastifyInstance) {
  app.get('/logs', async (request, reply) => {
    const logsDir = path.join(process.cwd(), 'logs');
    const logFile = path.join(logsDir, 'app.log');

    try {
      if (!fs.existsSync(logFile)) {
        return reply.code(404).send({ error: 'Log file not found' });
      }

      const logs = fs.readFileSync(logFile, 'utf-8');
      const lines = logs.split('\n').filter(line => line.trim()).slice(-100); // Last 100 lines

      reply.type('text/plain').send(lines.join('\n'));
    } catch (error) {
      app.log.error(error, 'Failed to read logs');
      reply.code(500).send({ error: 'Failed to read logs' });
    }
  });
}
