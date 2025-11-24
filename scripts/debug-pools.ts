import { Connection, PublicKey } from '@solana/web3.js';
import { loadDevnetRaydium } from '../src/dex/raydium.api';
import { env } from '../src/config/env';
import { getWallet } from '../src/dex/solana';

const formatError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }
  return typeof error === 'object' && error !== null ? JSON.stringify(error) : String(error);
};

async function reportAccount(connection: Connection, id: string) {
  try {
    const info = await connection.getAccountInfo(new PublicKey(id), 'confirmed');
    if (!info) {
      console.log(id, 'account not found on RPC');
      return;
    }
    console.log(id, 'account found, lamports=', info.lamports, 'dataLen=', info.data?.length ?? 0, 'owner=', info.owner.toBase58());
  } catch (error) {
    console.error('account lookup failed', id, formatError(error));
  }
}

async function main() {
  const rpc = process.env.SOLANA_RPC_URL ?? env.solana.rpcUrl ?? 'https://api.devnet.solana.com';
  console.log('Using RPC:', rpc);
  const connection = new Connection(rpc, 'confirmed');

  const poolIds = [
    '9ufEUtRhUvDdA6G3gUE7P7Tdqes8M3Pj6DPd7QyYfXJt',
    'FNZtgxZ4PMBVXct8edvnRSwqYWx7gHWc1Ktu4oYcVc6E',
    'ExgKbDxQiZf8FccN39zwFgME8gV9JSFu9v5zbjH54P6A',
  ];

  console.log('Checking on-chain accounts...');
  for (const id of poolIds) {
    await reportAccount(connection, id);
  }

  console.log('Initializing Raydium loader for getRpcPoolInfo tests');
  try {
    const raydium = await loadDevnetRaydium({
      connection,
      owner: getWallet(),
      cluster: 'devnet',
      disableFeatureCheck: true,
      urlConfigs: {
        BASE_HOST: 'https://api-v3-devnet.raydium.io',
        CHECK_AVAILABILITY: '/v3/main/AvailabilityCheckAPI',
        TOKEN_LIST: '/v3/main/mint/list',
        RPCS: '/v3/main/rpcs',
        INFO: '/v3/main/info',
      },
      logRequests: false,
    });

    for (const id of poolIds) {
      try {
        console.log('Calling cpmm.getRpcPoolInfo for', id);
        const poolInfo = await (raydium as any).cpmm.getRpcPoolInfo(new PublicKey(id));
        console.log('Pool info:', id, !!poolInfo);
        if (poolInfo) {
          console.log(
            'mints', poolInfo?.mintA?.toBase58?.() ?? poolInfo?.mintA,
            poolInfo?.mintB?.toBase58?.() ?? poolInfo?.mintB,
            'reserves', poolInfo?.baseReserve?.toString?.(), poolInfo?.quoteReserve?.toString?.(),
          );
        }
      } catch (error) {
        console.error('cpmm.getRpcPoolInfo error for', id, formatError(error));
      }
    }
  } catch (error) {
    console.error('Raydium init failed:', formatError(error));
  }
}

main().catch((error) => {
  console.error('Debug script failed:', error?.stack ?? error);
  process.exit(1);
});
