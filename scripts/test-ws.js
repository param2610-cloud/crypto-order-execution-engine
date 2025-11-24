    const WebSocket = require('ws');

const orderId = process.argv[2] || 'test-order-123';

console.log(`Connecting to WS for orderId: ${orderId}`);

const ws = new WebSocket(`ws://localhost:8080/api/orders/execute?orderId=${orderId}`);

ws.on('open', () => {
  console.log('WebSocket connected');
});

ws.on('message', (data) => {
  console.log('Received message:', data.toString());
});

ws.on('error', (err) => {
  console.log('WebSocket error:', err.message);
});

ws.on('close', (code, reason) => {
  console.log('WebSocket closed:', code, reason.toString());
});

// Keep alive
setInterval(() => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.ping();
  }
}, 30000);