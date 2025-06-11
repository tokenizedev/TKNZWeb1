/**
 * Integration test for executing a real transaction on mainnet.
 * Usage: node --test tests/integration.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import {
  Keypair,
  Connection,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';

test('integration: execute real transaction on mainnet', async () => {
  // Load environment variables
  dotenv.config();
  // Determine RPC endpoint from environment (supporting RPC_ENDPOINT or SOLANA_RPC_URL)
  const rpcEndpoint = process.env.RPC_ENDPOINT || process.env.SOLANA_RPC_URL;
  assert(rpcEndpoint, 'RPC endpoint must be set in .env (RPC_ENDPOINT or SOLANA_RPC_URL)');
  const connection = new Connection(rpcEndpoint, 'confirmed');

  // Load payer keypair from tests/data
  const keyPath = path.resolve('tests/data/test-key.json');
  const secretKeyArray = JSON.parse(await fs.readFile(keyPath, 'utf8'));
  const secretKey = Uint8Array.from(secretKeyArray);
  const payer = Keypair.fromSecretKey(secretKey);

  // Check initial balance
  const initialBalance = await connection.getBalance(payer.publicKey, 'confirmed');
  console.log(`Initial balance: ${initialBalance / LAMPORTS_PER_SOL} SOL`);
  assert(initialBalance > 0, 'Payer has no balance');

  // Create a self-transfer to incur a fee (no net change in balance aside from fee)
  const transferLamports = 1000; // 0.000001 SOL
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: payer.publicKey,
      lamports: transferLamports,
    }),
  );

  // Send and confirm transaction
  const signature = await sendAndConfirmTransaction(connection, tx, [payer]);
  console.log('Transaction signature:', signature);

  // Check final balance and fee
  const finalBalance = await connection.getBalance(payer.publicKey, 'confirmed');
  console.log(`Final balance: ${finalBalance / LAMPORTS_PER_SOL} SOL`);
  const feeLamports = initialBalance - finalBalance;
  console.log(`Fee paid: ${feeLamports} lamports (${feeLamports / LAMPORTS_PER_SOL} SOL)`);
  assert(feeLamports > 0, 'Transaction fee should be positive');
});