import { Connection, Transaction } from '@solana/web3.js';
import { logger } from '@utils/logger';

/**
 * Base transaction builder that future days will extend with concrete Raydium/Meteora swap instructions.
 */
export class TransactionBuilder {
  constructor(private readonly connection: Connection) {}

  // TODO (Day 3): Build wrapped SOL -> target token swap transaction
  async buildSwapTransaction(): Promise<Transaction> {
    logger.dex.info('Transaction builder invoked placeholder');
    return new Transaction();
  }
}
