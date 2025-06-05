#!/usr/bin/env ts-node
import fs from 'fs';
import path from 'path';
import { Connection, Keypair, PublicKey, SendTransactionError } from '@solana/web3.js';
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import BN from 'bn.js';
import { CpAmm, derivePoolAddress, deriveTokenVaultAddress } from '@meteora-ag/cp-amm-sdk';
import {
  getOrCreatePoolFeeConfig,
  parseTokenAmount,
  configurePoolLiquidityAndFees,
} from '../src/amm.ts';

function saveKeyPair(keypair: Keypair, filename: string) {
  console.log(`Saving key pair to ${filename}`);
  // Save only the secret key array for easy reload
  const secretKeyArray = Array.from(keypair.secretKey);
  // Ensure directory exists
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, JSON.stringify(secretKeyArray));
}

function loadKeyPair(filename: string): Keypair {
  if (!fs.existsSync(filename)) {
    console.log(`Key pair file ${filename} does not exist, generating new key pair`);
    const keypair = Keypair.generate();
    saveKeyPair(keypair, filename);
    return keypair;
  }
  console.log(`Loading key pair from ${filename}`);
  const raw = JSON.parse(fs.readFileSync(filename, 'utf8'));
  let secretKeyArray: number[];
  if (Array.isArray(raw)) {
    secretKeyArray = raw;
  } else if (raw._keypair && raw._keypair.secretKey) {
    const sk = raw._keypair.secretKey;
    // Convert object of indexes to array if necessary
    secretKeyArray = Array.isArray(sk) ? sk : Object.values(sk);
  } else {
    throw new Error(`Unexpected key pair format in ${filename}`);
  }
  return Keypair.fromSecretKey(Uint8Array.from(secretKeyArray));
}

