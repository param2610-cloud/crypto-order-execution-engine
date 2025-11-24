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
    }
  }

  send(orderId: string, payload: OrderStatusMessage) {
    const socket = this.sockets.get(orderId);
    if (!socket || socket.readyState !== socket.OPEN) {
      const queued = this.pendingMessages.get(orderId) ?? [];
      queued.push(payload);
      this.pendingMessages.set(orderId, queued);
      return;
    }

    socket.send(JSON.stringify(payload));
  }

  sendStatus(orderId: string, status: OrderLifecycleStatus, detail?: string) {
    this.send(orderId, { orderId, status, detail });
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
