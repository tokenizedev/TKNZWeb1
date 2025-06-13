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
// Setup debug output to file and override exit to capture all data
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const debugPath = path.resolve(__dirname, '../logs/create-token-debug.json');
const debug: any = { startedAt: new Date().toISOString() };
const origExit = process.exit.bind(process);
(process as any).exit = (code?: any) => { fs.writeFileSync(debugPath, JSON.stringify(debug, null, 2)); origExit(code); };

async function main() {
  // Configuration from environment
  const FUNCTION_URL = process.env.CREATE_TOKEN_URL ||
    process.env.FUNCTION_URL ||
    'http://localhost:8888/.netlify/functions/create-token-meteora';
  // Allow overriding via RPC_ENDPOINT env var for targeting local or remote clusters
  const RPC_ENDPOINT = process.env.RPC_ENDPOINT || process.env.SOLANA_RPC_URL || 'http://localhost:8899';
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
  // record payload for debugging
  debug.payload = payload;

  // Call the create-token endpoint
  const resp = await axios.post(FUNCTION_URL, payload, { headers: { 'Content-Type': 'application/json' } });
  if (resp.status !== 200) {
    console.error('Error response:', resp.status, resp.data);
    process.exit(1);
  }
  const data = resp.data;
  console.log('Function response:', data);
  // record function response
  debug.functionResponse = { status: resp.status, data };

  // Deserialize the VersionedTransactions
  if (!Array.isArray(data.transactions) || data.transactions.length === 0) {
    throw new Error('No transactions returned from create-token-meteora');
  }
  const txs = data.transactions.map((b64: string, idx: number) => {
    const buf = Buffer.from(b64, 'base64');
    const tx = VersionedTransaction.deserialize(buf);
    
    
    console.log(`Deserialized tx ${idx} version:`, tx.message.version);
    return tx;
  });

  // Sign with wallet (payer) for both
  // Sign all transactions with wallet
  for (let i = 0; i < txs.length; i++) {
    txs[i].sign([wallet]);
    console.log(`Signed tx ${i} with wallet`);
  }

  // Send to test validator
  const connection = new Connection(RPC_ENDPOINT, 'confirmed');

  // First, simulate all transactions to ensure success before sending
  // initialize simulation debug array
  debug.simulations = [];
  console.log('Simulating all transactions...');
  for (let i = 0; i < txs.length; i++) {
    const tx = txs[i];
    try {
      const sim = await connection.simulateTransaction(tx);
      // record simulation result
      debug.simulations.push({ index: i, err: sim.value.err, logs: sim.value.logs });
      if (sim.value.err) {
        console.error(`Simulation failed on tx ${i}:`, sim.value.err);
        if (Array.isArray(sim.value.logs)) sim.value.logs.forEach(l => console.error(l));
        process.exit(1);
      }
      console.log(`Simulation passed for tx ${i}`);
    } catch (simErr: any) {
      console.error(`Error simulating tx ${i}:`, simErr);
      process.exit(1);
    }
  }
  console.log('All simulations passed. Submitting transactions...');
  // initialize submission debug array
  debug.submissions = [];
  // Now, submit transactions sequentially
  for (let i = 0; i < txs.length; i++) {
    const raw = txs[i].serialize();
    let sig: string;
    try {
      sig = await connection.sendRawTransaction(raw);
      console.log(`Submitted tx ${i}, signature:`, sig);
    } catch (err: any) {
      console.error(`Transaction ${i} submission failed:`, err);
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
        console.error(`Transaction ${i} message:`, err.transactionMessage);
      }
      if (Array.isArray(err.transactionLogs)) {
        console.error(`Simulation ${i} logs:`);
        for (const logLine of err.transactionLogs) console.error(logLine);
      } else if (Array.isArray(err.logs)) {
        console.error(`Simulation ${i} logs:`);
        for (const logLine of err.logs) console.error(logLine);
      }
      process.exit(1);
    }
    const conf = await connection.confirmTransaction(sig, 'confirmed');
    // record submission result
    debug.submissions.push({ index: i, signature: sig, confirm: conf.value });

    if (conf.value.err) {
      console.error(`Transaction ${i} failed:`, conf.value.err);
      process.exit(1);
    }
    console.log(`Transaction ${i} confirmed`);
  }

  // verify on-chain accounts
  debug.accounts = {};
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
      // record account info
      debug.accounts[name] = info ? { lamports: info.lamports, owner: info.owner.toBase58() } : null;
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
    // record confirm response
    debug.confirm = { status: confirmResp.status, data: confirmResp.data };
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
    // record notify response
    debug.notify = { status: notifyResp.status, data: notifyResp.data };
  } catch (err: any) {
    console.error('Error calling notify-token-creation endpoint:', err.message || err);
  }
  // write collected debug information to file
  fs.writeFileSync(debugPath, JSON.stringify(debug, null, 2));
  console.log('Debug info written to', debugPath);
}

main().catch(err => {
  console.error('Error in test-create-token:', err);
  process.exit(1);
});