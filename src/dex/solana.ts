import bs58 from 'bs58';
import {
  Connection,
  Keypair,
  ParsedAccountData,
  PublicKey,
  Signer,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  VersionedTransaction
} from '@solana/web3.js';
import {
  NATIVE_MINT,
  createAssociatedTokenAccountInstruction,
  createCloseAccountInstruction,
  createSyncNativeInstruction,
  getAssociatedTokenAddress
} from '@solana/spl-token';
import { env } from '@config/env';
import { logger } from '@utils/logger';

let sharedConnection: Connection | undefined;
let cachedWallet: Keypair | undefined;
const mintDecimalsCache = new Map<string, number>();

const decodeSecretKey = (secret: string): Uint8Array => {
  try {
    const parsed = JSON.parse(secret) as number[];
    if (Array.isArray(parsed)) {
      return new Uint8Array(parsed);
    }
  } catch (error) {
    // not json
  }

  try {
    return bs58.decode(secret);
  } catch (error) {
    // not base58
  }

  try {
    const buffer = Buffer.from(secret, 'base64');
    if (buffer.length > 0) {
      return new Uint8Array(buffer);
    }
  } catch (error) {
    // not base64
  }

  throw new Error('Unable to parse WALLET_PRIVATE_KEY. Expected base58, base64, or JSON array');
};

export const getConnection = (): Connection => {
  if (!sharedConnection) {
    sharedConnection = new Connection(env.solana.rpcUrl, env.solana.commitment);
  }
  return sharedConnection;
};

export const getWallet = (): Keypair => {
  if (!cachedWallet) {
    if (!env.wallet.secretKey) {
      throw new Error('WALLET_PRIVATE_KEY must be provided in the environment to sign devnet swaps');
    }
    cachedWallet = Keypair.fromSecretKey(decodeSecretKey(env.wallet.secretKey));
  }
  return cachedWallet;
};

export const getWalletPublicKey = (): PublicKey => getWallet().publicKey;

export interface SendAndConfirmOptions {
  additionalSigners?: Signer[];
  skipPreflight?: boolean;
  onSubmitted?: (signature: string) => void | Promise<void>;
}

export const sendAndConfirm = async (
  transaction: Transaction | VersionedTransaction, 
  options?: SendAndConfirmOptions
): Promise<string> => {
  const connection = getConnection();
  const wallet = getWallet();

  let signature: string;
  
  if (transaction instanceof VersionedTransaction) {
    // Handle VersionedTransaction (V0)
    transaction.sign([wallet, ...(options?.additionalSigners ?? [])]);
    
    signature = await connection.sendTransaction(transaction, {
      skipPreflight: options?.skipPreflight ?? false,
      maxRetries: 3,
    });
  } else {
    // Handle legacy Transaction
    transaction.feePayer = wallet.publicKey;
    
    signature = await connection.sendTransaction(transaction, [wallet, ...(options?.additionalSigners ?? [])], {
      skipPreflight: options?.skipPreflight ?? false,
      preflightCommitment: env.solana.commitment
    });
  }

  if (options?.onSubmitted) {
    await options.onSubmitted(signature);
  }

  await connection.confirmTransaction(signature, env.solana.commitment);
  return signature;
};

export const wrapSol = async (amountLamports: bigint): Promise<PublicKey> => {
  const connection = getConnection();
  const wallet = getWallet();
  const ata = await getAssociatedTokenAddress(NATIVE_MINT, wallet.publicKey);
  const instructions: TransactionInstruction[] = [];
  const accountInfo = await connection.getAccountInfo(ata);
  if (!accountInfo) {
    instructions.push(createAssociatedTokenAccountInstruction(wallet.publicKey, ata, wallet.publicKey, NATIVE_MINT));
  }

  instructions.push(
    SystemProgram.transfer({ fromPubkey: wallet.publicKey, toPubkey: ata, lamports: Number(amountLamports) }),
    createSyncNativeInstruction(ata)
  );

  const tx = new Transaction().add(...instructions);
  await sendAndConfirm(tx);
  return ata;
};

export const unwrapSol = async (): Promise<void> => {
  const wallet = getWallet();
  const ata = await getAssociatedTokenAddress(NATIVE_MINT, wallet.publicKey);
  const tx = new Transaction().add(createCloseAccountInstruction(ata, wallet.publicKey, wallet.publicKey));
  await sendAndConfirm(tx);
};

export const ensureAtaInstruction = async (
  mint: PublicKey,
  owner: PublicKey,
  payer: PublicKey
): Promise<{ ata: PublicKey; instruction?: TransactionInstruction }> => {
  const ata = await getAssociatedTokenAddress(mint, owner);
  const info = await getConnection().getAccountInfo(ata);
  if (!info) {
    return {
      ata,
      instruction: createAssociatedTokenAccountInstruction(payer, ata, owner, mint)
    };
  }
  return { ata };
};

export const getMintDecimals = async (mint: PublicKey): Promise<number> => {
  const cached = mintDecimalsCache.get(mint.toBase58());
  if (cached !== undefined) {
    return cached;
  }

  const connection = getConnection();
  const accountInfo = await connection.getParsedAccountInfo(mint);
  if (!accountInfo.value) {
    throw new Error(`Mint ${mint.toBase58()} not found on devnet`);
  }

  const data = accountInfo.value.data as ParsedAccountData;
  const decimals = data.parsed?.info?.decimals;
  if (typeof decimals !== 'number') {
    throw new Error(`Unable to read decimals for mint ${mint.toBase58()}`);
  }

  mintDecimalsCache.set(mint.toBase58(), decimals);
  return decimals;
};

export const logSignatureExplorerHint = (signature: string) => {
  logger.dex.info({ signature, explorer: `https://explorer.solana.com/tx/${signature}?cluster=devnet` }, 'Submitted devnet swap');
};
