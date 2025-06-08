#!/usr/bin/env ts-node
/**
 * Script to create a CP-AMM static config on-chain.
 *
 * Usage:
 *   ts-node scripts/create-static-config.ts \
 *     --keypair /path/to/admin-keypair.json \
 *     --rpc https://api.mainnet-beta.solana.com \
 *     --index 0 \
 *     --pool-fees-file ./pool-fees.json \
 *     --sqrt-min-price <decimal> \
 *     --sqrt-max-price <decimal> \
 *     --vault-config-key <Pubkey> \
 *     [--pool-creator-authority <Pubkey>] \
 *     [--activation-type <number>] \
 *     [--collect-fee-mode <number>]
 */
import fs from 'fs';
import { hideBin } from 'yargs/helpers';
import yargs from 'yargs';
import { Keypair, Connection, PublicKey, SystemProgram, sendAndConfirmTransaction } from '@solana/web3.js';
import BN from 'bn.js';
import { CpAmm } from '@meteora-ag/cp-amm-sdk';

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .option('keypair', { type: 'string', demandOption: true,
      description: 'Path to admin Keypair JSON file' })
    .option('rpc', { type: 'string', default: process.env.RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com',
      description: 'Solana RPC endpoint' })
    .option('index', { type: 'string', default: '0',
      description: 'Config index (u64)' })
    .option('pool-fees-file', { type: 'string', demandOption: true,
      description: 'Path to JSON file with poolFeeParameters object' })
    .option('sqrt-min-price', { type: 'string', demandOption: true,
      description: 'Minimum sqrt price (u128 as decimal string)' })
    .option('sqrt-max-price', { type: 'string', demandOption: true,
      description: 'Maximum sqrt price (u128 as decimal string)' })
    .option('vault-config-key', { type: 'string', demandOption: true,
      description: 'Vault config key (PublicKey)' })
    .option('pool-creator-authority', { type: 'string', default: '',
      description: 'Authority allowed to create pools (PublicKey), empty for public' })
    .option('activation-type', { type: 'number', default: 0,
      description: 'Activation type (u8)' })
    .option('collect-fee-mode', { type: 'number', default: 0,
      description: 'Collect fee mode (u8)' })
    .argv;

  // Load admin keypair
  const secret = JSON.parse(fs.readFileSync(argv.keypair, 'utf-8'));
  const admin = Keypair.fromSecretKey(Buffer.from(secret));

  const connection = new Connection(argv.rpc, 'finalized');
  const cpAmm = new CpAmm(connection);
  // Derive config PDA: seeds ["config", index (u64 le)]
  const idx = new BN(argv.index);
  const seedConfig = Buffer.from('config');
  const [configPda] = PublicKey.findProgramAddressSync(
    [seedConfig, idx.toArrayLike(Buffer, 'le', 8)],
    // @ts-ignore
    (cpAmm as any)._program.programId
  );
  // Derive event authority PDA: seed ["__event_authority"]
  const seedEvent = Buffer.from('__event_authority');
  const [eventAuthority] = PublicKey.findProgramAddressSync(
    [seedEvent],
    // @ts-ignore
    (cpAmm as any)._program.programId
  );

  // Read and normalize poolFeeParameters JSON
  const rawPoolFees: any = JSON.parse(fs.readFileSync(argv.poolFeesFile, 'utf-8'));
  const poolFees = {
    baseFee: {
      cliffFeeNumerator: new BN(rawPoolFees.baseFee.cliffFeeNumerator),
      numberOfPeriod: rawPoolFees.baseFee.numberOfPeriod,
      periodFrequency: new BN(rawPoolFees.baseFee.periodFrequency),
      reductionFactor: new BN(rawPoolFees.baseFee.reductionFactor),
      feeSchedulerMode: rawPoolFees.baseFee.feeSchedulerMode,
    },
    protocolFeePercent: rawPoolFees.protocolFeePercent,
    partnerFeePercent: rawPoolFees.partnerFeePercent,
    referralFeePercent: rawPoolFees.referralFeePercent,
    dynamicFee: rawPoolFees.dynamicFee
      ? {
          binStep: rawPoolFees.dynamicFee.binStep,
          binStepU128: new BN(rawPoolFees.dynamicFee.binStepU128),
          filterPeriod: rawPoolFees.dynamicFee.filterPeriod,
          decayPeriod: rawPoolFees.dynamicFee.decayPeriod,
          reductionFactor: rawPoolFees.dynamicFee.reductionFactor,
          maxVolatilityAccumulator: rawPoolFees.dynamicFee.maxVolatilityAccumulator,
          variableFeeControl: rawPoolFees.dynamicFee.variableFeeControl,
        }
      : null,
  };

  // Prepare config parameters
  const configParams = {
    poolFees,
    sqrtMinPrice: new BN(argv['sqrt-min-price']),
    sqrtMaxPrice: new BN(argv['sqrt-max-price']),
    vaultConfigKey: new PublicKey(argv['vault-config-key']),
    poolCreatorAuthority: argv['pool-creator-authority']
      ? new PublicKey(argv['pool-creator-authority'])
      : new PublicKey(Buffer.alloc(32)),
    activationType: argv['activation-type'],
    collectFeeMode: argv['collect-fee-mode'],
  };

  // Build and send transaction
  console.log('Creating static config at', configPda.toBase58());
  // Build the transaction using Anchor methods builder
  // @ts-ignore
  const builder = (cpAmm as any)._program.methods
    .createConfig(idx, configParams)
    .accounts({
      config: configPda,
      admin: admin.publicKey,
      systemProgram: SystemProgram.programId,
      eventAuthority,
      program: (cpAmm as any)._program.programId,
    })
    .signers([admin]);

  // Create the transaction
  const tx = await builder.transaction();
  // Set fee payer and recent blockhash
  tx.feePayer = admin.publicKey;
  const { blockhash } = await connection.getLatestBlockhash('finalized');
  tx.recentBlockhash = blockhash;

  // Send and confirm the transaction, handling existing-account case
  try {
    const txSig = await sendAndConfirmTransaction(connection, tx, [admin], {
      commitment: 'finalized',
    });
    console.log('Transaction signature:', txSig);
    console.log('Static config created:', configPda.toBase58());
    return;
  } catch (err: any) {
    // If the config account already exists, fetch and display its state
    if (err.transactionLogs && err.transactionLogs.some((log: string) => log.includes('already in use'))) {
      console.log(`Config already exists at ${configPda.toBase58()}`);
      const configState = await cpAmm.fetchConfigState(configPda);
      console.log('Existing config state:', configState);
      return;
    }
    throw err;
  }
}

main().catch(err => {
  console.error('Error creating static config:', err);
  process.exit(1);
});