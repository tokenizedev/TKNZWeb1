#!/usr/bin/env ts-node
import fs from 'fs';
import path from 'path';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
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
} from '../src/amm';

async function main() {
  const RPC = 'https://api.devnet.solana.com';
  const connection = new Connection(RPC, 'confirmed');
  console.log('Connected to Devnet');

  // Fund payer with airdrop
  const payer = Keypair.generate();
  console.log('Requesting airdrop for payer:', payer.publicKey.toBase58());
  const airdropSig = await connection.requestAirdrop(payer.publicKey, 2e9);
  await connection.confirmTransaction(airdropSig, 'confirmed');
  console.log('Airdrop confirmed');

  // Create two mints with 6 decimals
  console.log('Creating token mints...');
  const mintA = await createMint(connection, payer, payer.publicKey, null, 6);
  const mintB = await createMint(connection, payer, payer.publicKey, null, 6);
  console.log('Mint A:', mintA.toBase58());
  console.log('Mint B:', mintB.toBase58());

  // Create/get ATAs for payer
  console.log('Ensuring ATAs for payer...');
  const ataA = await getOrCreateAssociatedTokenAccount(connection, payer, mintA, payer.publicKey);
  const ataB = await getOrCreateAssociatedTokenAccount(connection, payer, mintB, payer.publicKey);
  console.log('ATA A:', ataA.address.toBase58());
  console.log('ATA B:', ataB.address.toBase58());

  // Mint 1,000 units to each ATA
  const amountUi = 1000;
  const rawA = await parseTokenAmount(connection, mintA, amountUi);
  const rawB = await parseTokenAmount(connection, mintB, amountUi);
  console.log(`Minting ${amountUi} units to ATA A`);
  await mintTo(connection, payer, mintA, ataA.address, payer, rawA.toNumber());
  console.log(`Minting ${amountUi} units to ATA B`);
  await mintTo(connection, payer, mintB, ataB.address, payer, rawB.toNumber());

  // Create the pool with 0.3% fee and lock liquidity
  console.log('Creating pool...');
  const config = await getOrCreatePoolFeeConfig(connection, payer);
  const tokenAAmount = rawA;
  const tokenBAmount = rawB;
  const cpAmm = new CpAmm(connection);
  const { initSqrtPrice, liquidityDelta } = cpAmm.preparePoolCreationParams({
    tokenAAmount,
    tokenBAmount,
    minSqrtPrice: new BN(0),
    maxSqrtPrice: new BN('340282366920938463463374607431768211455'),
  });
  const positionNft = Keypair.generate();
  const poolBuilder = await cpAmm.createPool({
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
  const poolTx = poolBuilder.transaction();
  poolTx.sign(payer, positionNft);
  const poolSig = await connection.sendRawTransaction(poolTx.serialize(), { skipPreflight: false, preflightCommitment: 'confirmed' });
  await connection.confirmTransaction(poolSig, 'finalized');
  console.log('Pool created, sig:', poolSig);
  const poolAddress = derivePoolAddress(config, mintA, mintB);
  console.log('Pool address:', poolAddress.toBase58());

  // Perform a sample swap 10 units A -> B
  console.log('Performing swap: 10 A -> B');
  const swapIn = await parseTokenAmount(connection, mintA, 10);
  const tokenAVault = deriveTokenVaultAddress(mintA, poolAddress);
  const tokenBVault = deriveTokenVaultAddress(mintB, poolAddress);
  const swapBuilder = cpAmm.swap({
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
  const swapTx = swapBuilder.transaction();
  swapTx.sign(payer);
  const swapSig = await connection.sendRawTransaction(swapTx.serialize(), { skipPreflight: false, preflightCommitment: 'confirmed' });
  await connection.confirmTransaction(swapSig, 'finalized');
  console.log('Swap executed, sig:', swapSig);

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