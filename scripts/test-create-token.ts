#!/usr/bin/env ts-node-esm
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
// Load .env
dotenv.config();
/**
 * Test harness to emulate frontend token creation via the create-token-meteora function.
 *
 * Prerequisites:
 *   - Netlify Dev running on http://localhost:8888
 *   - Solana Test Validator running on http://localhost:8899
 *   - Environment vars RPC_ENDPOINT and CP_AMM_STATIC_CONFIG set for Netlify Dev
 */
import axios from 'axios';
import { Keypair, VersionedTransaction, Connection, PublicKey, LAMPORTS_PER_SOL, SendTransactionError } from '@solana/web3.js';
import { Buffer } from 'buffer';

async function main() {
  // Configuration from environment
  const FUNCTION_URL = process.env.CREATE_TOKEN_URL ||
    process.env.FUNCTION_URL ||
    'http://localhost:8888/.netlify/functions/create-token-meteora';
  const RPC_ENDPOINT = process.env.SOLANA_RPC_URL || 'http://localhost:8899';
  console.log('Function URL:', FUNCTION_URL);
  console.log('RPC Endpoint:', RPC_ENDPOINT);

  // Load creator wallet keypair from config/keys/creator.json
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const keyPath = path.resolve(__dirname, '../config/keys/creator.json');
  if (!fs.existsSync(keyPath)) {
    throw new Error(`Creator key file not found at ${keyPath}`);
  }
  const secret = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  const wallet = Keypair.fromSecretKey(Uint8Array.from(secret));
  console.log('Loaded creator wallet:', wallet.publicKey.toBase58());
  // Load image data (trim whitespace), may be a data URI (base64) or a direct URL
  let imageUrl = fs.readFileSync(path.resolve(__dirname, '../config/token/tomj.txt'), 'utf8').trim();
  // Prepare token metadata for creation (bare minimum)
  const payload = {
    walletAddress: wallet.publicKey.toBase58(),
    token: {
      name: 'TOM and Jerry',
      ticker: 'TOMJ',
      description: 'TOM and Jerry',
      websiteUrl: 'https://tknz.fun',
      twitter: 'https://x.com/tknzfun',
      telegram: 'https://t.me/tknzfun',
      imageUrl,
    },
    isLockLiquidity: false,
    portalParams: {
      amount: 0.01,        // SOL to deposit into pool side B
      priorityFee: 0,      // SOL fee to treasury
      curveConfig: {}      // optional custom bonding curve overrides
    },
  };
  console.log('Request payload:', payload);

  // Call the create-token endpoint
  const resp = await axios.post(FUNCTION_URL, payload, { headers: { 'Content-Type': 'application/json' } });
  if (resp.status !== 200) {
    console.error('Error response:', resp.status, resp.data);
    process.exit(1);
  }
  const data = resp.data;
  console.log('Function response:', data);

  // Deserialize the VersionedTransaction
  // Expect two transactions: mint+metadata and pool creation
  if (typeof data.transaction1 !== 'string' || typeof data.transaction2 !== 'string') {
    throw new Error('Missing transaction1 or transaction2 in response');
  }
  // Deserialize both transactions
  const txBuf1 = Buffer.from(data.transaction1, 'base64');
  const txBuf2 = Buffer.from(data.transaction2, 'base64');
  const tx1 = VersionedTransaction.deserialize(txBuf1);
  const tx2 = VersionedTransaction.deserialize(txBuf2);
  console.log('Deserialized tx1 version:', tx1.message.version);
  console.log('Deserialized tx2 version:', tx2.message.version);

  // Sign with wallet (payer) for both
  tx1.sign([wallet]);
  console.log('Signed tx1 with wallet');
  tx2.sign([wallet]);
  console.log('Signed tx2 with wallet');

  // Send to test validator
  const connection = new Connection(RPC_ENDPOINT, 'confirmed');
  // If connected to local test validator, fund the wallet for deposits
  if (RPC_ENDPOINT.includes('localhost') || RPC_ENDPOINT.includes('127.0.0.1')) {
    console.log('Requesting airdrop to fund wallet (2 SOL)...');
    const signature = await connection.requestAirdrop(wallet.publicKey, 2 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(signature, 'confirmed');
    console.log('Airdrop confirmed');
  }
  // Submit tx1
  const raw1 = tx1.serialize();
  let sig1: string;
  try {
    sig1 = await connection.sendRawTransaction(raw1);
    console.log('Submitted tx1, signature:', sig1);
  } catch (err: any) {
    console.error('Transaction1 simulation failed:', err);
    if (typeof err.transactionMessage === 'string') {
      console.error('Transaction1 message:', err.transactionMessage);
    }
    if (Array.isArray(err.transactionLogs)) {
      console.error('Simulation1 logs:');
      for (const logLine of err.transactionLogs) console.error(logLine);
    } else if (Array.isArray(err.logs)) {
      console.error('Simulation1 logs:');
      for (const logLine of err.logs) console.error(logLine);
    }
    process.exit(1);
  }
  const conf1 = await connection.confirmTransaction(sig1, 'confirmed');
  if (conf1.value.err) {
    console.error('Transaction1 failed:', conf1.value.err);
    process.exit(1);
  }
  console.log('Transaction1 confirmed');

  // Submit tx2
  const raw2 = tx2.serialize();
  let sig2: string;
  try {
    sig2 = await connection.sendRawTransaction(raw2);
    console.log('Submitted tx2, signature:', sig2);
  } catch (err: any) {
    console.error('Transaction2 simulation failed:', err);
    // If this is a SendTransactionError, fetch full logs for more detail
    if (err instanceof SendTransactionError) {
      try {
        const fullLogs = await err.getLogs(connection);
        console.error('Full logs:');
        for (const logLine of fullLogs) console.error(logLine);
      } catch (logErr) {
        console.error('Error fetching full logs:', logErr);
      }
    }
    if (typeof err.transactionMessage === 'string') {
      console.error('Transaction2 message:', err.transactionMessage);
    }
    if (Array.isArray(err.transactionLogs)) {
      console.error('Simulation2 logs:');
      for (const logLine of err.transactionLogs) console.error(logLine);
    } else if (Array.isArray(err.logs)) {
      console.error('Simulation2 logs:');
      for (const logLine of err.logs) console.error(logLine);
    }
    process.exit(1);
  }
  const conf2 = await connection.confirmTransaction(sig2, 'confirmed');
  if (conf2.value.err) {
    console.error('Transaction2 failed:', conf2.value.err);
    process.exit(1);
  }
  console.log('Transaction2 confirmed');

  // Verify on-chain accounts
  const toCheck: Record<string, string> = {
    mint: data.mint,
    ata: data.ata,
    pool: data.pool,
  };
  // Verify on-chain accounts
  for (const [name, addr] of Object.entries(toCheck)) {
    try {
      const info = await connection.getAccountInfo(new PublicKey(addr));
      console.log(`${name} (${addr}) on-chain?`, info ? 'yes' : 'no');
    } catch (e) {
      console.error(`Error fetching ${name}:`, e);
    }
  }
  // Record confirmed token creation in v2 leaderboard via confirm-token-creation
  // Confirm endpoint URL: override with CONFIRM_TOKEN_URL or derive from FUNCTION_URL
  const CONFIRM_URL = process.env.CONFIRM_TOKEN_URL || FUNCTION_URL.replace('create-token-meteora', 'confirm-token-creation');
  const confirmPayload = {
    mint: data.mint,
    ata: data.ata,
    pool: data.pool,
    metadataUri: data.metadataUri,
    decimals: data.decimals,
    initialSupply: data.initialSupply,
    initialSupplyRaw: data.initialSupplyRaw,
    depositSol: data.depositSol,
    depositLamports: data.depositLamports,
    feeSol: data.feeSol,
    feeLamports: data.feeLamports,
    isLockLiquidity: data.isLockLiquidity,
    walletAddress: payload.walletAddress,
    token: { ...payload.token, imageUrl: data.tokenMetadata.imageUrl },
    portalParams: payload.portalParams,
  };
  let confirmResp: any;
  console.log('Posting to confirm endpoint:', CONFIRM_URL, confirmPayload);
  try {
    confirmResp = await axios.post(CONFIRM_URL, confirmPayload, { headers: { 'Content-Type': 'application/json' } });
    console.log('Confirm endpoint response:', confirmResp.status, confirmResp.data);
  } catch (err: any) {
    console.error('Error calling confirm-token-creation endpoint:', err.message || err);
    process.exit(1);
  }
  // Send notification for the new token via notify-token-creation
  const NOTIFY_URL = process.env.NOTIFY_URL || CONFIRM_URL.replace('confirm-token-creation', 'notify-token-creation');
  console.log('Posting to notify endpoint:', NOTIFY_URL, confirmPayload);
  try {
    const notifyResp = await axios.post(NOTIFY_URL, { ...confirmPayload, createdAt: confirmResp.data.createdAt }, { headers: { 'Content-Type': 'application/json' } });
    console.log('Notify endpoint response:', notifyResp.status, notifyResp.data);
  } catch (err: any) {
    console.error('Error calling notify-token-creation endpoint:', err.message || err);
  }
}

main().catch(err => {
  console.error('Error in test-create-token:', err);
  process.exit(1);
});