async function main() {
  const RPC = 'https://api.devnet.solana.com';
  const connection = new Connection(RPC, 'confirmed');
  console.log('Connected to Devnet');

  // Fund payer with airdrop if necessary
  const payer = loadKeyPair('config/keys/devnet/payer.json');
  const requiredLamports = 1e9; // 1 SOL
  // Check current balance and request airdrop only if below requirement
  const payerBalance = await connection.getBalance(payer.publicKey, 'confirmed');
  if (payerBalance < requiredLamports) {
    const toRequest = requiredLamports - payerBalance;
    console.log(`Payer balance ${payerBalance} lamports is below required ${requiredLamports}, requesting airdrop of ${toRequest} lamports...`);
    const airdropSig = await connection.requestAirdrop(payer.publicKey, toRequest);
    await connection.confirmTransaction(airdropSig, 'confirmed');
    console.log(`Airdrop of ${toRequest} lamports confirmed`);
  } else {
    console.log(`Payer has sufficient balance: ${payerBalance} lamports, skipping airdrop`);
  }

  // Load or create two mints with 6 decimals
  const decimals = 6;
  const mintAPath = 'config/keys/devnet/mintA.json';
  let mintAKeypair: Keypair;
  let mintA: PublicKey;
  if (fs.existsSync(mintAPath)) {
    mintAKeypair = loadKeyPair(mintAPath);
    mintA = mintAKeypair.publicKey;
    console.log(`Loaded existing mint A from ${mintAPath}: ${mintA.toBase58()}`);
  } else {
    mintAKeypair = Keypair.generate();
    saveKeyPair(mintAKeypair, mintAPath);
    mintA = await createMint(connection, payer, payer.publicKey, null, decimals, mintAKeypair);
    console.log(`Created new mint A: ${mintA.toBase58()}`);
  }
  
  const mintBPath = 'config/keys/devnet/mintB.json';
  let mintBKeypair: Keypair;
  let mintB: PublicKey;
  if (fs.existsSync(mintBPath)) {
    mintBKeypair = loadKeyPair(mintBPath);
    mintB = mintBKeypair.publicKey;
    console.log(`Loaded existing mint B from ${mintBPath}: ${mintB.toBase58()}`);
  } else {
    mintBKeypair = Keypair.generate();
    saveKeyPair(mintBKeypair, mintBPath);
    mintB = await createMint(connection, payer, payer.publicKey, null, decimals, mintBKeypair);
    console.log(`Created new mint B: ${mintB.toBase58()}`);
  }

  // Create/get ATAs for payer
  console.log('Ensuring ATAs for payer...');
  const ataA = await getOrCreateAssociatedTokenAccount(connection, payer, mintA, payer.publicKey);
  const ataB = await getOrCreateAssociatedTokenAccount(connection, payer, mintB, payer.publicKey);
  console.log('ATA A:', ataA.address.toBase58());
  console.log('ATA B:', ataB.address.toBase58());

  // Ensure payer has at least 1,000 units of each token
  const amountUi = 1000;
  const rawAmountA = await parseTokenAmount(connection, mintA, amountUi);
  const rawAmountB = await parseTokenAmount(connection, mintB, amountUi);
  const accountAInfo = await getAccount(connection, ataA.address);
  const accountAAmount = new BN(accountAInfo.amount.toString());
  if (accountAAmount.lt(rawAmountA)) {
    const mintAmount = rawAmountA.sub(accountAAmount).toNumber();
    console.log(`Minting ${amountUi} units to ATA A (missing: ${mintAmount})`);
    await mintTo(connection, payer, mintA, ataA.address, payer, mintAmount);
  } else {
    console.log(`ATA A already has ${accountAAmount.toString()} tokens, skipping mint`);
  }
  const accountBInfo = await getAccount(connection, ataB.address);
  const accountBAmount = new BN(accountBInfo.amount.toString());
  if (accountBAmount.lt(rawAmountB)) {
    const mintAmount = rawAmountB.sub(accountBAmount).toNumber();
    console.log(`Minting ${amountUi} units to ATA B (missing: ${mintAmount})`);
    await mintTo(connection, payer, mintB, ataB.address, payer, mintAmount);
  } else {
    console.log(`ATA B already has ${accountBAmount.toString()} tokens, skipping mint`);
  }

  // Derive the pool address and check for existing pool
  const config = await getOrCreatePoolFeeConfig(connection, payer);
  const poolAddress = derivePoolAddress(config, mintA, mintB);
  console.log('Derived pool address:', poolAddress.toBase58());
  const existingPool = await connection.getAccountInfo(poolAddress);
  // Initialize AMM SDK
  const cpAmm = new CpAmm(connection);
  if (existingPool) {
    console.log('Pool already exists, skipping creation');
  } else {
    console.log('Creating new pool...');
    const tokenAAmount = rawAmountA;
    const tokenBAmount = rawAmountB;
    const { initSqrtPrice, liquidityDelta } = cpAmm.preparePoolCreationParams({
      tokenAAmount,
      tokenBAmount,
      minSqrtPrice: new BN(0),
      maxSqrtPrice: new BN('340282366920938463463374607431768211455'),
    });
    const positionNft = Keypair.generate();
    const poolTx = await cpAmm.createPool({
      payer: payer.publicKey,
      creator: payer.publicKey,
      config,
      positionNft: positionNft.publicKey,
      tokenAMint: mintA,
      tokenBMint: mintB,
      initSqrtPrice,
      liquidityDelta,
      tokenAAmount,
      tokenBAmount,
      activationPoint: null,
      tokenAProgram: TOKEN_PROGRAM_ID,
      tokenBProgram: TOKEN_PROGRAM_ID,
      isLockLiquidity: true,
    });
    poolTx.feePayer = payer.publicKey;
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    poolTx.recentBlockhash = blockhash;
    poolTx.sign(payer, positionNft);
    const poolSig = await connection.sendRawTransaction(poolTx.serialize(), { skipPreflight: false, preflightCommitment: 'confirmed' });
    await connection.confirmTransaction(poolSig, 'finalized');
    console.log('Pool created, sig:', poolSig);
  }

  // Ensure payer has enough token A for swap
  const swapAmountUi = 10;
  const swapIn = await parseTokenAmount(connection, mintA, swapAmountUi);
  const postSwapAccountAInfo = await getAccount(connection, ataA.address);
  const postSwapAccountAAmount = new BN(postSwapAccountAInfo.amount.toString());
  if (postSwapAccountAAmount.lt(swapIn)) {
    const mintAmount = swapIn.sub(postSwapAccountAAmount).toNumber();
    console.log(`Minting ${swapAmountUi} units to ATA A for swap (missing: ${mintAmount})`);
    await mintTo(connection, payer, mintA, ataA.address, payer, mintAmount);
  }

  // Perform a sample swap 10 units A -> B
  console.log('Performing swap: 10 A -> B');
  const tokenAVault = deriveTokenVaultAddress(mintA, poolAddress);
  const tokenBVault = deriveTokenVaultAddress(mintB, poolAddress);
  // Prepare swap transaction
  const swapTx = await cpAmm.swap({
    payer: payer.publicKey,
    pool: poolAddress,
    inputTokenMint: mintA,
    outputTokenMint: mintB,
    amountIn: swapIn,
    minimumAmountOut: new BN(0),
    tokenAMint: mintA,
    tokenBMint: mintB,
    tokenAVault,
    tokenBVault,
    tokenAProgram: TOKEN_PROGRAM_ID,
    tokenBProgram: TOKEN_PROGRAM_ID,
    referralTokenAccount: null,
  });
  swapTx.feePayer = payer.publicKey;
  const { blockhash: swapBlockhash } = await connection.getLatestBlockhash('confirmed');
  swapTx.recentBlockhash = swapBlockhash;
  swapTx.sign(payer);
  try {
    const swapSig = await connection.sendRawTransaction(swapTx.serialize(), { skipPreflight: false, preflightCommitment: 'confirmed' });
    await connection.confirmTransaction(swapSig, 'finalized');
    console.log('Swap executed, sig:', swapSig);
  } catch (err: any) {
    console.error('Swap transaction failed:', err.message || err);
    if (err instanceof SendTransactionError) {
      console.error('Simulation logs:', err.logs);
    }
    process.exit(1);
  }

  // Fetch resulting balances
  const postA = await getAccount(connection, ataA.address);
  const postB = await getAccount(connection, ataB.address);
  console.log('Post-swap balances:');
  console.log('  Token A:', postA.amount.toString());
  console.log('  Token B:', postB.amount.toString());
}

main()
  .then(() => console.log('Devnet test complete'))
  .catch((err) => {
    console.error('Devnet test failed:', err);
    process.exit(1);
  });