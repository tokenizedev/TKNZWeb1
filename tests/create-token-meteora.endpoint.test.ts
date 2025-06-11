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
test.skip('create-token-meteora endpoint should return two valid & executable transactions', async () => {
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
  // Expect two transactions for mint+metadata and pool setup
  assert.ok(data.transaction1, 'Response must include base64 transaction1');
  assert.ok(data.transaction2, 'Response must include base64 transaction2');
  assert.ok(data.mint, 'Response must include new mint address');
  assert.ok(data.pool, 'Response must include new pool address');

  // Deserialize and send first transaction (mint creation + metadata)
  const connection = new Connection(process.env.RPC_ENDPOINT || 'https://api.devnet.solana.com', 'confirmed');
  // tx1: mint and metadata
  const txBuf1 = Buffer.from(data.transaction1, 'base64');
  const tx1 = VersionedTransaction.deserialize(txBuf1);
  tx1.sign([userKeypair]);
  const raw1 = tx1.serialize();
  const sig1 = await connection.sendRawTransaction(raw1, { skipPreflight: false });
  const conf1 = await connection.confirmTransaction(sig1, 'confirmed');
  assert.strictEqual(conf1.value.err, null, 'First transaction should execute without error');
  
  // tx2: pool creation and deposit
  const txBuf2 = Buffer.from(data.transaction2, 'base64');
  const tx2 = VersionedTransaction.deserialize(txBuf2);
  tx2.sign([userKeypair]);
  const raw2 = tx2.serialize();
  const sig2 = await connection.sendRawTransaction(raw2, { skipPreflight: false });
  const conf2 = await connection.confirmTransaction(sig2, 'confirmed');
  assert.strictEqual(conf2.value.err, null, 'Second transaction should execute without error');

  // Verify on-chain accounts
  const mintInfo = await connection.getAccountInfo(data.mint);
  assert.ok(mintInfo, 'Mint account should be created on chain');
  const poolInfo = await connection.getAccountInfo(data.pool);
  assert.ok(poolInfo, 'Pool account should be created on chain');
});