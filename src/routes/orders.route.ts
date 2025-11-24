import { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { ordersController } from '@controllers/orders.controller';

/**
 * Registers HTTP + WebSocket endpoints for /api/orders/execute.
 */
export const ordersRoute: FastifyPluginAsync = async (fastify) => {
  fastify.route<{ Body: unknown }>({
    method: 'POST',
    url: '/api/orders/execute',
    handler: (request, reply) => ordersController.execute(request, reply)
  });

  fastify.route<{ Querystring: { orderId?: string } }>({
    method: 'GET',
    url: '/api/orders/execute',
    websocket: true,
    handler: async (_, reply) => {
      reply.code(405).send({ message: 'Use WebSocket upgrade for this path' });
    },
    wsHandler: (connection, request: FastifyRequest<{ Querystring: { orderId?: string } }>) =>
      ordersController.handleWebsocket(connection, request)
  });
};
