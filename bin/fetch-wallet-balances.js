#!/usr/bin/env node
import dotenv from 'dotenv';
import admin from 'firebase-admin';
import { Connection, PublicKey } from '@solana/web3.js';
import { getMint, getAssociatedTokenAddress, TOKEN_PROGRAM_ID, AccountLayout } from '@solana/spl-token';
import { Buffer } from 'buffer';
import fs from 'fs';
import path from 'path';
import { format } from 'date-fns';

// Load environment variables from .env if present
dotenv.config();

async function main() {
  // Initialize Firebase Admin SDK
  if (!admin.apps.length) {
    const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;
    if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
      console.error('Missing Firebase environment variables. Please set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY.');
      process.exit(1);
    }
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: FIREBASE_PROJECT_ID,
        clientEmail: FIREBASE_CLIENT_EMAIL,
        privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });
  }
  const db = admin.firestore();

  // Fetch active and created wallet events
  console.log('Fetching wallet_active and wallet_created events from Firestore...');
  const [snapActive, snapCreated] = await Promise.all([
    db.collection('events').where('eventName', '==', 'wallet_active').get(),
    db.collection('events').where('eventName', '==', 'wallet_created').get(),
  ]);
  // Combine both event types
  const allDocs = [...snapActive.docs, ...snapCreated.docs];
  const wallets = allDocs
    .map(doc => {
      const data = doc.data();
      return data.walletAddres || data.walletAddress;
    })
    .filter(addr => typeof addr === 'string');
  if (wallets.length === 0) {
    console.log('No wallets found.');
    return;
  }
  const uniqueWallets = [...new Set(wallets)];
  console.log(`Found ${uniqueWallets.length} unique wallets.`);

  // Initialize Solana connection
  const { SOLANA_RPC_URL } = process.env;
  if (!SOLANA_RPC_URL) {
    console.error('Missing SOLANA_RPC_URL environment variable.');
    process.exit(1);
  }
  const connection = new Connection(SOLANA_RPC_URL);

  // Token mint for TKNZ
  const TKNZ_MINT_ADDRESS = 'AfyDiEptGHEDgD69y56XjNSbTs23LaF1YHANVKnWpump';
  const tokenMint = new PublicKey(TKNZ_MINT_ADDRESS);
  console.log('Fetching mint info for TKNZ...');
  const mintInfo = await getMint(connection, tokenMint);
  const decimals = mintInfo.decimals;
  console.log(`Token decimals: ${decimals}`);

  // Batch settings
  const batchSize = 20;
  const delayMs = 500;
  const results = [];

  // Process in batches to avoid RPC overload
  for (let i = 0; i < uniqueWallets.length; i += batchSize) {
    const batch = uniqueWallets.slice(i, i + batchSize);
    // Derive associated token accounts
    const atas = await Promise.all(
      batch.map(addr => getAssociatedTokenAddress(tokenMint, new PublicKey(addr)))
    );
    // Fetch multiple account infos
    const infos = await connection.getMultipleAccountsInfo(atas);
    // Decode balances
    for (let j = 0; j < batch.length; j++) {
      const addr = batch[j];
      const info = infos[j];
      let balance = 0;
      if (info && info.data) {
        const data = Buffer.from(info.data);
        const rawAmount = data.readBigUInt64LE(64);
        balance = Number(rawAmount) / 10 ** decimals;
      }
      results.push({ walletAddress: addr, balance });
      console.log(`${addr}: ${balance}`);
    }
    if (i + batchSize < uniqueWallets.length) {
      console.log(`Waiting ${delayMs}ms before next batch...`);
      await new Promise(res => setTimeout(res, delayMs));
    }
  }

  // Ensure output directory exists and get timestamp
  const dataDir = path.resolve(process.cwd(), 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const timestamp = format(new Date(), 'yyyyMMdd_HHmmss');

  // Write event-based balances CSV
  const eventFilePath = path.join(dataDir, `wallet_balances_events_${timestamp}.csv`);
  const header = ['walletAddress', 'balance'];
  const eventRows = [
    header.join(','),
    ...results.map(r => `${r.walletAddress},${r.balance}`),
  ];
  fs.writeFileSync(eventFilePath, eventRows.join('\n'));
  console.log(`Event-based results written to ${eventFilePath}`);

  // Fetch all token holders via RPC using getProgramAccounts
  console.log('Fetching all token holders from RPC...');
  const tokenAccounts = await connection.getProgramAccounts(TOKEN_PROGRAM_ID, {
    filters: [
      { dataSize: AccountLayout.span },
      { memcmp: { offset: 0, bytes: tokenMint.toBase58() } },
    ],
  });
  const holderMap = new Map();
  tokenAccounts.forEach(({ account }) => {
    const data = Buffer.from(account.data);
    const rawAmount = data.readBigUInt64LE(64);
    if (rawAmount === 0n) return;
    const amount = Number(rawAmount) / 10 ** decimals;
    const ownerPub = new PublicKey(data.slice(32, 64)).toBase58();
    holderMap.set(ownerPub, (holderMap.get(ownerPub) || 0) + amount);
  });
  const rpcResults = Array.from(holderMap.entries()).map(([walletAddress, balance]) => ({ walletAddress, balance }));

  // Write RPC-based holders CSV
  const rpcFilePath = path.join(dataDir, `token_holders_rpc_${timestamp}.csv`);
  const rpcRows = [
    header.join(','),
    ...rpcResults.map(r => `${r.walletAddress},${r.balance}`),
  ];
  fs.writeFileSync(rpcFilePath, rpcRows.join('\n'));
  console.log(`RPC-based results written to ${rpcFilePath}`);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});