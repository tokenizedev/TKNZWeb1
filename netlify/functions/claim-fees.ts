import { Handler } from '@netlify/functions';
import { Redis } from '@upstash/redis';
import dotenv from 'dotenv';
import { Connection, Keypair, PublicKey, SystemProgram, VersionedTransaction, TransactionMessage, LAMPORTS_PER_SOL } from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferInstruction,
} from '@solana/spl-token';
import { CpAmm, derivePoolAuthority, derivePositionAddress, derivePositionNftAccount, deriveTokenVaultAddress } from '@meteora-ag/cp-amm-sdk';
import bs58 from 'bs58';
import nacl from 'tweetnacl';

dotenv.config();

// Initialize Redis (Upstash)
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// Load Treasury keypair for fee custody
if (!process.env.TREASURY_SECRET_KEY) {
  throw new Error('Missing TREASURY_SECRET_KEY env var');
}
const TREASURY_KEYPAIR = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(process.env.TREASURY_SECRET_KEY))
);
const TREASURY_PUBKEY = TREASURY_KEYPAIR.publicKey;

// RPC connection
const RPC_ENDPOINT = process.env.SOLANA_RPC_URL!;

export const handler: Handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }
  if (!event.body) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing request body' }) };
  }
  let req: { pool: string; signature: string };
  try {
    req = JSON.parse(event.body);
  } catch (err) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }
  const { pool, signature } = req;
  if (typeof pool !== 'string' || typeof signature !== 'string') {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid parameters' }) };
  }
  // Lookup deployer and mint from Redis
  const poolKey = `pool:${pool}`;
  const deployer = await redis.hget(poolKey, 'deployer');
  const mintStr  = await redis.hget(poolKey, 'mint');
  if (!deployer || !mintStr) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unknown pool' }) };
  }
  // Verify signature: must be signing message 'ClaimFees:<pool>'
  try {
    const message = Buffer.from(`ClaimFees:${pool}`);
    const sigBytes = bs58.decode(signature);
    const deployerPubkey = new PublicKey(deployer);
    const pubkeyBytes = deployerPubkey.toBuffer();
    const ok = nacl.sign.detached.verify(
      message,
      sigBytes,
      pubkeyBytes
    );
    if (!ok) throw new Error('Signature verification failed');
  } catch (err: any) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid signature' }) };
  }
  // On-chain fee claim
  try {
    const connection = new Connection(RPC_ENDPOINT, 'confirmed');
    const cpAmm = new CpAmm(connection);
    const poolPubkey = new PublicKey(pool);
    const tokenMint = new PublicKey(mintStr);
    // Derive vault and position addresses
    const poolAuthority = derivePoolAuthority();
    const positionNftMint = TREASURY_PUBKEY;
    const position = derivePositionAddress(poolPubkey, positionNftMint);
    const positionNftAccount = derivePositionNftAccount(positionNftMint);
    const tokenAVault = deriveTokenVaultAddress(tokenMint, poolPubkey);
    const tokenBVault = deriveTokenVaultAddress(NATIVE_MINT, poolPubkey);
    // Associated token accounts for fees
    const treasuryTokenA = getAssociatedTokenAddressSync(tokenMint, TREASURY_PUBKEY, true);
    const treasuryWSOL   = getAssociatedTokenAddressSync(NATIVE_MINT, TREASURY_PUBKEY, true);
    const deployerPubkey = new PublicKey(deployer);
    const deployerTokenA = getAssociatedTokenAddressSync(tokenMint, deployerPubkey, true);
    // Fetch current fee balances (UI amounts)
    const [balA, balB] = await Promise.all([
      connection.getTokenAccountBalance(tokenAVault),
      connection.getTokenAccountBalance(tokenBVault),
    ]);
    const feeA = balA.value.amount; // string of raw units
    const feeB = balB.value.amount; // lamports as string
    // Compute half splits
    const halfA = BigInt(feeA) / 2n;
    const halfBLamports = Math.floor((Number(feeB) / 1e9) * LAMPORTS_PER_SOL / 2);
    // Build instructions
    const instructions = [];
    // 1) Claim all fees to treasury
    instructions.push(
      await cpAmm.buildClaimPositionFeeInstruction({
        owner: TREASURY_PUBKEY,
        poolAuthority,
        pool: poolPubkey,
        position,
        positionNftAccount,
        tokenAAccount: treasuryTokenA,
        tokenBAccount: treasuryWSOL,
        tokenAVault,
        tokenBVault,
        tokenAMint: tokenMint,
        tokenBMint: NATIVE_MINT,
        tokenAProgram: TOKEN_PROGRAM_ID,
        tokenBProgram: TOKEN_PROGRAM_ID,
      })
    );
    // 2) Setup deployer ATA and transfer half A
    instructions.push(
      createAssociatedTokenAccountIdempotentInstruction(
        TREASURY_PUBKEY,
        deployerTokenA,
        deployerPubkey,
        tokenMint,
        TOKEN_PROGRAM_ID
      )
    );
    instructions.push(
      createTransferInstruction(
        treasuryTokenA,
        deployerTokenA,
        TREASURY_PUBKEY,
        halfA,
        [],
        TOKEN_PROGRAM_ID
      )
    );
    // 3) Transfer half SOL to deployer
    instructions.push(
      SystemProgram.transfer({
        fromPubkey: TREASURY_PUBKEY,
        toPubkey: deployerPubkey,
        lamports: halfBLamports,
      })
    );
    // Compile and send
    const { blockhash } = await connection.getLatestBlockhash();
    const messageV0 = new TransactionMessage({
      payerKey: TREASURY_PUBKEY,
      recentBlockhash: blockhash,
      instructions,
    }).compileToV0Message();
    const tx = new VersionedTransaction(messageV0);
    tx.sign([TREASURY_KEYPAIR]);
    const raw = tx.serialize();
    const sig = await connection.sendRawTransaction(raw);
    await connection.confirmTransaction(sig, 'confirmed');
    return { statusCode: 200, headers, body: JSON.stringify({ signature: sig }) };
  } catch (err: any) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message || err.toString() }) };
  }
};