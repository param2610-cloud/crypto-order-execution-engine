/**
 * Standalone test script for Raydium CPMM swap on devnet
 * Based on the working code provided by the user
 * 
 * Usage: npx tsx scripts/test-raydium-swap.ts
 */

import {
  Connection,
  Keypair,
  PublicKey,
  VersionedTransaction,
} from '@solana/web3.js';
import {
  Raydium,
  TxVersion,
  parseTokenAccountResp,
} from '@raydium-io/raydium-sdk-v2';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import bs58 from 'bs58';
import BN from 'bn.js';
import Decimal from 'decimal.js';
import dotenv from 'dotenv';

dotenv.config();

const CONFIG = {
  RPC_URL: process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com',
  WALLET_PRIVATE_KEY: process.env.WALLET_PRIVATE_KEY ?? '',
  
  POOL_ID: 'AWVFpbxxxxxxwLh5FrkFAjkxvTu8tFQYALm4tuN8wqd',
  TOKEN_IN: '7667oZyeKhXWkFxxxxxxxxXhSspbHqVSAXfNVSiwZaJx',
  TOKEN_OUT: '52oX2aHhnhN8vYxxxxxxxxxFKE1eEpNuu1Y3U2t4ALRQT',
  
  AMOUNT: 10_000_000_000, // 10 tokens in lamports (9 decimals)
  SLIPPAGE_PERCENT: 10, // 10%
};

