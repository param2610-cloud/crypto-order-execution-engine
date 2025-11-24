import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import {
  Api,
  ApiV3Token,
  ApiV3TokenRes,
  Raydium,
  RaydiumLoadParams,
} from '@raydium-io/raydium-sdk-v2';
import { logger } from '@utils/logger';

const DEV_CHAIN_ID = 101;
const DEFAULT_PROGRAM = TOKEN_PROGRAM_ID.toBase58();

const resolveDevnetToken = (options: {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
}): ApiV3Token => ({
  chainId: DEV_CHAIN_ID,
  address: options.address,
  programId: DEFAULT_PROGRAM,
  logoURI: '',
  symbol: options.symbol,
  name: options.name,
  decimals: options.decimals,
  tags: [],
  extensions: {},
});

const DEVNET_TOKEN_LIST: ApiV3Token[] = [
  resolveDevnetToken({
    address: 'So11111111111111111111111111111111111111112',
    symbol: 'WSOL',
    name: 'Wrapped SOL',
    decimals: 9,
  }),
  resolveDevnetToken({
    address: 'Gh9ZwEmdLJ8DscKzQ5p4YpKpmDLSt7hDLG9a25b3K7X',
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
  }),
];

class DevnetApi extends Api {
  override async getTokenList(): Promise<ApiV3TokenRes> {
    logger.dex.info({ message: 'Using hardcoded devnet token list' });
    return {
      mintList: DEVNET_TOKEN_LIST,
      blacklist: [],
      whiteList: [], // Added missing property
    };
  }

  override async getJupTokenList(): Promise<any[]> {
    logger.dex.info({ message: 'Using hardcoded Jupiter token list for devnet' });
    return DEVNET_TOKEN_LIST.map(token => ({
      ...token,
      freeze_authority: null,
      mint_authority: null,
      permanent_delegate: null,
      minted_at: new Date().toISOString(),
    }));
  }
}

export async function loadDevnetRaydium(params: RaydiumLoadParams): Promise<Raydium> {
  const customApi = new DevnetApi({
    cluster: params.cluster || 'devnet',
    urlConfigs: params.urlConfigs,
    timeout: 30000,
  });

  logger.dex.info({ message: 'Loading Raydium with custom devnet API' });

  // Remove unsupported parameters
  const { urlConfigs, logRequests, ...cleanParams } = params;

  const raydium = await Raydium.load({
    ...cleanParams,
    urlConfigs: params.urlConfigs,
  });

  // Replace the API instance
  (raydium as any).api = customApi;

  // Load tokens using our custom API
  await (raydium as any).token.load();

  logger.dex.info({ message: 'Raydium loaded successfully with devnet tokens' });

  return raydium;
}
