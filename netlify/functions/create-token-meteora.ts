import { Handler } from '@netlify/functions';
import { Connection, Keypair, PublicKey, SystemProgram, TransactionInstruction, VersionedTransaction, TransactionMessage, LAMPORTS_PER_SOL } from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  MINT_SIZE,
  createInitializeMintInstruction,
  createMintToInstruction,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { Buffer, Blob } from 'buffer';
// Removed CP-AMM integration; DBC will be used instead
// import { CpAmm, derivePoolAddress } from '@meteora-ag/cp-amm-sdk';
import admin from 'firebase-admin';
import { DynamicBondingCurveClient, deriveDbcPoolAddress, DYNAMIC_BONDING_CURVE_PROGRAM_ID } from '@meteora-ag/dynamic-bonding-curve-sdk';
/**
 * Derive the on-chain config PDA for DBC using sequential index.
 */
function deriveConfigAddress(index: BN): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('config'), index.toArrayLike(Buffer, 'le', 8)],
    DYNAMIC_BONDING_CURVE_PROGRAM_ID
  )[0];
}
// Metaplex Token Metadata
import { createUmi } from '@metaplex-foundation/umi';
// Removed unused web3JsRpc import; RPC is now configured via defaultPlugins
import { defaultPlugins } from '@metaplex-foundation/umi-bundle-defaults';
import { mplTokenMetadata, createMetadataAccountV3, DataV2 } from '@metaplex-foundation/mpl-token-metadata';
import BN from 'bn.js';
import dotenv from 'dotenv';
dotenv.config();
import { Redis } from '@upstash/redis';
// Initialize Redis (Upstash) for pool metadata
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});
// Optional treasury keypair (if provided) to hold all LP positions and swap fees
let TREASURY_KEYPAIR: Keypair | null = null;
let TREASURY_PUBKEY: PublicKey | null = null;
if (process.env.TREASURY_SECRET_KEY) {
  console.log('Treasury keypair found');
  TREASURY_KEYPAIR = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(process.env.TREASURY_SECRET_KEY))
  );
  TREASURY_PUBKEY = TREASURY_KEYPAIR.publicKey;
}
// Default curve parameters and deposit settings
const DEFAULT_INITIAL_PRICE = 0.00001; // SOL per token
const DEFAULT_SOL_DEPOSIT = 0.01;      // SOL to deposit into pool (~$1 at 100 SOL/USD)
//import { parseTokenAmount } from '../../src/amm';
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
}): Promise<{ name: string; symbol: string; uri: string; imageUrl: string }> {
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
    imageUrl: json.metadata.image,
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
  initialSupply?: number;   // optional, default to 1_000_000_000 (1 billion tokens)
  portalParams?: {
    initialPrice?: number;    // optional, SOL per token initial price (defaults to DEFAULT_INITIAL_PRICE)
    amount?: number;          // SOL to deposit into pool (defaults to 0.01)
    priorityFee?: number;     // SOL fee to collect
    slippage?: number;        // slippage tolerance (not currently enforced)
    poolSupply?: number;      // number of tokens to seed the pool (overrides amount/initialPrice calc)
    mint?: string;            // optional existing mint override
    pool?: string;            // optional existing pool override
  };
}

