import { Connection, Keypair, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { CpAmm, deriveConfigAddress, derivePositionAddress, derivePositionNftAccount, deriveClaimFeeOperatorAddress } from '@meteora-ag/cp-amm-sdk';
import { getMint } from '@solana/spl-token';
import BN from 'bn.js';

/**
 * Fetches an existing pool fee configuration account, or creates one with default parameters.
 *
 * @param connection Solana connection object.
 * @param payer Keypair paying for transactions and authority for new config.
 * @returns PublicKey of the existing or newly created config account.
 */
export async function getOrCreatePoolFeeConfig(
  connection: Connection,
  payer: Keypair
): Promise<PublicKey> {
  const cpAmm = new CpAmm(connection);
  console.log('Looking up existing pool fee configs on-chain...');
  const configs = await cpAmm.getAllConfigs();
  if (configs && configs.length > 0) {
    // cpAmm.getAllConfigs() returns objects with 'publicKey' and 'account'
    const existingPubkey = configs[0].publicKey;
    console.log('Found existing fee config:', existingPubkey.toBase58());
    return existingPubkey;
  }
  console.log('No existing fee config found: creating default config...');
  // Derive config PDA at index 0
  const index = new BN(0);
  const configPubkey = deriveConfigAddress(index);
  // Default static fee parameters (0.3% fee tier)
  const staticConfigParameters = {
    baseFeeConfig: {
      cliffFeeNumerator: 0,
      feeSchedulerMode: 0,
      numberOfPeriod: 0,
      periodFrequency: 0,
      reductionFactor: 0,
    },
    protocolFeePercent: 0,
    partnerFeePercent: 0,
    referralFeePercent: 0,
    dynamicFeeConfig: {
      initialized: 0,
      filterPeriod: 0,
      decayPeriod: 0,
      maxVolatilityAccumulator: 0,
      variableFeeControl: 0,
      binStep: 0,
      binStepU128: new BN(0),
      reductionFactor: 0,
    },
  };
  // Build the instruction to create a static config
  const createIx = await (cpAmm as any)._program.methods
    .createStaticConfig({ staticConfigParameters })
    .accounts({
      config: configPubkey,
      payer: payer.publicKey,
      poolCreatorAuthority: payer.publicKey,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .instruction();
  const tx = new Transaction().add(createIx);
  try {
    const sig = await sendAndConfirmTransaction(connection, tx, [payer], { commitment: 'finalized' });
    console.log('Created new fee config:', configPubkey.toBase58(), sig);
    return configPubkey;
  } catch (err: any) {
    console.error('Failed creating pool fee config:', err);
    throw err;
  }
}

/**
 * Converts a UI amount to the raw on-chain amount (BN) by fetching the mint's decimals.
 *
 * @param connection Solana connection.
 * @param mint PublicKey of the token mint.
 * @param amountUi Human-readable amount (e.g., 1.5).
 * @returns BN representing the raw token amount.
 * @throws Error if fetching mint data fails or mint is invalid.
 */
export async function parseTokenAmount(
  connection: Connection,
  mint: PublicKey,
  amountUi: number
): Promise<BN> {
  try {
    const mintInfo = await getMint(connection, mint);
    const decimals = mintInfo.decimals;
    // UI amount * 10^decimals = raw amount
    const multiplier = new BN(10).pow(new BN(decimals));
    return new BN(amountUi).mul(multiplier);
  } catch (err: any) {
    throw new Error(`Failed to parse token amount for mint ${mint.toBase58()}: ${err.message}`);
  }
}
/**
 * Locks all existing liquidity in a pool position and sets up the treasury as the fee-claim operator.
 *
 * @param connection Solana connection.
 * @param payer Keypair paying fees and signing instructions.
 * @param pool PublicKey of the pool to configure.
 * @param positionNftMint PublicKey of the position NFT mint for the pool's LP position.
 * @param treasury PublicKey of the treasury to receive protocol fees.
 * @returns Transaction signature of the configuration transaction.
 */
export async function configurePoolLiquidityAndFees(
  connection: Connection,
  payer: Keypair,
  pool: PublicKey,
  positionNftMint: PublicKey,
  treasury: PublicKey
): Promise<string> {
  const cpAmm = new CpAmm(connection);
  // Derive position and its token account
  const position = derivePositionAddress(positionNftMint);
  const positionNftAccount = derivePositionNftAccount(positionNftMint);
  // Fetch current position state to get unlocked liquidity
  const positionState = await cpAmm.fetchPositionState(position);
  const { unlockedLiquidity } = positionState;
  console.log('Position unlocked liquidity:', unlockedLiquidity.toString());
  // Prepare fee-claim operator PDA
  const claimFeeOperator = deriveClaimFeeOperatorAddress(treasury);
  // Build instructions
  const ixs = [];
  // 1) Create claim-fee operator to direct protocol fees to treasury
  const createOpIx = await (cpAmm as any)._program.methods
    .createClaimFeeOperator()
    .accountsPartial({
      operator: treasury,
      admin: payer.publicKey,
    })
    .instruction();
  ixs.push(createOpIx);
  // 2) Permanently lock all unlocked liquidity in the position
  const lockTx = cpAmm.permanentLockPosition({
    owner: payer.publicKey,
    position,
    positionNftAccount,
    pool,
    unlockedLiquidity,
  });
  ixs.push(...lockTx.instructions);
  // Combine and send
  const tx = new Transaction().add(...ixs);
  try {
    const sig = await sendAndConfirmTransaction(connection, tx, [payer], { commitment: 'finalized' });
    console.log('Configured pool fees and locked liquidity, tx:', sig);
    return sig;
  } catch (err: any) {
    console.error('Failed configuring pool liquidity/fees:', err);
    throw err;
  }
}