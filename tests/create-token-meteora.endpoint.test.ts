import { test } from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import { Keypair, VersionedTransaction, Connection } from '@solana/web3.js';
import { Buffer } from 'buffer';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Integration endpoint test for the create-token-meteora Netlify function.
 *
 * Prerequisites:
 * - Netlify Dev must be running on http://localhost:8888
 * - Solana Test Validator must be running on http://localhost:8899
 * - RPC_ENDPOINT and CP_AMM_STATIC_CONFIG env vars provided to Netlify Dev
 */
test('create-token-meteora endpoint should return valid & executable transactions', async () => {
  // Generate a fresh user keypair and use its pubkey as walletAddress
  const userKeypair = Keypair.generate();
  const walletAddress = userKeypair.publicKey.toBase58();

  // Minimal 1x1 PNG data URI for testing
  const imageDataUrl = 
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAA' +
    'AAC0lEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==';

  // Build request payload
  const requestBody = {
    walletAddress,
    token: {
      name: 'TestToken',
      ticker: 'TTK',
      imageUrl: imageDataUrl,
      description: 'Test token from endpoint test',
    },
    decimals: 2,
    initialSupply: 1000,
    isLockLiquidity: false,
  };

  const url = 'http://localhost:8888/.netlify/functions/create-token-meteora';
  const response = await axios.post(url, requestBody, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 10000,
  });
  assert.strictEqual(response.status, 200, 'Expected HTTP 200 response');

  const data = response.data as Record<string, any>;
  // Expect an array of transactions for mint+metadata and pool setup
  assert.ok(Array.isArray(data.transactions), 'Response must include transactions array');
  assert.ok(data.transactions.length >= 2, 'Expected at least two transactions (mint + pool setup)');
  assert.ok(data.mint, 'Response must include new mint address');
  assert.ok(data.pool, 'Response must include new pool address');

  const connection = new Connection(process.env.RPC_ENDPOINT || 'https://api.devnet.solana.com', 'confirmed');
  // Iterate over all returned transactions and execute
  for (let i = 0; i < data.transactions.length; i++) {
    const txBase64 = data.transactions[i];
    const txBuf = Buffer.from(txBase64, 'base64');
    const tx = VersionedTransaction.deserialize(txBuf);
    tx.sign([userKeypair]);
    const raw = tx.serialize();
    const sig = await connection.sendRawTransaction(raw, { skipPreflight: false });
    const conf = await connection.confirmTransaction(sig, 'confirmed');
    assert.strictEqual(conf.value.err, null, `Transaction ${i} should execute without error`);
  }

  // Verify on-chain accounts
  const mintInfo = await connection.getAccountInfo(data.mint);
  assert.ok(mintInfo, 'Mint account should be created on chain');
  const poolInfo = await connection.getAccountInfo(data.pool);
  assert.ok(poolInfo, 'Pool account should be created on chain');
});