// Response type for create-token-meteora
interface CreateMeteoraTokenResponse {
  transaction1: string;
  transaction2: string;
  mint: string;
  ata: string;
  metadataUri: string;
  pool: string;
  decimals: number;
  initialSupply: number;
  initialSupplyRaw: string;
  depositSol: number;
  depositLamports: number;
  feeSol: number;
  feeLamports: number;
  isLockLiquidity: boolean;
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
  // Parse and validate request body
  if (!event.body) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing request body' }) };
  }
  let req: CreateMeteoraTokenRequest & { isLockLiquidity?: boolean };
  try {
    req = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON in request body' }) };
  }
  const { walletAddress, token, decimals = 9, initialSupply = 1000000000, isLockLiquidity = true, portalParams } = req;
  // Validate inputs
  if (!walletAddress || typeof walletAddress !== 'string') {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing or invalid walletAddress' }) };
  }
  if (!token || typeof token !== 'object') {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing or invalid token data' }) };
  }
  if (typeof decimals !== 'number' || decimals < 0 || !Number.isInteger(decimals) || decimals > 18) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid decimals; must be integer between 0 and 18' }) };
  }
  if (typeof initialSupply !== 'number' || initialSupply < 0) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid initialSupply; must be non-negative number' }) };
  }
  if (typeof isLockLiquidity !== 'boolean') {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid isLockLiquidity; must be boolean' }) };
  }
  
  try {
    // Upload token metadata to IPFS via Pump Portal
    const tokenMetadata = await createTokenMetadata(token);
    console.log('Token metadata URI:', tokenMetadata.uri);
    
  // Initialize Firebase Admin SDK (for config indexing)
  if (!admin.apps.length) {
    const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;
    if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
      console.error('Missing Firebase env vars for DBC config index');
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server misconfiguration: Firebase env vars missing' }) };
    }
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: FIREBASE_PROJECT_ID,
        clientEmail: FIREBASE_CLIENT_EMAIL,
        privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });
  }
  const firestore = admin.firestore();
  // Atomically allocate the next config index for DBC
  const counterRef = firestore.collection('counters').doc('dbcConfigIndex');
  let configIndex: number;
  try {
    configIndex = await firestore.runTransaction(async tx => {
      const doc = await tx.get(counterRef);
      let next = 1;
      if (doc.exists) {
        const data = doc.data();
        if (typeof data?.nextIndex === 'number') next = data.nextIndex;
      }
      // increment for next use
      tx.set(counterRef, { nextIndex: next + 1 }, { merge: true });
      return next;
    });
  } catch (err) {
    console.error('Error allocating DBC config index:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to allocate config index' }) };
  }
  // Derive the DBC config PDA
  const configIndexBn = new BN(configIndex);
  const configPubkey = deriveConfigAddress(configIndexBn);
  console.log('Derived DBC config address:', configPubkey.toBase58());
  
  // Prepare Solana connection and keys
    const RPC_ENDPOINT = process.env.SOLANA_RPC_URL || 'https://mainnet.helius-rpc.com/?api-key=5e4edb76-36ed-4740-942d-7843adcc1e22';
    if (!RPC_ENDPOINT) {
      console.error('Missing RPC_ENDPOINT');
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server misconfiguration: RPC_ENDPOINT' }) };
    }
    const connection = new Connection(RPC_ENDPOINT);
    let userPubkey: PublicKey;
    try {
      userPubkey = new PublicKey(walletAddress);
    } catch (err) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid walletAddress' }) };
    }
    
    // Generate new mint keypair
    const mintKeypair = Keypair.generate();
    const mintPubkey = mintKeypair.publicKey;
    // Derive user's ATA for new mint
    const ata = getAssociatedTokenAddressSync(mintPubkey, userPubkey, true, TOKEN_PROGRAM_ID);
    // Compute rent exemption for mint
    const rentLamports = await connection.getMinimumBalanceForRentExemption(MINT_SIZE);
    
    // Calculate raw initial supply in smallest units: amountUi * 10^decimals
    const multiplier = new BN(10).pow(new BN(decimals));
    const initialSupplyRaw = new BN(initialSupply).mul(multiplier);
    // Determine pool supply based on desired initial price (SOL per token)
    // Determine initial AMM pricing and deposit amount
    const initialPrice = portalParams?.initialPrice ?? DEFAULT_INITIAL_PRICE;
    // Ensure minimum deposit for pool to guard against micro-farming
    const solDepositUi = (portalParams?.amount != null && portalParams.amount >= DEFAULT_SOL_DEPOSIT)
      ? portalParams.amount
      : DEFAULT_SOL_DEPOSIT;
    // Compute how many tokens to seed the pool
    const poolSupplyUnits = portalParams?.poolSupply != null
      ? portalParams.poolSupply
      : Math.floor(solDepositUi / initialPrice);
    const poolSupplyRaw = new BN(poolSupplyUnits).mul(multiplier);
    console.log('RPC_ENDPOINT', RPC_ENDPOINT);
    // Build separate instruction sets: mint+metadata and pool+deposit
    const instructionsMint: TransactionInstruction[] = [];
    const instructionsPool: TransactionInstruction[] = [];
    // 0) Create on-chain metadata account for the new mint (metadata instructions for second TX)
    {
      // Initialize Umi context for metadata instruction using RPC endpoint
      // Plugins must be loaded in correct order: defaults, RPC, metadata
      // Initialize Umi context with default plugins and Token Metadata plugin
      // Pass the existing Solana connection to defaultPlugins for RPC setup
      const umi = createUmi()
        .use(defaultPlugins(connection))
        .use(mplTokenMetadata());
      // Prepare metadata data
      const metadataData: DataV2 = {
        name: token.name.substring(0, 32),
        symbol: token.ticker.substring(0, 10),
        uri: tokenMetadata.uri,
        sellerFeeBasisPoints: 0,
        creators: null,
        collection: null,
        uses: null,
      };
      // Build metadata account instruction via UMI and convert to web3.js instructions
      const metadataBuilder = createMetadataAccountV3(umi, {
        mint: mintPubkey,
        mintAuthority: userPubkey,
        payer: userPubkey,
        updateAuthority: userPubkey,
        data: metadataData,
        isMutable: true,
        // Explicitly set collectionDetails to null (Option.none)
        collectionDetails: null,
      });
      // Convert UMI instructions to Solana Web3.js TransactionInstruction
      const umiIxs = metadataBuilder.getInstructions();
      const web3Ixs = umiIxs.map((ix) => {
        // Normalize pubkey to string if it's a PDA tuple
        const keys = ix.keys.map(({ pubkey, isSigner, isWritable }) => {
          const addr = Array.isArray(pubkey) ? pubkey[0] : pubkey;
          return {
            pubkey: typeof addr === 'string' ? new PublicKey(addr) : addr,
            isSigner,
            isWritable,
          };
        });
        // programId may also be PDA tuple or string
        const pidAddr = Array.isArray(ix.programId) ? ix.programId[0] : ix.programId;
        const programIdKey = typeof pidAddr === 'string' ? new PublicKey(pidAddr) : pidAddr;
        return new TransactionInstruction({
          keys,
          programId: programIdKey,
          data: ix.data,
        });
      });
      // Add metadata creation instructions into the pool transaction (tx2)
      instructionsPool.push(...web3Ixs);
    }
    // 1) Create mint account
    instructionsMint.push(
      SystemProgram.createAccount({
        fromPubkey: userPubkey,
        newAccountPubkey: mintPubkey,
        lamports: rentLamports,
        space: MINT_SIZE,
        programId: TOKEN_PROGRAM_ID,
      })
    );
    // 2) Initialize mint (decimals, mintAuthority = user) 
    instructionsMint.push(
      createInitializeMintInstruction(
        mintPubkey,
        decimals,
        userPubkey,
        null,
        TOKEN_PROGRAM_ID
      )
    );
    // 3) Create user's associated token account (idempotent)
    instructionsMint.push(
      createAssociatedTokenAccountIdempotentInstruction(
        userPubkey,
        ata,
        userPubkey,
        mintPubkey,
        TOKEN_PROGRAM_ID
      )
    );
    // 4) Mint total tokens to user's ATA (initial supply + pool supply)
    if (initialSupply >= 0) {
      const totalMintRaw = initialSupplyRaw.add(poolSupplyRaw);
      instructionsMint.push(
        createMintToInstruction(
          mintPubkey,
          ata,
          userPubkey,
          BigInt(totalMintRaw.toString()),
          [],
          TOKEN_PROGRAM_ID
        )
      );
    }
    
    // Pre-calc fee and deposit values for DBC
    const feeUi = portalParams?.priorityFee ?? 0;
    const depositLamports = Math.round(solDepositUi * LAMPORTS_PER_SOL);
    // 5) Create DBC config, pool, and initial buy via Meteora DBC SDK
    // Instantiate the DBC client
    const dbcClient = new DynamicBondingCurveClient(connection, 'confirmed');
    // Merge default curve parameters (based on pump.fun) with any user overrides
    const defaultCurveConfig = {
      // Quote mint is SOL
      quoteMint: NATIVE_MINT.toBase58(),
      // Fees in BPS: 0.30% base, 0.10% dynamic
      poolFees: { baseFee: 30, dynamicFee: 10 },
      // Collect only quote fees
      collectFeeMode: 0,
      // Activate immediately via timestamp
      activationType: 1,
      activationValue: Math.floor(Date.now() / 1000),
      // Migrate only after large volume (threshold = 100x initial deposit)
      migrationQuoteThreshold: depositLamports * 100,
      migrationOption: 0,
      // LP splits: 5% to platform, 95% to creator
      partnerLpPercentage: 5,
      partnerLockedLpPercentage: 0,
      creatorLpPercentage: 95,
      creatorLockedLpPercentage: 0,
      // Migration fee: 1.00% fixed
      migrationFeeOption: 2,
      // Standard SPL token, 9 decimals
      tokenType: 0,
      tokenDecimal: decimals,
      // Start sqrt price = sqrt(initialPrice)
      sqrtStartPrice: Math.sqrt(initialPrice),
      // Fee claimer and leftover go to creator by default (overridden below)
      feeClaimer: (TREASURY_PUBKEY ?? userPubkey).toBase58(),
      leftoverReceiver: userPubkey.toBase58(),
    };
    const curveConfigOverrides = portalParams?.curveConfig ?? {};
    const curveConfig = { ...defaultCurveConfig, ...curveConfigOverrides };
    // Build DBC transactions: create config, pool, and initial buy
    const { createConfigTx, createPoolTx, swapBuyTx } = await dbcClient.createConfigAndPoolWithFirstBuy({
      config: configPubkey.toBase58(),
      feeClaimer: (TREASURY_PUBKEY ?? userPubkey).toBase58(),
      leftoverReceiver: userPubkey.toBase58(),
      quoteMint: NATIVE_MINT.toBase58(),
      payer: userPubkey.toBase58(),
      ...curveConfig,
      createPoolParam: {
        baseMint: mintPubkey.toBase58(),
        poolCreator: (TREASURY_PUBKEY ?? userPubkey).toBase58(),
        name: token.name,
        symbol: token.ticker,
        uri: tokenMetadata.uri,
      },
      buyAmount: new BN(depositLamports),
      minimumAmountOut: new BN(0),
    });
    // Append DBC instructions
    instructionsPool.push(...createConfigTx.instructions);
    instructionsPool.push(...createPoolTx.instructions);
    instructionsPool.push(...swapBuyTx.instructions);
    // Derive DBC pool PDA and store mapping
    const poolAddress = deriveDbcPoolAddress(
      NATIVE_MINT,
      mintPubkey,
      configPubkey
    );
    console.log('Derived DBC pool address:', poolAddress.toBase58());
    const poolKey = `dbcPool:${poolAddress.toBase58()}`;
    await redis.hset(poolKey, 'deployer', walletAddress);
    await redis.hset(poolKey, 'mint', mintPubkey.toBase58());
    
    // Compile first transaction: mint creation & metadata
    const { blockhash: blockhash1 } = await connection.getLatestBlockhash();
    const message1 = new TransactionMessage({
      payerKey: userPubkey,
      recentBlockhash: blockhash1,
      instructions: instructionsMint,
    }).compileToV0Message();
    const tx1 = new VersionedTransaction(message1);
    // Partially sign tx1 with mint keypair
    tx1.sign([mintKeypair]);
    const serialized1 = Buffer.from(tx1.serialize()).toString('base64');

    // Compile second transaction: pool creation & deposit
    const { blockhash: blockhash2 } = await connection.getLatestBlockhash();
    const message2 = new TransactionMessage({
      payerKey: userPubkey,
      recentBlockhash: blockhash2,
      instructions: instructionsPool,
    }).compileToV0Message();
    const tx2 = new VersionedTransaction(message2);
    // No server-side signing needed for DBC pool transaction; user will sign client-side
    // tx2.sign([]);
    const serialized2 = Buffer.from(tx2.serialize()).toString('base64');
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        transaction1: serialized1,
        transaction2: serialized2,
        mint: mintPubkey.toBase58(),
        ata: ata.toBase58(),
        metadataUri: tokenMetadata.uri,
        tokenMetadata,
        pool: poolAddress.toBase58(),
        decimals,
        initialSupply,
        initialSupplyRaw: initialSupplyRaw.toString(),
        depositSol: solDepositUi,
        depositLamports: depositLamports,
        feeSol: feeUi,
        feeLamports: feeLamports,
        isLockLiquidity,
      }),
    };
  } catch (err: any) {
    console.error('Unexpected error in create-token-meteora:', err);
    // Provide detailed error message and stack in response for debugging
    const errorMessage = err instanceof Error
      ? (err.stack || err.message)
      : JSON.stringify(err, null, 2);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: errorMessage }),
    };
  }
};
