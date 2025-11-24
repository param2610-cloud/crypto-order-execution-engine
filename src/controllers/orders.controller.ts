import type { FastifyReply, FastifyRequest } from 'fastify';
import type { SocketStream } from '@fastify/websocket';
import { orderService } from '@services/order.service';
import { websocketManager } from '@ws/websocket.manager';
import { logger } from '@utils/logger';

type ExecuteOrderRequest = FastifyRequest<{ Body: unknown }>;

type OrderSocketRequest = FastifyRequest<{ Querystring: { orderId?: string } }>;

/**
 * Handles the HTTP + WebSocket lifecycle for order execution requests.
 */
class OrdersController {
  async execute(request: ExecuteOrderRequest, reply: FastifyReply) {
    const job = await orderService.submitMarketOrder(request.body);

    websocketManager.sendStatus(job.orderId, 'pending');

    return reply.status(202).send({ orderId: job.orderId, status: 'pending' });
  }

  handleWebsocket(connection: SocketStream, request: OrderSocketRequest) {
    const { orderId } = request.query ?? {};
    if (!orderId) {
      logger.ws.warn('WebSocket connection rejected due to missing orderId');
      connection.socket.close(1008, 'orderId query param required');
      return;
    }

    websocketManager.attach(orderId, connection.socket);
    websocketManager.sendStatus(orderId, 'pending');
  }
}

export const ordersController = new OrdersController();
