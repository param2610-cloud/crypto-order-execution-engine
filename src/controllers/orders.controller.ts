import type { FastifyReply, FastifyRequest } from 'fastify';
import type { SocketStream } from '@fastify/websocket';
import { orderService } from '@services/order.service';
import { websocketManager } from '@websockets/websocket.manager';
import { logger } from '@utils/logger';
import { orderHistoryService } from '@services/order-history.service';

type ExecuteOrderRequest = FastifyRequest<{ Body: unknown }>;

type OrderSocketRequest = FastifyRequest<{ Querystring: { orderId?: string } }>;

type OrderHistoryRequest = FastifyRequest<{ Querystring: { limit?: number; cursor?: string } }>;

/**
 * Handles the HTTP + WebSocket lifecycle for order execution requests.
 */
class OrdersController {
  async execute(request: ExecuteOrderRequest, reply: FastifyReply) {
    const job = await orderService.submitMarketOrder(request.body);

    websocketManager.sendStatus(job.orderId, 'pending');
    logger.app.info({ orderId: job.orderId }, 'Queued order and sent pending status');

    return reply.status(202).send({ orderId: job.orderId, status: 'pending' });
  }

  handleWebsocket(connection: SocketStream, request: OrderSocketRequest) {
    try {
      const { orderId } = request.query ?? {};
      console.log('Handling WS connection for orderId:', orderId);
      if (!orderId) {
        logger.ws.warn('WebSocket connection rejected due to missing orderId');
        connection.socket.close(1008, 'orderId query param required');
        return;
      }

      websocketManager.attach(orderId, connection.socket);
      websocketManager.sendStatus(orderId, 'pending');
      logger.ws.info({ orderId }, 'WS connected and sent pending status');
    } catch (error) {
      logger.ws.error({ error }, 'WS handler error');
      connection.socket.close(1011, 'Internal server error');
    }
  }

  async history(request: OrderHistoryRequest, reply: FastifyReply) {
    const { limit, cursor } = request.query ?? {};
    const result = await orderHistoryService.list({ limit, cursor });
    return reply.status(200).send(result);
  }
}

export const ordersController = new OrdersController();
