import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { ZodError } from 'zod';
import { ordersRoute } from '@routes/orders.route';
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

  app.register(websocket, {
    options: {
      maxPayload: 1024 * 64
    }
  });

  app.register(ordersRoute);

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
