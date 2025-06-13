#!/usr/bin/env node
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { Buffer } from 'buffer';
import { Connection, PublicKey } from '@solana/web3.js';
import { getMint, getAssociatedTokenAddress } from '@solana/spl-token';

dotenv.config();

async function main() {
  const { SOLANA_RPC_URL } = process.env;
  if (!SOLANA_RPC_URL) {
    console.error('Missing SOLANA_RPC_URL environment variable.');
    process.exit(1);
  }
  const connection = new Connection(SOLANA_RPC_URL);

  // Token mint for TKNZ
  const TKNZ_MINT_ADDRESS = 'AfyDiEptGHEDgD69y56XjNSbTs23LaF1YHANVKnWpump';
  const tokenMint = new PublicKey(TKNZ_MINT_ADDRESS);
  // Fetch mint info for decimals
  const mintInfo = await getMint(connection, tokenMint);
  const decimals = mintInfo.decimals;

  // Paths for input sheets
  const dataDir = path.resolve(process.cwd(), 'data');
  const sheetAPath = path.join(dataDir, 'sheet_a.csv');
  const sheetBPath = path.join(dataDir, 'sheet_b.csv');
  if (!fs.existsSync(sheetAPath) || !fs.existsSync(sheetBPath)) {
    console.error('Input CSV files not found in data/: sheet_a.csv and sheet_b.csv are required.');
    process.exit(1);
  }

  // Read and parse wallet addresses
  const parseAddresses = filePath => {
    return fs
      .readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .slice(1)
      .map(line => line.trim().split(',')[0])
      .filter(addr => addr);
  };
  const addressesA = parseAddresses(sheetAPath);
  const addressesB = parseAddresses(sheetBPath);
  const uniqueSet = new Set([...addressesA, ...addressesB]);
  const wallets = Array.from(uniqueSet);
  if (wallets.length === 0) {
    console.error('No wallet addresses found in input files.');
    process.exit(1);
  }
  console.log(`Found ${wallets.length} unique wallet addresses.`);

  // Validate and filter wallet public keys
  const validWallets = [];
  const invalidWallets = [];
  for (const addr of wallets) {
    try {
      new PublicKey(addr);
      validWallets.push(addr);
    } catch (e) {
      invalidWallets.push(addr);
    }
  }
  if (invalidWallets.length > 0) {
    console.warn(`Skipping ${invalidWallets.length} invalid wallet addresses:`, invalidWallets);
  }
  const finalWallets = validWallets;
  if (finalWallets.length === 0) {
    console.error('No valid wallet addresses to process.');
    process.exit(1);
  }
  console.log(`Processing ${finalWallets.length} valid wallet addresses.`);

  // Fetch balances in batches
  const results = [];
  const batchSize = 20;
  const delayMs = 500;
  for (let i = 0; i < finalWallets.length; i += batchSize) {
    const end = Math.min(i + batchSize, finalWallets.length);
    const batch = finalWallets.slice(i, end);
    console.log(`Fetching balances for wallets ${i + 1}-${end} of ${finalWallets.length}...`);
    // Derive ATAs for each owner, skipping off-curve errors
    const ataResults = await Promise.all(
      batch.map(async addr => {
        try {
          const ownerPubkey = new PublicKey(addr);
          const ata = await getAssociatedTokenAddress(tokenMint, ownerPubkey);
          return { owner: addr, ata, error: null };
        } catch (err) {
          return { owner: addr, ata: null, error: err };
        }
      })
    );
    const validMappings = ataResults.filter(r => {
      if (r.error) {
        console.warn(
          `Skipping wallet ${r.owner} in batch ${i + 1}-${end} due to: ${r.error.name || ''} ${r.error.message || r.error}`
        );
      }
      return r.ata;
    });
    if (validMappings.length === 0) {
      console.warn(`No valid token accounts in batch ${i + 1}-${end}, skipping.`);
      continue;
    }
    const atas = validMappings.map(r => r.ata);
    const owners = validMappings.map(r => r.owner);
    let infos;
    try {
      infos = await connection.getMultipleAccountsInfo(atas);
    } catch (err) {
      console.error(`Error fetching account infos for batch ${i + 1}-${end}:`, err.message || err);
      process.exit(1);
    }
    for (let j = 0; j < owners.length; j++) {
      const addr = owners[j];
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
    // Delay before next batch to avoid rate limits
    if (end < finalWallets.length) {
      await new Promise(res => setTimeout(res, delayMs));
    }
  }

  // Compute total held
  const total = results.reduce((sum, r) => sum + r.balance, 0);
  // Sort by balance descending
  results.sort((a, b) => b.balance - a.balance);

  // Prepare and write CSV output (using decimal fractions instead of percentage)
  const outputPath = path.join(dataDir, 'sheet_c.csv');
  const header = ['walletAddress', 'balance', 'percentage'];
  const rows = [
    header.join(','),
    ...results.map(r => {
      const fraction = total > 0 ? r.balance / total : 0;
      // eight decimal places of fraction of total
      return `${r.walletAddress},${r.balance},${fraction.toFixed(8)}`;
    }),
  ];
  fs.writeFileSync(outputPath, rows.join('\n'));
  console.log(`Results written to ${outputPath}`);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});