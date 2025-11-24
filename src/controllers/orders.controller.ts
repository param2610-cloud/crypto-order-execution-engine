import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { SocketStream } from '@fastify/websocket';
import WebSocket from 'ws';
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

  async executeWithUpgrade(app: FastifyInstance, request: ExecuteOrderRequest, reply: FastifyReply) {
    try {
      const job = await orderService.submitMarketOrder(request.body);
      websocketManager.sendStatus(job.orderId, 'pending');
      reply.header('x-order-id', job.orderId);

      const server = (app as any).websocketServer as WebSocket.Server | undefined;
      if (!server) {
        logger.ws.error('WebSocket server not initialized');
        return reply.status(500).send({ message: 'WebSocket server unavailable' });
      }

      reply.hijack();
      server.handleUpgrade(request.raw, request.raw.socket, Buffer.alloc(0), (socket) => {
        this.attachSocket(job.orderId, socket as WebSocket);
      });
    } catch (error) {
      logger.ws.error({ error }, 'Failed to execute POST+WS upgrade');
      if (!reply.raw.writableEnded) {
        reply.status(500).send({ message: error instanceof Error ? error.message : 'Failed to execute order' });
      }
    }
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

      this.attachSocket(orderId, connection.socket);
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

  private attachSocket(orderId: string, socket: WebSocket) {
    websocketManager.attach(orderId, socket);
    websocketManager.sendStatus(orderId, 'pending');
    logger.ws.info({ orderId }, 'WS connected and sent pending status');
  }
}

export const ordersController = new OrdersController();
