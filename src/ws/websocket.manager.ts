import type { WebSocket } from 'ws';
import { OrderStatusMessage, OrderLifecycleStatus } from '@type-defs/order.types';
import { logger } from '@utils/logger';

/**
 * Tracks the one-to-one relationship between an orderId and its WebSocket so workers can stream updates.
 */
class WebSocketManager {
  private readonly sockets = new Map<string, WebSocket>();
  private readonly pendingMessages = new Map<string, OrderStatusMessage[]>();

  attach(orderId: string, socket: WebSocket) {
    this.sockets.set(orderId, socket);
    logger.ws.info({ orderId }, 'WebSocket attached');

    socket.on('close', () => this.disconnect(orderId));
    socket.on('error', (error: Error) => {
      logger.ws.error({ orderId, error }, 'WebSocket error');
      this.disconnect(orderId);
    });

    const backlog = this.pendingMessages.get(orderId);
    if (backlog?.length) {
      backlog.forEach((message) => socket.send(JSON.stringify(message)));
      this.pendingMessages.delete(orderId);
      logger.ws.info({ orderId, count: backlog.length }, 'Sent queued WS messages');
    }
  }

  send(orderId: string, payload: OrderStatusMessage) {
    const socket = this.sockets.get(orderId);
    if (!socket || socket.readyState !== socket.OPEN) {
      const queued = this.pendingMessages.get(orderId) ?? [];
      queued.push(payload);
      this.pendingMessages.set(orderId, queued);
      console.log(`WS message queued for ${orderId}:`, payload.status);
      logger.ws.debug({ orderId, status: payload.status }, 'WS message queued');
      return;
    }

    try {
      socket.send(JSON.stringify(payload));
      console.log(`WS message sent to ${orderId}:`, payload.status);
      logger.ws.debug({ orderId, status: payload.status }, 'WS message sent');
    } catch (error) {
      console.error(`Failed to send WS message to ${orderId}:`, error);
      logger.ws.error({ orderId, error }, 'Failed to send WS message');
    }
  }

  sendStatus(orderId: string, status: OrderLifecycleStatus, detail?: string, link?: string) {
    logger.ws.info({ orderId, status, detail, link }, 'Sending WS status');
    this.send(orderId, { orderId, status, detail, link });
  }

  disconnect(orderId: string) {
    const socket = this.sockets.get(orderId);
    if (!socket) return;

    try {
      if (socket.readyState === socket.OPEN || socket.readyState === socket.CLOSING) {
        socket.close();
      }
    } finally {
      this.sockets.delete(orderId);
      logger.ws.info({ orderId }, 'WebSocket detached');
    }
  }
}

export const websocketManager = new WebSocketManager();
