import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import cors from '@fastify/cors';
import { ZodError } from 'zod';
import { ordersRoute } from '@routes/orders.route';
import { logsRoutes } from '@routes/logs.route';
import { logger } from '@utils/logger';

/**
 * Creates and configures the Fastify application instance.
 */
export const buildApp = () => {
  const app = Fastify({
    logger: false,
    disableRequestLogging: true
  });

  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  app.register(cors, {
    origin: 'https://crypto-order-execution-engine.vercel.app', // Allow specific origin for production
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  });

  app.register(websocket, {
    options: {
      maxPayload: 1024 * 64
    }
  });

  app.register(ordersRoute);
  app.register(logsRoutes);

  app.setErrorHandler((error, request, reply) => {
    logger.app.error({ err: error, url: request.url }, 'Unhandled error');
    if (error instanceof ZodError) {
      reply.status(400).send({ message: 'Invalid payload', issues: error.issues });
      return;
    }
    reply.status(error.statusCode ?? 500).send({
      message: error.message ?? 'Unexpected error'
    });
  });

  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({ message: 'Route not found' });
  });

  return app;
};
