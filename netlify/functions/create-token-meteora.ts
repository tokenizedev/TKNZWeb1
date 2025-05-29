import { Handler } from '@netlify/functions';
import { Connection, Keypair, PublicKey, SystemProgram, VersionedTransaction, TransactionMessage } from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  MINT_SIZE,
  createInitializeMintInstruction,
  createMintToInstruction,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { Buffer, Blob } from 'buffer';
import { CpAmm } from '@meteora-ag/cp-amm-sdk';
import BN from 'bn.js';
import { NATIVE_MINT } from '@solana/spl-token';

// Helper to upload token metadata (name, symbol, description, image, etc.) to IPFS via Pump Portal
async function createTokenMetadata(token: {
  name: string;
  ticker: string;
  imageUrl: string;
  description: string;
  websiteUrl?: string;
  twitter?: string;
  telegram?: string;
}): Promise<{ name: string; symbol: string; uri: string }> {
  const { name, ticker, description, imageUrl, websiteUrl, twitter, telegram } = token;
  if (!imageUrl) {
    throw new Error('No image provided for token creation');
  }
  const formData = new FormData();
  let fileBlob: Blob;
  if (imageUrl.startsWith('data:')) {
    const [meta, base64] = imageUrl.split(',');
    const contentType = meta.split(':')[1].split(';')[0];
    const buf = Buffer.from(base64, 'base64');
    fileBlob = new Blob([buf], { type: contentType });
  } else {
    const res = await fetch(imageUrl);
    fileBlob = await res.blob();
  }
  formData.append('file', fileBlob);
  formData.append('name', name);
  formData.append('symbol', ticker);
  formData.append('description', description);
  if (websiteUrl) formData.append('website', websiteUrl);
  if (twitter) formData.append('twitter', twitter);
  if (telegram) formData.append('telegram', telegram);
  formData.append('showName', 'true');
  const resp = await fetch('https://pump.fun/api/ipfs', { method: 'POST', body: formData });
  if (!resp.ok) {
    throw new Error(`Failed to upload metadata: ${resp.statusText}`);
  }
  const json = await resp.json();
  return {
    name: json.metadata.name,
    symbol: json.metadata.symbol,
    uri: json.metadataUri,
  };
}

// Request interface for Meteora token creation
interface CreateMeteoraTokenRequest {
  walletAddress: string;
  token: {
    name: string;
    ticker: string;
    imageUrl: string;
    description: string;
    websiteUrl?: string;
    twitter?: string;
    telegram?: string;
  };
  decimals?: number;        // optional, default to 9
  initialSupply?: number;   // optional, default to 0
}

