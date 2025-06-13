import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'buffer';
// Import the TypeScript handler directly, transpiled at runtime via ts-node
import { handler } from '../netlify/functions/create-token.ts';
import { Transaction, SystemProgram, LAMPORTS_PER_SOL, Keypair } from '@solana/web3.js';

// Preserve original fetch
let originalFetch;
test.before(() => { originalFetch = global.fetch; });
test.after(() => { global.fetch = originalFetch; });

test('create-token handler returns modified transaction with correct fee', async () => {
  // Set env vars
  process.env.RPC_ENDPOINT = 'https://example.com';
  const treasuryKeypair = Keypair.generate();
  process.env.TREASURY_WALLET = treasuryKeypair.publicKey.toString();

  // Prepare dummy transaction base64 from PumpPortal
  // Create a dummy user keypair and set fee payer and blockhash
  const dummyUser = Keypair.generate();
  const dummyTx = new Transaction();
  dummyTx.feePayer = dummyUser.publicKey;
  // Use a default valid blockhash string
  dummyTx.recentBlockhash = '11111111111111111111111111111111';
  const dummyBase64 = dummyTx.serialize({ requireAllSignatures: false }).toString('base64');

  // Mock fetch for PumpPortal
  global.fetch = async (url, options) => ({
    ok: true,
    headers: { get: () => 'application/json' },
    async json() { return { transaction: dummyBase64 }; }
  });

  // Build event
  const userKeypair = Keypair.generate();
  const amount = 2.5;
  const event = {
    httpMethod: 'POST',
    body: JSON.stringify({
      walletAddress: userKeypair.publicKey.toString(),
      pumpPortalParams: { amount, extra: 'param' }
    })
  };

  // Invoke handler
  const res = await handler(event);
  assert.strictEqual(res.statusCode, 200);
  const body = JSON.parse(res.body);

  // Validate amounts
  assert.strictEqual(body.totalAmount, amount);
  const expectedFee = parseFloat((0.01 * amount).toFixed(9));
  assert.strictEqual(body.feeAmount, expectedFee);
  assert.strictEqual(body.netAmount, parseFloat((amount - expectedFee).toFixed(9)));

  // Decode and inspect returned transaction
  const returnedRaw = Buffer.from(body.transaction, 'base64');
  const returnedTx = Transaction.from(returnedRaw);
  const feeLamports = Math.round(expectedFee * LAMPORTS_PER_SOL);
  const ix = returnedTx.instructions[0];
  assert.ok(ix.programId.equals(SystemProgram.programId));
  assert.strictEqual(ix.keys[0].pubkey.toString(), userKeypair.publicKey.toString());
  assert.strictEqual(ix.keys[1].pubkey.toString(), treasuryKeypair.publicKey.toString());
  const lamports = Number(ix.data.readBigUInt64LE(4));
  assert.strictEqual(lamports, feeLamports);
});