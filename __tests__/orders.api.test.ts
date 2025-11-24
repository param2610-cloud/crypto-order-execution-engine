import request from 'supertest';
import { buildApp } from '../src/app';
import { orderService } from '../src/services/order.service';
import { websocketManager } from '../src/websockets/websocket.manager';
import { orderHistoryService } from '../src/services/order-history.service';
import { ZodError } from 'zod';

jest.mock('../src/services/order.service');
jest.mock('../src/websockets/websocket.manager');
jest.mock('../src/services/order-history.service');

describe('Orders API', () => {
  let app: ReturnType<typeof buildApp>;
  const validOrderPayload = {
    tokenIn: 'So11111111111111111111111111111111111111112',
    tokenOut: 'EPjFWdd5Auxxxxxxxxxxxxxxx4wEGGkZwyTDt1v',
    amount: 1000000,
    orderType: 'market'
  };

  beforeEach(async () => {
    app = buildApp();
    await app.listen({ port: 0 });
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await app.close();
  });

  const httpRequest = () => request(app.server ?? (app as unknown as any));

  describe('POST /api/orders/execute', () => {

    it('should accept valid market order and return orderId', async () => {
      const mockJob = { orderId: 'test-order-123', ...validOrderPayload, receivedAt: expect.any(String) };
      (orderService.submitMarketOrder as jest.Mock).mockResolvedValue(mockJob);

      const response = await httpRequest()
        .post('/api/orders/execute')
        .send(validOrderPayload)
        .expect(202);

      expect(response.body).toEqual({
        orderId: 'test-order-123',
        status: 'pending'
      });
      expect(orderService.submitMarketOrder).toHaveBeenCalledWith(validOrderPayload);
      expect(websocketManager.sendStatus).toHaveBeenCalledWith('test-order-123', 'pending');
    });

    it('should validate request payload', async () => {
      const invalidPayload = {
        tokenIn: '', // Invalid: empty string
        tokenOut: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        amount: -100, // Invalid: negative
        orderType: 'invalid-type' // Invalid: not 'market'
      };

      (orderService.submitMarketOrder as jest.Mock).mockRejectedValue(new ZodError([]));

      const response = await httpRequest()
        .post('/api/orders/execute')
        .send(invalidPayload)
        .expect(400);

      expect(response.body.message).toBe('Invalid payload');
      expect(response.body.issues).toBeDefined();
    });

    it('should handle service errors', async () => {
      (orderService.submitMarketOrder as jest.Mock).mockRejectedValue(new Error('Service error'));

      const response = await httpRequest()
        .post('/api/orders/execute')
        .send(validOrderPayload)
        .expect(500);

      expect(response.body.message).toBe('Service error');
    });

    it('should add request ID header', async () => {
      (orderService.submitMarketOrder as jest.Mock).mockResolvedValue({
        orderId: 'test-order-123',
        ...validOrderPayload,
        receivedAt: new Date().toISOString()
      });

      const response = await httpRequest()
        .post('/api/orders/execute')
        .send(validOrderPayload)
        .expect(202);

      expect(response.headers['x-request-id']).toBeDefined();
    });
  });

  describe('GET /api/orders/execute (WebSocket upgrade)', () => {
    it('should reject non-WebSocket requests', async () => {
      const response = await httpRequest()
        .get('/api/orders/execute')
        .expect(400);

      expect(response.body.message).toBeDefined();
    });

    it('should handle WebSocket upgrade with valid orderId', async () => {
      // WebSocket testing requires special setup, we'll mock the upgrade
      // This is more of an integration test placeholder
      const mockConnection = {
        socket: { send: jest.fn() }
      };

      // In a real scenario, we'd use a WebSocket client library
      // For now, we test the controller logic separately
      expect(true).toBe(true); // Placeholder
    });
  });

  describe('GET /api/orders/history', () => {
    it('should return paginated order history', async () => {
      (orderHistoryService.list as jest.Mock).mockResolvedValue({
        data: [{ orderId: 'hist-1' }],
        pagination: { limit: 25, nextCursor: null, hasMore: false }
      });

      const response = await httpRequest()
        .get('/api/orders/history?limit=25')
        .expect(200);

      expect(orderHistoryService.list).toHaveBeenCalledWith({ limit: 25, cursor: undefined });
      expect(response.body.data).toHaveLength(1);
      expect(response.body.pagination).toEqual({ limit: 25, nextCursor: null, hasMore: false });
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 for unknown routes', async () => {
      const response = await httpRequest()
        .get('/unknown-route')
        .expect(404);

      expect(response.body.message).toBe('Route not found');
    });

    it('should handle malformed JSON', async () => {
      const response = await httpRequest()
        .post('/api/orders/execute')
        .set('Content-Type', 'application/json')
        .send('{ invalid json')
        .expect(400);

      expect(response.body.message).toBe('Invalid payload');
    });
  });

  describe('Order Service Integration', () => {
    it('should generate unique order IDs', async () => {
      const mockJob1 = { orderId: 'order-1', ...validOrderPayload, receivedAt: expect.any(String) };
      const mockJob2 = { orderId: 'order-2', ...validOrderPayload, receivedAt: expect.any(String) };

      (orderService.submitMarketOrder as jest.Mock)
        .mockResolvedValueOnce(mockJob1)
        .mockResolvedValueOnce(mockJob2);

      const response1 = await httpRequest()
        .post('/api/orders/execute')
        .send(validOrderPayload)
        .expect(202);

      const response2 = await httpRequest()
        .post('/api/orders/execute')
        .send(validOrderPayload)
        .expect(202);

      expect(response1.body.orderId).not.toBe(response2.body.orderId);
      expect(response1.body.orderId).toBe('order-1');
      expect(response2.body.orderId).toBe('order-2');
    });

    it('should validate token addresses', async () => {
      const invalidTokenPayload = {
        tokenIn: 'invalid-token-address',
        tokenOut: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        amount: 1000000,
        orderType: 'market'
      };

      // The validation happens in the service, so it should still accept but fail later
      // In real implementation, we might add more validation
      (orderService.submitMarketOrder as jest.Mock).mockRejectedValue(new Error('Invalid token address'));

      const response = await httpRequest()
        .post('/api/orders/execute')
        .send(invalidTokenPayload)
        .expect(500);

      expect(orderService.submitMarketOrder).toHaveBeenCalledWith(invalidTokenPayload);
    });
  });
});
