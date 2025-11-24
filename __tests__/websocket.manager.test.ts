import { WebSocket } from 'ws';
import { websocketManager } from '../src/websockets/websocket.manager';
import { OrderLifecycleStatus } from '../src/types/order.types';
import { logger } from '../src/utils/logger';

describe('WebSocketManager', () => {
  let mockSocket: any;

  beforeEach(() => {
    mockSocket = {
      readyState: WebSocket.OPEN,
      send: jest.fn(),
      close: jest.fn(),
      on: jest.fn(),
      removeListener: jest.fn()
    };
  });

  afterEach(() => {
    websocketManager.reset();
    jest.clearAllMocks();
  });

  describe('attach', () => {
    it('should attach socket to orderId', () => {
      websocketManager.attach('order-123', mockSocket);

      expect(mockSocket.on).toHaveBeenCalledWith('close', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should send pending messages when attaching', () => {
      // Send a message before attaching
      websocketManager.send('order-123', { orderId: 'order-123', status: 'pending' });

      websocketManager.attach('order-123', mockSocket);

      expect(mockSocket.send).toHaveBeenCalledWith(JSON.stringify({ orderId: 'order-123', status: 'pending' }));
    });

    it('should handle socket close', () => {
      websocketManager.attach('order-123', mockSocket);

      // Simulate close event
      const closeCall = mockSocket.on.mock.calls.find((call: any) => call[0] === 'close');
      if (closeCall) {
        const closeHandler = closeCall[1];
        closeHandler();
      }

      // Should detach the socket
      expect(websocketManager.sendStatus('order-123', 'pending')).toBeUndefined(); // No error, just no-op
    });

    it('should handle socket error', () => {
      websocketManager.attach('order-123', mockSocket);

      const errorCall = mockSocket.on.mock.calls.find((call: any) => call[0] === 'error');
      if (errorCall) {
        const errorHandler = errorCall[1];
        errorHandler(new Error('Socket error'));
      }

      expect(logger.ws.error).toHaveBeenCalled();
    });
  });

  describe('send and sendStatus', () => {
    it('should send message to attached socket', () => {
      websocketManager.attach('order-123', mockSocket);

      websocketManager.sendStatus('order-123', 'confirmed', 'tx-signature');

      expect(mockSocket.send).toHaveBeenCalledWith(
        JSON.stringify({ orderId: 'order-123', status: 'confirmed', detail: 'tx-signature' })
      );
    });

    it('should queue messages when socket not attached', () => {
      websocketManager.sendStatus('order-123', 'pending');

      // Attach later
      websocketManager.attach('order-123', mockSocket);

      expect(mockSocket.send).toHaveBeenCalledWith(
        JSON.stringify({ orderId: 'order-123', status: 'pending' })
      );
    });

    it('should not send when socket is not open', () => {
      Object.defineProperty(mockSocket, 'readyState', { value: WebSocket.CLOSED, writable: true });
      websocketManager.attach('order-123', mockSocket);

      websocketManager.sendStatus('order-123', 'confirmed');

      expect(mockSocket.send).not.toHaveBeenCalled();
    });

    it('should handle multiple messages in queue', () => {
      websocketManager.sendStatus('order-123', 'pending');
      websocketManager.sendStatus('order-123', 'queued');
      websocketManager.sendStatus('order-123', 'routing');

      websocketManager.attach('order-123', mockSocket);

      expect(mockSocket.send).toHaveBeenCalledTimes(3);
      expect(mockSocket.send).toHaveBeenNthCalledWith(1, JSON.stringify({ orderId: 'order-123', status: 'pending' }));
      expect(mockSocket.send).toHaveBeenNthCalledWith(2, JSON.stringify({ orderId: 'order-123', status: 'queued' }));
      expect(mockSocket.send).toHaveBeenNthCalledWith(3, JSON.stringify({ orderId: 'order-123', status: 'routing' }));
    });
  });

  describe('disconnect', () => {
    it('should close socket and remove from manager', () => {
      websocketManager.attach('order-123', mockSocket);

      websocketManager.disconnect('order-123');

      expect(mockSocket.close).toHaveBeenCalled();
      // Subsequent sends should not reach the socket
      websocketManager.sendStatus('order-123', 'confirmed');
      expect(mockSocket.send).not.toHaveBeenCalled();
    });

    it('should handle non-existent orderId gracefully', () => {
      expect(() => websocketManager.disconnect('non-existent')).not.toThrow();
    });

    it('should handle closing already closing socket', () => {
      Object.defineProperty(mockSocket, 'readyState', { value: WebSocket.CLOSING, writable: true });
      websocketManager.attach('order-123', mockSocket);

      websocketManager.disconnect('order-123');

      expect(mockSocket.close).toHaveBeenCalled();
    });
  });

  describe('Lifecycle Integration', () => {
    it('should handle complete order lifecycle', () => {
      websocketManager.attach('order-123', mockSocket);

      const statuses: OrderLifecycleStatus[] = ['pending', 'queued', 'routing', 'building', 'submitted', 'confirmed'];

      statuses.forEach(status => {
        websocketManager.sendStatus('order-123', status);
      });

      expect(mockSocket.send).toHaveBeenCalledTimes(6);
      statuses.forEach((status, index) => {
        expect(mockSocket.send).toHaveBeenNthCalledWith(
          index + 1,
          JSON.stringify({ orderId: 'order-123', status })
        );
      });
    });

    it('should handle failed orders with error details', () => {
      websocketManager.attach('order-123', mockSocket);

      websocketManager.sendStatus('order-123', 'failed', 'Insufficient liquidity');

      expect(mockSocket.send).toHaveBeenCalledWith(
        JSON.stringify({ orderId: 'order-123', status: 'failed', detail: 'Insufficient liquidity' })
      );
    });

    it('should support multiple concurrent orders', () => {
      const socket1 = { ...mockSocket, send: jest.fn() };
      const socket2 = { ...mockSocket, send: jest.fn() };

      websocketManager.attach('order-1', socket1 as any);
      websocketManager.attach('order-2', socket2 as any);

      websocketManager.sendStatus('order-1', 'confirmed', 'sig1');
      websocketManager.sendStatus('order-2', 'confirmed', 'sig2');

      expect(socket1.send).toHaveBeenCalledWith(
        JSON.stringify({ orderId: 'order-1', status: 'confirmed', detail: 'sig1' })
      );
      expect(socket2.send).toHaveBeenCalledWith(
        JSON.stringify({ orderId: 'order-2', status: 'confirmed', detail: 'sig2' })
      );
    });
  });
});
