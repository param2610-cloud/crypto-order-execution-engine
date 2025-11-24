import { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { ordersController } from '@controllers/orders.controller';

/**
 * Registers HTTP + WebSocket endpoints for /api/orders/execute.
 */
export const ordersRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: { limit?: number; cursor?: string } }>('/api/orders/history', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
          cursor: { type: 'string' }
        }
      }
    }
  }, (request, reply) => ordersController.history(request, reply));

  fastify.route<{ Body: unknown }>({
    method: 'POST',
    url: '/api/orders/execute',
    handler: (request, reply) => ordersController.execute(request, reply)
  });

  fastify.get('/api/orders/execute', {
    websocket: true,
    schema: {
      querystring: {
        type: 'object',
        properties: {
          orderId: { type: 'string' }
        },
        required: ['orderId']
      }
    }
  }, function (connection, request: FastifyRequest<{ Querystring: { orderId: string } }>) {
    try {
      console.log('WS upgrade detected for orderId:', request.query.orderId);
      ordersController.handleWebsocket(connection, request);
    } catch (error) {
      console.error('WS handler error:', error);
      connection.socket.close(1011, 'Internal server error');
    }
  });
};
