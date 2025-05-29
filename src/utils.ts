import { Connection, PublicKey, Keypair, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  getAccount,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';

/**
 * Ensure associated token accounts exist for the given owner and mints.
 * If any are missing, creates them in a single transaction.
 *
 * @param connection Solana connection
 * @param payer Keypair paying for account creation
 * @param owner PublicKey of the wallet to own the associated accounts
 * @param mints Array of token mint PublicKeys
 * @returns Array of PublicKeys of accounts that were created (empty if none)
 */
export async function ensureAtasForUser(
  connection: Connection,
  payer: Keypair,
  owner: PublicKey,
  mints: PublicKey[]
): Promise<PublicKey[]> {
  const created: PublicKey[] = [];
  const tx = new Transaction();
  for (const mint of mints) {
    const ata = await getAssociatedTokenAddress(mint, owner, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
    try {
      await getAccount(connection, ata);
      // account exists
    } catch (err) {
      // Account does not exist; create it
      tx.add(
        createAssociatedTokenAccountInstruction(
          payer.publicKey,
          ata,
          owner,
          mint,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        )
      );
      created.push(ata);
    }
  }
  if (tx.instructions.length === 0) {
    console.log(`All ATAs exist for owner ${owner.toBase58()}`);
    return [];
  }
  // Send and confirm transaction
  try {
    const sig = await sendAndConfirmTransaction(connection, tx, [payer], { commitment: 'finalized' });
    console.log(`Created ${created.length} ATA(s):`, created.map((a) => a.toBase58()), `tx: ${sig}`);
    return created;
  } catch (err: any) {
    console.error('Failed creating ATAs:', err);
    throw err;
  }
}