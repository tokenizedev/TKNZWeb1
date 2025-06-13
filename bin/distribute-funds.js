#!/usr/bin/env node
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import bs58 from 'bs58';
// Util for optional fetch usage
// Node 18+ has global fetch; if not, user should install node-fetch
const fetchFn = (typeof fetch !== 'undefined') ? fetch : null;
import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';

dotenv.config();

// Telegram announcement setup
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const announce = BOT_TOKEN && CHAT_ID && fetchFn;
if (!announce) console.warn('Telegram announcements disabled (TELEGRAM_BOT_TOKEN/CHAT_ID or fetch missing)');

// Sleep helper
const sleep = ms => new Promise(res => setTimeout(res, ms));

async function main() {
  // CLI args: --dry-run, --amount=<SOL>, --batch-size=<n>, --sheet=<path>
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const amountArg = args.find(a => a.startsWith('--amount='));
  const batchArg = args.find(a => a.startsWith('--batch-size='));
  const sheetArg = args.find(a => a.startsWith('--sheet='));

  const totalSol = amountArg ? parseFloat(amountArg.split('=')[1]) : null;
  const useAll = args.includes('--use-all');
  const batchSize = batchArg ? parseInt(batchArg.split('=')[1], 10) : 20;
  const sheetPath = sheetArg
    ? path.resolve(process.cwd(), sheetArg.split('=')[1])
    : path.resolve(process.cwd(), 'data', 'sheet_c.csv');

  if (!fs.existsSync(sheetPath)) {
    console.error(`CSV file not found: ${sheetPath}`);
    process.exit(1);
  }

  // Parse recipients
  const lines = fs.readFileSync(sheetPath, 'utf8')
    .split(/\r?\n/)
    .filter(l => l.trim());
  const header = lines[0].split(',');
  const addrIdx = header.indexOf('walletAddress');
  const pctIdx = header.indexOf('percentage');
  if (addrIdx < 0 || pctIdx < 0) {
    console.error('CSV must have walletAddress and percentage columns');
    process.exit(1);
  }
  // Parse recipients: percentage column may be a raw fraction (0-1) or a percent string (e.g. "12.34%")
  const recipients = lines.slice(1).map(line => {
    const cols = line.split(',');
    const address = cols[addrIdx];
    const raw = cols[pctIdx].trim();
    let fraction = parseFloat(raw.replace('%', ''));
    if (raw.includes('%')) {
      // convert percent string to fraction
      fraction = fraction / 100;
    }
    return { address, fraction };
  }).filter(r => r.fraction > 0);
  if (recipients.length === 0) {
    console.error('No recipients with percentage > 0 found');
    process.exit(1);
  }

  // Require explicit distribution amount or use-all flag
  if (!amountArg && !useAll) {
    console.error('Error: must provide either --amount=<SOL> to distribute or --use-all to distribute entire treasury balance.');
    process.exit(1);
  }
  // Setup connection and treasury keypair
  const { SOLANA_RPC_URL } = process.env;
  if (!SOLANA_RPC_URL) {
    console.error('Missing SOLANA_RPC_URL environment variable');
    process.exit(1);
  }
  const connection = new Connection(SOLANA_RPC_URL);
  const keyFile = path.resolve(process.cwd(), 'config', 'keys', 'treasury.key');
  if (!fs.existsSync(keyFile)) {
    console.error(`Treasury key file not found: ${keyFile}`);
    process.exit(1);
  }
  const keyData = fs.readFileSync(keyFile, 'utf8').trim();
  let secret;
  try {
    secret = bs58.decode(keyData);
  } catch (e) {
    console.error('Failed to base58-decode treasury key:', e.message || e);
    process.exit(1);
  }
  const treasury = Keypair.fromSecretKey(Uint8Array.from(secret));

  // Determine rent-exempt reserve for treasury
  const rentReserve = await connection.getMinimumBalanceForRentExemption(0);
  // Determine total lamports to distribute, always reserving rent-exempt balance
  let totalLamports;
  const treasuryBalance = await connection.getBalance(treasury.publicKey);
  console.log(`Treasury balance: ${treasuryBalance / LAMPORTS_PER_SOL} SOL`);
  if (amountArg) {
    const desired = Math.floor(totalSol * LAMPORTS_PER_SOL);
    if (desired > treasuryBalance - rentReserve) {
      console.error(
        `Requested amount of ${totalSol} SOL exceeds available balance after reserving rent reserve (${rentReserve / LAMPORTS_PER_SOL} SOL). ` +
        `Available: ${(treasuryBalance - rentReserve) / LAMPORTS_PER_SOL} SOL`
      );
      process.exit(1);
    }
    totalLamports = desired;
    console.log(
      `Distributing explicit amount: ${totalSol} SOL -> ${totalLamports} lamports, ` +
      `reserving ${rentReserve / LAMPORTS_PER_SOL} SOL for rent exemption`
    );
  } else {
    if (!useAll) {
      console.error('Error: must provide either --amount or --use-all');
      process.exit(1);
    }
    if (treasuryBalance <= rentReserve) {
      console.error(
        `Insufficient treasury balance (${treasuryBalance / LAMPORTS_PER_SOL} SOL) to reserve rent exemption of ${rentReserve / LAMPORTS_PER_SOL} SOL.`
      );
      process.exit(1);
    }
    totalLamports = treasuryBalance - rentReserve;
    console.log(
      `Distributing entire available balance: ${totalLamports / LAMPORTS_PER_SOL} SOL -> ${totalLamports} lamports, ` +
      `reserving ${rentReserve / LAMPORTS_PER_SOL} SOL for rent exemption`
    );
  }

  // Compute each recipient's lamports using raw fraction of total
  let distributions = recipients.map(r => ({
    address: r.address,
    lamports: Math.floor(r.fraction * totalLamports),
    fraction: r.fraction,
  }));
  // Adjust rounding error
  const sum = distributions.reduce((acc, d) => acc + d.lamports, 0);
  const diff = totalLamports - sum;
  if (diff !== 0) {
    distributions[0].lamports += diff;
    console.log(`Adjusted ${diff} lamports due to rounding to ${distributions[0].address}`);
  }

  if (dryRun) {
    console.log('Dry run: distributions');
    console.log(`Based on total: ${totalLamports / LAMPORTS_PER_SOL} SOL`);
    distributions.forEach(d => {
      const solAmt = d.lamports / LAMPORTS_PER_SOL;
      const pct = totalLamports > 0 ? (d.lamports / totalLamports) * 100 : 0;
      console.log(
        `${d.address}: ${solAmt.toFixed(9)} SOL (${pct.toFixed(4)}%)`
      );
    });
    process.exit(0);
  }

  // Send transactions one by one, logging errors and continuing
  const successReceipts = [];
  const failedReceipts = [];
  for (const d of distributions) {
    console.log(`Sending to ${d.address}: ${(d.lamports / LAMPORTS_PER_SOL).toFixed(9)} SOL...`);
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: treasury.publicKey,
        toPubkey: new PublicKey(d.address),
        lamports: d.lamports,
      })
    );
    try {
      const sig = await sendAndConfirmTransaction(connection, tx, [treasury]);
      console.log(`Success: ${sig}`);
      successReceipts.push({
        walletAddress: d.address,
        lamports: d.lamports,
        signature: sig,
      });
      // Telegram announcement
      if (announce) {
        const solAmt = (d.lamports / LAMPORTS_PER_SOL).toFixed(9);
        const text =
          `<b>🎉 Congratulations!</b>\n` +
          `You have received <code>${solAmt} SOL</code> to your wallet <code>${d.address}</code> 🎊`;
        try {
          const res = await fetchFn(
            `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: CHAT_ID,
                text,
                parse_mode: 'HTML',
              }),
            }
          );
          if (!res.ok) {
            console.error('Telegram sendMessage error:', await res.text());
          }
        } catch (err) {
          console.error('Error announcing via Telegram:', err);
        }
        // avoid rate limits
        await sleep(1000);
      }
    } catch (e) {
      console.warn(`Failed to send to ${d.address}: ${e.message || e}`);
      failedReceipts.push({
        walletAddress: d.address,
        lamports: d.lamports,
        error: e.message || e.toString(),
      });
    }
  }

  // Write success receipt CSV
  const now = new Date().toISOString().replace(/[:.]/g, '-');
  const successPath = path.resolve(process.cwd(), 'data', `distribution_receipt_${now}.csv`);
  const successRows = [
    ['walletAddress', 'lamports', 'SOL', 'signature'].join(','),
    ...successReceipts.map(r =>
      [
        r.walletAddress,
        r.lamports,
        (r.lamports / LAMPORTS_PER_SOL).toString(),
        r.signature,
      ].join(',')
    ),
  ];
  fs.writeFileSync(successPath, successRows.join('\n'));
  console.log(`Success receipt written to ${successPath}`);

  // Write failure receipt CSV
  if (failedReceipts.length > 0) {
    const failPath = path.resolve(process.cwd(), 'data', `distribution_errors_${now}.csv`);
    const failRows = [
      ['walletAddress', 'lamports', 'SOL', 'error'].join(','),
      ...failedReceipts.map(r =>
        [
          r.walletAddress,
          r.lamports,
          (r.lamports / LAMPORTS_PER_SOL).toString(),
          `"${r.error.replace(/"/g, '""')}"`,
        ].join(',')
      ),
    ];
    fs.writeFileSync(failPath, failRows.join('\n'));
    console.log(`Failure log written to ${failPath}`);
  }
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});