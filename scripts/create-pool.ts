#!/usr/bin/env ts-node
import fs from 'fs';
import { hideBin } from 'yargs/helpers';
import yargs from 'yargs';
import { Keypair, Connection, sendAndConfirmTransaction, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import BN from 'bn.js';
import { CpAmm, derivePoolAddress } from '@meteora-ag/cp-amm-sdk';
import { getOrCreatePoolFeeConfig, parseTokenAmount } from '../src/amm';

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .option('keypair', { type: 'string', demandOption: true, description: 'Path to payer keypair JSON file' })
    .option('rpc', { type: 'string', default: 'https://api.devnet.solana.com', description: 'Solana RPC endpoint' })
    .option('mintA', { type: 'string', demandOption: true, description: 'Token A mint address' })
    .option('mintB', { type: 'string', default: 'So11111111111111111111111111111111111111112', description: 'Token B mint address (SOL)' })
    .option('amountA', { type: 'number', demandOption: true, description: 'Amount of token A to deposit (UI)' })
    .option('amountB', { type: 'number', default: 0, description: 'Amount of token B to deposit (UI)' })
    .option('lockLiquidity', { type: 'boolean', default: false, description: 'Whether to permanently lock initial liquidity' })
    .argv;

  // Load payer keypair
  const payer = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(fs.readFileSync(argv.keypair, 'utf-8')))
  );
  const connection = new Connection(argv.rpc, 'finalized');

  // 1) Ensure a pool fee config exists
  const config = await getOrCreatePoolFeeConfig(connection, payer);

  // 2) Parse UI amounts into raw BN
  const tokenAAmount = await parseTokenAmount(connection, new PublicKey(argv.mintA), argv.amountA);
  const tokenBAmount = await parseTokenAmount(connection, new PublicKey(argv.mintB), argv.amountB);

  // 3) Prepare pool creation params
  const cpAmm = new CpAmm(connection);
  const { initSqrtPrice, liquidityDelta } = cpAmm.preparePoolCreationParams({
    tokenAAmount,
    tokenBAmount,
    minSqrtPrice: new BN(0),
    maxSqrtPrice: new BN('340282366920938463463374607431768211455'),
  });

  // 4) Build createPool transaction
  const positionNft = Keypair.generate();
  const txBuilder = await cpAmm.createPool({
    payer: payer.publicKey,
    creator: payer.publicKey,
    config,
    positionNft: positionNft.publicKey,
    tokenAMint: new PublicKey(argv.mintA),
    tokenBMint: new PublicKey(argv.mintB),
    initSqrtPrice,
    liquidityDelta,
    tokenAAmount,
    tokenBAmount,
    activationPoint: null,
    tokenAProgram: TOKEN_PROGRAM_ID,
    tokenBProgram: TOKEN_PROGRAM_ID,
    isLockLiquidity: argv.lockLiquidity,
  });
  const tx = txBuilder.transaction();
  tx.sign([payer, positionNft]);

  // 5) Send and confirm transaction
  try {
    const signature = await sendAndConfirmTransaction(
      connection,
      tx,
      [payer, positionNft],
      { commitment: 'finalized' }
    );
    console.log(`Pool created: ${signature}`);
    const poolAddr = derivePoolAddress(
      config,
      new PublicKey(argv.mintA),
      new PublicKey(argv.mintB)
    );
    console.log(`Pool address: ${poolAddr.toBase58()}`);
  } catch (err: any) {
    console.error('Failed creating pool:', err);
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});