// Response for stub implementation
interface CreateMeteoraTokenResponse {
  error?: string;
}

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
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  if (!event.body) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing request body' }) };
  }
  let req: CreateMeteoraTokenRequest;
  try {
    req = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON in request body' }) };
  }
  const { walletAddress, token, decimals = 9, initialSupply = 0 } = req;
  if (!walletAddress || typeof walletAddress !== 'string') {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing or invalid walletAddress' }) };
  }
  if (!token || typeof token !== 'object') {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing or invalid token data' }) };
  }
  let tokenMetadata;
  try {
    tokenMetadata = await createTokenMetadata(token);
  } catch (err) {
    console.error('Error creating token metadata:', err);
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Error uploading token metadata' }) };
  }
  console.log('Token metadata URI:', tokenMetadata.uri);
  // Build and return a partially signed transaction to create a new SPL token mint
  const RPC_ENDPOINT = process.env.RPC_ENDPOINT;
  if (!RPC_ENDPOINT) {
    console.error('Missing RPC_ENDPOINT');
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server misconfiguration: RPC_ENDPOINT' }) };
  }
  // Initialize connection and keys
  let userPubkey: PublicKey;
  try {
    userPubkey = new PublicKey(walletAddress);
  } catch (err) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid walletAddress' }) };
  }
  const connection = new Connection(RPC_ENDPOINT);
  // Generate new mint account
  const mintKeypair = Keypair.generate();
  const mintPubkey = mintKeypair.publicKey;
  // Derive user's ATA for this mint
  const ata = getAssociatedTokenAddressSync(mintPubkey, userPubkey, true, TOKEN_PROGRAM_ID);
  // Compute rent exemption for mint account
  const rentLamports = await connection.getMinimumBalanceForRentExemption(MINT_SIZE);
  // Build instructions
  const instructions = [];
  // 1) Create mint account
  instructions.push(
    SystemProgram.createAccount({
      fromPubkey: userPubkey,
      newAccountPubkey: mintPubkey,
      lamports: rentLamports,
      space: MINT_SIZE,
      programId: TOKEN_PROGRAM_ID,
    })
  );
  // 2) Initialize mint (decimals, mintAuthority = user, no freeze authority)
  instructions.push(
    createInitializeMintInstruction(
      mintPubkey,
      decimals,
      userPubkey,
      null,
      TOKEN_PROGRAM_ID
    )
  );
  // 3) Create user's associated token account (idempotent)
  instructions.push(
    createAssociatedTokenAccountIdempotentInstruction(
      userPubkey,
      ata,
      userPubkey,
      mintPubkey,
      TOKEN_PROGRAM_ID
    )
  );
  // 4) Mint initial supply to user's ATA
  if (initialSupply > 0) {
    instructions.push(
      createMintToInstruction(
        mintPubkey,
        ata,
        userPubkey,
        BigInt(initialSupply),
        [],
        TOKEN_PROGRAM_ID
      )
    );
  }
  // 5) Initialize pool via CP-AMM
  const CP_AMM_CONFIG = process.env.CP_AMM_STATIC_CONFIG;
  if (!CP_AMM_CONFIG) {
    console.error('Missing CP_AMM_STATIC_CONFIG');
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server misconfiguration: CP_AMM_STATIC_CONFIG' }) };
  }
  const configPubkey = new PublicKey(CP_AMM_CONFIG);
  const cpAmm = new CpAmm(connection);
  const positionNftKeypair = Keypair.generate();
  const tokenAAmountBN = new BN(initialSupply);
  const tokenBAmountBN = new BN(0);
  const { initSqrtPrice, liquidityDelta } = cpAmm.preparePoolCreationParams({
    tokenAAmount: tokenAAmountBN,
    tokenBAmount: tokenBAmountBN,
    minSqrtPrice: new BN(0),
    maxSqrtPrice: new BN('340282366920938463463374607431768211455'), // max u128
  });
  const poolTx = await cpAmm.createPool({
    payer: userPubkey,
    creator: userPubkey,
    config: configPubkey,
    positionNft: positionNftKeypair.publicKey,
    tokenAMint: mintPubkey,
    tokenBMint: NATIVE_MINT,
    initSqrtPrice,
    liquidityDelta,
    tokenAAmount: tokenAAmountBN,
    tokenBAmount: tokenBAmountBN,
    activationPoint: null,
    tokenAProgram: TOKEN_PROGRAM_ID,
    tokenBProgram: TOKEN_PROGRAM_ID,
    isLockLiquidity: false,
  });
  instructions.push(...poolTx.instructions);
  // Fetch recent blockhash for versioned transaction
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  const message = new TransactionMessage({
    payerKey: userPubkey,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message();
  const tx = new VersionedTransaction(message);
  // Partially sign for the mint account and position NFT mint
  tx.sign([mintKeypair, positionNftKeypair]);
  // Serialize to base64 for client to finish signing and submit
  const serialized = Buffer.from(tx.serialize()).toString('base64');
  // Respond with transaction and metadata
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      transaction: serialized,
      mint: mintPubkey.toBase58(),
      ata: ata.toBase58(),
      metadataUri: tokenMetadata.uri,
      decimals,
      initialSupply,
    }),
  };
};