#!/usr/bin/env ts-node-esm
import dotenv from 'dotenv';
import axios from 'axios';

// Load environment variables from .env
dotenv.config();

/**
 * Atomic test for the confirm-token-creation API endpoint.
 *
 * Update the payload values below to match your token creation data.
 */
const payload = {
  // Required: Mint address of the token
  mint: 'YOUR_MINT_ADDRESS',
  // Associated token account (ATA) address for the mint, owned by the creator
  ata: 'YOUR_ASSOCIATED_TOKEN_ACCOUNT_ADDRESS',
  // Pool address created for this token
  pool: 'YOUR_POOL_ADDRESS',
  // On-chain metadata URI returned by the create-token endpoint
  metadataUri: 'YOUR_METADATA_URI',
  // Token decimals
  decimals: 9,
  // Initial supply in UI units (e.g., 1e9 for 1,000,000,000 with 9 decimals)
  initialSupply: 1000000000,
  // Initial supply in raw units (e.g., 1e18 for 1e9 * 1e9)
  initialSupplyRaw: 1e18,
  // SOL amount deposited into pool (e.g., 0.01)
  depositSol: 0.01,
  // Lamports deposited into pool (e.g., depositSol * LAMPORTS_PER_SOL)
  depositLamports: 10000000,
  // SOL fee taken by treasury (e.g., 0)
  feeSol: 0,
  // Lamports fee (e.g., feeSol * LAMPORTS_PER_SOL)
  feeLamports: 0,
  // Whether liquidity is locked
  isLockLiquidity: false,
  // Creator wallet address
  walletAddress: 'YOUR_WALLET_ADDRESS',
  // Token metadata object
  token: {
    name: 'YOUR_TOKEN_NAME',
    ticker: 'YOUR_TOKEN_TICKER',
    description: 'YOUR_TOKEN_DESCRIPTION',
    websiteUrl: 'https://your.website',
    twitter: 'https://twitter.com/your',
    telegram: 'https://t.me/your',
    imageUrl: 'https://your.image.url',
  },
  // Portal parameters (same as passed to create-token endpoint)
  portalParams: {
    amount: 0.01,
    priorityFee: 0,
  },
};

// URL of the confirm-token-creation function (override with CONFIRM_TOKEN_URL env var)
const CONFIRM_URL =
  process.env.CONFIRM_TOKEN_URL ||
  process.env.FUNCTION_URL ||
  'http://localhost:8888/.netlify/functions/confirm-token-creation';

axios
  .post(CONFIRM_URL, payload, { headers: { 'Content-Type': 'application/json' } })
  .then((response) => {
    console.log('Confirm-token-creation response status:', response.status);
    console.log('Response data:', response.data);
  })
  .catch((error) => {
    console.error(
      'Error calling confirm-token-creation endpoint:',
      error.response ? error.response.data : error.message
    );
    process.exit(1);
  });