async function cpmmSwap() {
  console.log('🚀 CPMM Swap on Devnet\n');
  console.log('=' .repeat(70));

  if (!CONFIG.WALLET_PRIVATE_KEY) {
    console.error('❌ WALLET_PRIVATE_KEY not set in environment');
    process.exit(1);
  }

  const connection = new Connection(CONFIG.RPC_URL, 'confirmed');
  const owner = Keypair.fromSecretKey(bs58.decode(CONFIG.WALLET_PRIVATE_KEY));

  console.log('\n📍 Wallet:', owner.publicKey.toBase58());
  console.log('🏊 Pool ID:', CONFIG.POOL_ID);
  console.log('💱 Amount:', CONFIG.AMOUNT, 'lamports');
  console.log('⚡ Slippage:', CONFIG.SLIPPAGE_PERCENT + '%\n');

  const balance = await connection.getBalance(owner.publicKey);
  console.log(`💰 SOL Balance: ${balance / 1e9} SOL\n`);

  try {
    console.log('🔧 Initializing Raydium SDK...');
    const raydium = await Raydium.load({
      owner,
      connection,
      cluster: 'devnet' as any,
      disableFeatureCheck: true,
      disableLoadToken: false,
    });
    console.log('✅ SDK initialized\n');

    console.log('🔍 Fetching pool...');
    const poolData = await raydium.api.fetchPoolById({ ids: CONFIG.POOL_ID });
    const pool = poolData[0];
    
    console.log('✅ Pool found\n');

    const isInputMintA = pool.mintA.address === CONFIG.TOKEN_IN;
    const inputMintInfo = isInputMintA ? pool.mintA : pool.mintB;
    const outputMintInfo = isInputMintA ? pool.mintB : pool.mintA;

    const inputAmount = new BN(
      new Decimal(CONFIG.AMOUNT)
        .mul(10 ** inputMintInfo.decimals)
        .toFixed(0)
    );

    console.log('💱 Input amount (raw):', inputAmount.toString());

    // **KEY FIX: Get actual pool reserves from RPC**
    console.log('📊 Fetching pool reserves from blockchain...');
    const rpcPoolInfo = await raydium.cpmm.getRpcPoolInfo(CONFIG.POOL_ID, true);
    
    if (!rpcPoolInfo.baseReserve || !rpcPoolInfo.quoteReserve) {
      throw new Error('Pool reserves not available');
    }

    console.log('   Base reserve:', rpcPoolInfo.baseReserve.toString());
    console.log('   Quote reserve:', rpcPoolInfo.quoteReserve.toString());

    // Calculate actual expected output using pool reserves
    const reserveIn = isInputMintA ? rpcPoolInfo.baseReserve : rpcPoolInfo.quoteReserve;
    const reserveOut = isInputMintA ? rpcPoolInfo.quoteReserve : rpcPoolInfo.baseReserve;

    // Simple constant product formula: outputAmount = (inputAmount * reserveOut) / (reserveIn + inputAmount)
    // With fees: tradeFee ~0.25%
    const inputAfterFee = inputAmount.mul(new BN(9975)).div(new BN(10000)); // 0.25% fee
    const numerator = inputAfterFee.mul(reserveOut);
    const denominator = reserveIn.add(inputAfterFee);
    const expectedOutput = numerator.div(denominator);

    console.log('\n📊 Calculated from reserves:');
    console.log('   Expected output (raw):', expectedOutput.toString());
    console.log('   Expected output (tokens):', new Decimal(expectedOutput.toString()).div(10 ** outputMintInfo.decimals).toFixed(6));

    // Apply slippage to get minimum output
    const minOutputAmount = expectedOutput
      .mul(new BN(10000 - CONFIG.SLIPPAGE_PERCENT * 100))
      .div(new BN(10000));

    console.log('⚡ Min output (raw):', minOutputAmount.toString());
    console.log('⚡ Min output (tokens):', new Decimal(minOutputAmount.toString()).div(10 ** outputMintInfo.decimals).toFixed(6));
    console.log();

    console.log('🔨 Building swap transaction...');
    
    const { transaction } = await raydium.cpmm.swap({
      poolInfo: pool as any,
      inputAmount,
      swapResult: {
        inputAmount: inputAmount,
        outputAmount: minOutputAmount,
      } as any,
      slippage: 0, // Already calculated in minOutputAmount
      baseIn: isInputMintA,
      txVersion: TxVersion.V0,
    } as any);

    console.log('✅ Transaction built\n');

    console.log('📤 Sending transaction...');
    const txId = await connection.sendTransaction(
      transaction as VersionedTransaction,
      {
        skipPreflight: false,
        maxRetries: 3,
      }
    );
    
    console.log('✅ Transaction sent:', txId);
    console.log('⏳ Waiting for confirmation...\n');

    const confirmation = await connection.confirmTransaction(txId, 'confirmed');

    if (confirmation.value.err) {
      console.error('❌ Transaction failed on-chain');
      console.error('Error:', JSON.stringify(confirmation.value.err));
      
      const tx = await connection.getTransaction(txId, {
        maxSupportedTransactionVersion: 0,
      });

      if (tx?.meta?.logMessages) {
        console.log('\n📋 Transaction Logs:');
        tx.meta.logMessages.forEach(log => console.log('  ', log));
      }
      
      console.log('\n🔗 View on Solscan:');
      console.log(`   https://solscan.io/tx/${txId}?cluster=devnet`);
    } else {
      console.log('='.repeat(70));
      console.log('🎉 SWAP SUCCESSFUL!');
      console.log('='.repeat(70));
      console.log('\n📝 Transaction Details:');
      console.log(`   TX ID: ${txId}`);
      console.log(`   Solscan: https://solscan.io/tx/${txId}?cluster=devnet`);
      console.log(`   Explorer: https://explorer.solana.com/tx/${txId}?cluster=devnet\n`);

      const tx = await connection.getTransaction(txId, {
        maxSupportedTransactionVersion: 0,
      });

      if (tx?.meta?.logMessages) {
        const swapLog = tx.meta.logMessages.find(log => 
          log.includes('input_amount') && log.includes('output_amount')
        );
        if (swapLog) {
          console.log('💱 Swap Details:');
          console.log('  ', swapLog);
          console.log();
        }
      }

      const newBalance = await connection.getBalance(owner.publicKey);
      console.log(`💰 New SOL Balance: ${newBalance / 1e9} SOL`);

      const walletTokenAccounts = await connection.getTokenAccountsByOwner(
        owner.publicKey,
        { programId: TOKEN_PROGRAM_ID }
      );

      const accounts = parseTokenAccountResp({
        owner: owner.publicKey,
        solAccountResp: await connection.getAccountInfo(owner.publicKey),
        tokenAccountResp: {
          context: walletTokenAccounts.context,
          value: walletTokenAccounts.value,
        },
      });

      console.log('\n📊 Updated Token Balances:');
      accounts.tokenAccounts.forEach((acc) => {
        const mintAddr = acc.mint.toBase58();
        if (mintAddr === CONFIG.TOKEN_IN || mintAddr === CONFIG.TOKEN_OUT) {
          const decimals = mintAddr === CONFIG.TOKEN_IN 
            ? inputMintInfo.decimals 
            : outputMintInfo.decimals;
          const balance = new Decimal(acc.amount.toString())
            .div(10 ** decimals)
            .toFixed(4);
          const label = mintAddr === CONFIG.TOKEN_IN ? 'Input Token' : 'Output Token';
          console.log(`   ${label}: ${balance}`);
        }
      });
      console.log();
      console.log('='.repeat(70));
    }

  } catch (error: any) {
    console.error('\n❌ Swap failed:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
  }
}


cpmmSwap().catch(console.error);
