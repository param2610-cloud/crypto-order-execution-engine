import { Connection } from '@solana/web3.js';
import { env } from '@config/env';

/**
 * Provides a singleton Solana devnet connection so future DEX calls share sockets and commitment settings.
 */
class SolanaConnectionFactory {
  private connection?: Connection;

  getConnection() {
    if (!this.connection) {
      this.connection = new Connection(env.solana.rpcUrl, 'confirmed');
    }

    return this.connection;
  }
}

export const solanaConnectionFactory = new SolanaConnectionFactory();
