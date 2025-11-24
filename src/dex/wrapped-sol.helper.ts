import { Keypair, PublicKey, TransactionInstruction } from '@solana/web3.js';
import { logger } from '@utils/logger';

/**
 * Placeholder for wrapped SOL (WSOL) account management helpers.
 */
export class WrappedSolHelper {
  constructor(private readonly payer: Keypair) {}

  // TODO (Day 3): Create/close WSOL accounts as part of swap settlements.
  async buildWrapInstruction(amountLamports: bigint): Promise<TransactionInstruction[]> {
    logger.dex.info({ amountLamports: amountLamports.toString() }, 'buildWrapInstruction placeholder');
    return [];
  }

  async buildUnwrapInstruction(): Promise<TransactionInstruction[]> {
    logger.dex.info('buildUnwrapInstruction placeholder');
    return [];
  }
}
