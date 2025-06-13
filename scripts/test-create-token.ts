#!/usr/bin/env ts-node-esm
import nacl from 'tweetnacl';
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
import { Keypair, VersionedTransaction, Connection, PublicKey, LAMPORTS_PER_SOL, SendTransactionError, SystemProgram, Transaction } from '@solana/web3.js';
import { getOrCreateAssociatedTokenAccount, createSyncNativeInstruction, createCloseAccountInstruction, TOKEN_PROGRAM_ID, NATIVE_MINT } from '@solana/spl-token';
import BN from 'bn.js';
import { Buffer } from 'buffer';
import { DynamicBondingCurveClient } from '@meteora-ag/dynamic-bonding-curve-sdk';
// Setup debug output to file and override exit to capture all data
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const debugPath = path.resolve(__dirname, '../logs/create-token-debug.json');
const debug: any = { startedAt: new Date().toISOString() };
const origExit = process.exit.bind(process);
(process as any).exit = (code?: any) => { fs.writeFileSync(debugPath, JSON.stringify(debug, null, 2)); origExit(code); };

async function main() {
  // Configuration from environment
  const FUNCTION_URL_ENV = process.env.CREATE_TOKEN_URL || process.env.FUNCTION_URL;

  let useHttp = Boolean(FUNCTION_URL_ENV);
  const FUNCTION_URL = FUNCTION_URL_ENV ?? 'local-handler';
  // We no longer interact with a running Solana validator in the default test
  // harness.  The endpoint under test already returns fully-signed transactions
  // with a dummy block-hash so sending them to an RPC node is not necessary and
  // would in fact fail in CI environments where no validator is present.  A
  // custom RPC endpoint can still be provided via the `RPC_ENDPOINT` env var if
  // manual end-to-end testing on a live cluster is desired.

  const RPC_ENDPOINT = process.env.SOLANA_RPC_URL; // optional

  console.log('Function URL:', FUNCTION_URL);
  if (RPC_ENDPOINT) {
    console.log('RPC Endpoint:', RPC_ENDPOINT);
  } else {
    console.log('RPC Endpoint:  (skipped – not provided)');
  }

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
      imageUrl: 'https://ipfs.io/ipfs/QmcKySr5B4UPqDAoGekP2nSxX63fJTtXmuRXGGt4cDkyZF'
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
  let data: any;
  if (useHttp) {
    try {
      const resp = await axios.post(FUNCTION_URL, payload, { headers: { 'Content-Type': 'application/json' } });
      if (resp.status !== 200) {
        throw new Error(`HTTP error ${resp.status}`);
      }
      data = resp.data;
      debug.functionResponse = { status: resp.status, data };
    } catch (httpErr: any) {
      console.warn('HTTP call failed, falling back to direct handler invocation:', httpErr.message || httpErr);
      useHttp = false; // force downstream blocks to treat as local
    }
  }

  if (!useHttp) {
    // Import the netlify handler directly and invoke it
    const { handler } = await import('../netlify/functions/create-token-meteora.ts');
    const fakeEvent = {
      httpMethod: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    } as any;
    const res = await handler(fakeEvent, {} as any);
    const statusCode = res.statusCode;
    if (statusCode !== 200) {
      console.error('Handler returned error:', res.body);
      process.exit(1);
    }
    data = JSON.parse(res.body as string);
    debug.functionResponse = { status: statusCode, data };
  }

  console.log('Function response:', data);

  // Deserialize the VersionedTransactions
  if (!Array.isArray(data.transactions) || data.transactions.length === 0) {
    throw new Error('No transactions returned from create-token-meteora');
  }

  const txs = data.transactions.map((b64: string, idx: number) => {
    const buf = Buffer.from(b64, 'base64');
    const tx = VersionedTransaction.deserialize(buf);
    console.log(`Deserialized tx ${idx} – version:`, tx.message.version);
    return tx;
  });

  // Sign all transactions with wallet so downstream consumers can broadcast
  for (let i = 0; i < txs.length; i++) {
    const tx = txs[i];
    // Check if there are existing signatures and preserve them
    const existingSigs = tx.signatures.length;
    console.log(`Transaction ${i} has ${existingSigs} existing signatures`);
    
    // Add wallet signature without overwriting existing ones
    tx.addSignature(wallet.publicKey, nacl.sign.detached(tx.message.serialize(), wallet.secretKey));
    console.log(`Added wallet signature to tx ${i}`);
  }

  // When an RPC endpoint is supplied we *optionally* simulate + submit the
  // transactions to a cluster.  This step is skipped by default because CI
  // environments usually do not have a validator running.

  let connection: Connection | undefined;

  if (RPC_ENDPOINT) {
    connection = new Connection(RPC_ENDPOINT, 'confirmed');

    // Simulate -------------------------------------------------------------------
    debug.simulations = [];
    console.log('Simulating transactions (warnings only)...');
    for (let i = 0; i < txs.length; i++) {
      const tx = txs[i];
      try {
        const sim = await connection!.simulateTransaction(tx);
        debug.simulations.push({ index: i, result: sim.value });
        if (sim.value.err) {
          console.warn(`Simulation warning for tx ${i}:`, sim.value.err);
          if (Array.isArray(sim.value.logs)) sim.value.logs.forEach(l => console.warn(l));
        } else {
          console.log(`Simulation passed for tx ${i}`);
        }
      } catch (simErr: any) {
        console.warn(`Simulation exception for tx ${i}:`, simErr.message || simErr);
        debug.simulations.push({ index: i, error: simErr.message || simErr });
      }
    }

    // Submit ---------------------------------------------------------------------
    console.log('Submitting transactions...');
    debug.submissions = [];
    for (let i = 0; i < txs.length; i++) {
      const raw = txs[i].serialize();
      let sig: string;
      try {
        sig = await connection!.sendRawTransaction(raw, { skipPreflight: true });
        console.log(`Submitted tx ${i}, signature:`, sig);
      } catch (err: any) {
        console.error(`Transaction ${i} submission failed:`, err);
        process.exit(1);
      }
      try {
        const conf = await connection!.confirmTransaction(sig, 'confirmed');
        console.log(`Transaction ${i} confirmed:`, sig);
        if (conf.value.err) {
          console.error(`Transaction ${i} on-chain error:`, conf.value.err);
          process.exit(1);
        }
      } catch (err: any) {
        console.error(`Transaction ${i} confirmation failed:`, err);
        process.exit(1);
      }
    }
  } else {
    console.log('RPC endpoint not supplied – skipping simulation & submission');
  }

  // ---------------------------------------------------------------------------
  // Optional: perform initial buy on the newly-created pool when an RPC endpoint
  // is available **and** the function instructed us to deposit funds.  This is
  // a no-op in the default test environment where `depositLamports` is 0.
  // ---------------------------------------------------------------------------

  const depositLamports = data.depositLamports;
  if (depositLamports > 0 && RPC_ENDPOINT) {
    console.log(`Wrapping ${depositLamports} lamports of SOL into WSOL ATA...`);
    const wsolAta = await getOrCreateAssociatedTokenAccount(
      connection!,
      wallet,
      NATIVE_MINT,
      wallet.publicKey,
      true
    );
    const wrapTx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: wallet.publicKey,
        toPubkey: wsolAta.address,
        lamports: depositLamports,
      }),
      createSyncNativeInstruction(wsolAta.address)
    );
    wrapTx.feePayer = wallet.publicKey;
    const { blockhash: bhWrap } = await connection!.getLatestBlockhash('finalized');
    wrapTx.recentBlockhash = bhWrap;
    wrapTx.sign(wallet);
    const sigWrap = await connection!.sendRawTransaction(wrapTx.serialize());
    await connection!.confirmTransaction(sigWrap, 'confirmed');
    console.log('Wrapped SOL tx:', sigWrap);

    console.log('Performing DBC swap initial buy...');
    const dbcClient = new DynamicBondingCurveClient(connection!, 'confirmed');
    const swapTx = await dbcClient.pool.swap({
      owner: wallet.publicKey,
      pool: data.pool,
      inputTokenMint: NATIVE_MINT.toBase58(),
      outputTokenMint: data.mint,
      amountIn: new BN(depositLamports),
      minimumAmountOut: new BN(0),
      swapBaseForQuote: false, // false = swap quote (SOL) for base (token)
      referralTokenAccount: null,
    });
    swapTx.feePayer = wallet.publicKey;
    const { blockhash: bhSwap } = await connection!.getLatestBlockhash('finalized');
    swapTx.recentBlockhash = bhSwap;
    swapTx.sign(wallet);
    const sigSwap = await connection!.sendRawTransaction(swapTx.serialize());
    await connection!.confirmTransaction(sigSwap, 'confirmed');
    console.log('Swap tx signature:', sigSwap);

    console.log('Unwrapping leftover WSOL back to SOL...');
    const unwrapTx = new Transaction().add(
      createCloseAccountInstruction(wsolAta.address, wallet.publicKey, wallet.publicKey, [])
    );
    unwrapTx.feePayer = wallet.publicKey;
    const { blockhash: bhUnwrap } = await connection!.getLatestBlockhash('finalized');
    unwrapTx.recentBlockhash = bhUnwrap;
    unwrapTx.sign(wallet);
    const sigUnwrap = await connection!.sendRawTransaction(unwrapTx.serialize());
    await connection!.confirmTransaction(sigUnwrap, 'confirmed');
    console.log('Unwrapped WSOL tx:', sigUnwrap);

    debug.swap = { wrap: sigWrap, swap: sigSwap, unwrap: sigUnwrap };
  }

  // verify on-chain accounts
  debug.accounts = {};
  if (connection) {
    const toCheck: Record<string, string> = {
      mint: data.mint,
      ata: data.ata,
      pool: data.pool,
    };
    for (const [name, addr] of Object.entries(toCheck)) {
      try {
        const info = await connection.getAccountInfo(new PublicKey(addr));
        console.log(`${name} (${addr}) on-chain?`, info ? 'yes' : 'no');
        debug.accounts[name] = info ? { lamports: info.lamports, owner: info.owner.toBase58() } : null;
      } catch (e) {
        console.error(`Error fetching ${name}:`, e);
      }
    }
  }
  if (useHttp) {
    // Record confirmed token creation in v2 leaderboard via confirm-token-creation
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
      token: { ...payload.token },
      portalParams: payload.portalParams,
    };
    let confirmResp: any;
    console.log('Posting to confirm endpoint:', CONFIRM_URL, confirmPayload);
    try {
      confirmResp = await axios.post(CONFIRM_URL, confirmPayload, { headers: { 'Content-Type': 'application/json' } });
      console.log('Confirm endpoint response:', confirmResp.status, confirmResp.data);
      debug.confirm = { status: confirmResp.status, data: confirmResp.data };
    } catch (err: any) {
      console.error('Error calling confirm-token-creation endpoint:', err.message || err);
    }
    /**
    const NOTIFY_URL = process.env.NOTIFY_URL || CONFIRM_URL.replace('confirm-token-creation', 'notify-token-creation');
    console.log('Posting to notify endpoint:', NOTIFY_URL, confirmPayload);
    try {
      const notifyResp = await axios.post(
        NOTIFY_URL,
        { ...confirmPayload, createdAt: confirmResp?.data?.createdAt ?? Date.now() },
        { headers: { 'Content-Type': 'application/json' } }
      );
      console.log('Notify endpoint response:', notifyResp.status, notifyResp.data);
      debug.notify = { status: notifyResp.status, data: notifyResp.data };
    } catch (err: any) {
      console.error('Error calling notify-token-creation endpoint:', err.message || err);
    }
    */
  }
  // write collected debug information to file
  fs.writeFileSync(debugPath, JSON.stringify(debug, null, 2));
  console.log('Debug info written to', debugPath);
}

main().catch(err => {
  console.error('Error in test-create-token:', err);
  process.exit(1);
});