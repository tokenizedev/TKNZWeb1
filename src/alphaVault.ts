import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { AlphaVaultSDK } from '@meteora-ag/alpha-vault-sdk';

/**
 * Parameters for initializing an Alpha Vault.
 */
export interface InitializeAlphaVaultParams {
  connection: Connection;
  payer: Keypair;
  pool: PublicKey;
  delaySeconds: number;
  maxTxSize: number;
}

/**
 * Creates and initializes an Alpha Vault to protect a new pool from front-run bots.
 *
 * @param params Initialization parameters
 * @returns PublicKey of the newly created vault
 */
export async function initializeAlphaVault(
  params: InitializeAlphaVaultParams
): Promise<PublicKey> {
  const { connection, payer, pool, delaySeconds, maxTxSize } = params;
  try {
    console.log('Initializing Alpha Vault for pool:', pool.toBase58());
    const sdk = new AlphaVaultSDK(connection);
    console.log('Building createVault instruction...');
    const vaultIx = await sdk.createVaultInstruction({
      payer: payer.publicKey,
      pool,
      delaySeconds,
      maxTxSize,
    });
    console.log('Compiling transaction...');
    const tx = new Transaction().add(vaultIx);
    tx.feePayer = payer.publicKey;
    const { blockhash } = await connection.getLatestBlockhash('finalized');
    tx.recentBlockhash = blockhash;
    console.log('Signing and sending transaction...');
    const sig = await sendAndConfirmTransaction(
      connection,
      tx,
      [payer],
      { commitment: 'finalized' }
    );
    console.log('Alpha Vault created, tx:', sig);
    // Derive vault PDA from SDK if available
    const vaultKey = await sdk.deriveVaultPubkey({ pool, authority: payer.publicKey });
    console.log('Derived vault address:', vaultKey.toBase58());
    return vaultKey;
  } catch (err: any) {
    console.error('Failed initializing Alpha Vault:', err);
    throw err;
  }
}