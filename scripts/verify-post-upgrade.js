#!/usr/bin/env node
/**
 * Smoke-tests the POST -> WebSocket upgrade flow using Undici's manual upgrade support.
 *
 * Usage:
 *   npm run verify:upgrade [http://localhost:8080]
 *   TARGET_URL=https://crypto-order-execution-engine-production.up.railway.app npm run verify:upgrade
 */
'use strict';

const { request } = require('undici');

const DEFAULT_TOKEN_IN = 'So11111111111111111111111111111111111111112';
const DEFAULT_TOKEN_OUT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

const resolveBaseUrl = () => {
  const cliArg = process.argv[2];
  if (cliArg && cliArg.trim()) return cliArg.trim().replace(/\/$/, '');
  if (process.env.TARGET_URL) return process.env.TARGET_URL.replace(/\/$/, '');
  return 'http://localhost:8080';
};

const payload = {
  tokenIn: process.env.TARGET_TOKEN_IN ?? DEFAULT_TOKEN_IN,
  tokenOut: process.env.TARGET_TOKEN_OUT ?? DEFAULT_TOKEN_OUT,
  amount: Number(process.env.TARGET_AMOUNT ?? '0.001'),
  orderType: 'market'
};

const stringify = (value) => JSON.stringify(value, null, 2);

async function main() {
  const baseUrl = resolveBaseUrl();
  const url = `${baseUrl}/api/orders/execute`;
  const body = JSON.stringify(payload);

  console.log('👉 Sending POST upgrade request to', url);
  console.log('   Payload:', stringify(payload));

  const upgradeResult = await new Promise((resolve, reject) => {
    request(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body).toString()
      },
      body,
      upgrade: 'websocket',
      onUpgrade: (res, socket) => resolve({ res, socket })
    }).catch(reject);
  });

  const { res, socket } = upgradeResult;
  if (res.statusCode !== 101) {
    throw new Error(`Expected HTTP 101 Switching Protocols, received ${res.statusCode}`);
  }

  const orderId = res.headers['x-order-id'] ?? res.headers['X-Order-Id'];
  console.log('✅ Upgrade acknowledged (101). orderId header =', orderId ?? '<missing>');

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      console.warn('⚠️  No WebSocket payload received within 5 seconds; closing socket.');
      socket.end();
      resolve();
    }, 5000);

    socket.once('data', (chunk) => {
      clearTimeout(timeout);
      console.log('📨 Raw WebSocket frame bytes (hex):', chunk.toString('hex'));
      socket.end();
      resolve();
    });

    socket.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });

  console.log('Done. If you saw a 101 response, intermediaries allowed the POST-based upgrade.');
}

main().catch((error) => {
  console.error('❌ Verification failed:', error);
  process.exit(1);
});
