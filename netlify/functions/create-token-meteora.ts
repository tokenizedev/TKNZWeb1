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
import BN from 'bn.js';
// Removed CP-AMM integration; DBC will be used instead
// import { CpAmm, derivePoolAddress } from '@meteora-ag/cp-amm-sdk';
import admin from 'firebase-admin';
import { DynamicBondingCurveClient, deriveDbcPoolAddress, DYNAMIC_BONDING_CURVE_PROGRAM_ID, getSqrtPriceFromPrice, bpsToFeeNumerator, FeeSchedulerMode } from '@meteora-ag/dynamic-bonding-curve-sdk';
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
    // Allow overriding via SOLANA_RPC_URL or RPC_ENDPOINT env vars
    const RPC_ENDPOINT = process.env.SOLANA_RPC_URL || process.env.RPC_ENDPOINT || 'https://mainnet.helius-rpc.com/?api-key=5e4edb76-36ed-4740-942d-7843adcc1e22';
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
    let metadataIxs: TransactionInstruction[] = [];
    {
      const umi = createUmi()
        .use(defaultPlugins(connection))
        .use(mplTokenMetadata());
      const metadataData: DataV2 = {
        name: token.name.substring(0, 32),
        symbol: token.ticker.substring(0, 10),
        uri: tokenMetadata.uri,
        sellerFeeBasisPoints: 0,
        creators: null,
        collection: null,
        uses: null,
      };
      const metadataBuilder = createMetadataAccountV3(umi, {
        mint: mintPubkey,
        mintAuthority: userPubkey,
        payer: userPubkey,
        updateAuthority: userPubkey,
        data: metadataData,
        isMutable: true,
        collectionDetails: null,
      });
      const umiIxs = metadataBuilder.getInstructions();
      metadataIxs = umiIxs.map((ix) => {
        const keys = ix.keys.map(({ pubkey, isSigner, isWritable }) => {
          const addr = Array.isArray(pubkey) ? pubkey[0] : pubkey;
          return {
            pubkey: typeof addr === 'string' ? new PublicKey(addr) : addr,
            isSigner,
            isWritable,
          };
        });
        const pidAddr = Array.isArray(ix.programId) ? ix.programId[0] : ix.programId;
        const programIdKey = typeof pidAddr === 'string' ? new PublicKey(pidAddr) : pidAddr;
        return new TransactionInstruction({
          keys,
          programId: programIdKey,
          data: ix.data,
        });
      });
      instructionsPool.push(...metadataIxs);
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
    const feeLamports = Math.round(feeUi * LAMPORTS_PER_SOL);
    const depositLamports = Math.round(solDepositUi * LAMPORTS_PER_SOL);
    // 5) Create DBC config, pool, and initial buy via Meteora DBC SDK
    // Instantiate the DBC client
    const dbcClient = new DynamicBondingCurveClient(connection, 'confirmed');
    // Merge default curve parameters (based on pump.fun) with any user overrides
    const defaultCurveConfig = {
      // Quote mint is SOL
      quoteMint: NATIVE_MINT.toBase58(),
      // Fees in BPS: 0.30% base, 0.10% dynamic
      poolFees: {
        baseFee: {
          cliffFeeNumerator: bpsToFeeNumerator(30),
          numberOfPeriod: 1,
          periodFrequency: new BN(0),
          reductionFactor: new BN(0),
          feeSchedulerMode: FeeSchedulerMode.Constant
        },
        dynamicFee: 10
      },
      // Token update authority: 0 = Mutable, 1 = Immutable
      tokenUpdateAuthority: 0,
      // Collect only quote fees
      collectFeeMode: 0,
      // Activate immediately via timestamp
      activationType: 1,
      activationValue: Math.floor(Date.now() / 1000),
      // Migrate only after large volume (threshold = 100x initial deposit)
      migrationQuoteThreshold: new BN(depositLamports).mul(new BN(100)),
      migrationOption: 0,
      // LP splits: 5% to platform, 95% to creator
      partnerLpPercentage: 5,
      partnerLockedLpPercentage: 0,
      creatorLpPercentage: 95,
      creatorLockedLpPercentage: 0,
      // Migration fee option: 1.00% fixed
      migrationFeeOption: 2,
      // Migration fee parameters matching option (percentage, e.g., 1 for 1%)
      migrationFee: { feePercentage: 1, creatorFeePercentage: 0 },
      // Standard SPL token, 9 decimals
      tokenType: 0,
      tokenDecimal: decimals,
      // Start sqrt price = as Q64 fixed-point BN
      sqrtStartPrice: getSqrtPriceFromPrice(
        initialPrice.toString(),
        decimals,
        9 // SOL decimals
      ),
      // Fee claimer and leftover go to creator by default (overridden below)
      feeClaimer: (TREASURY_PUBKEY ?? userPubkey).toBase58(),
      leftoverReceiver: userPubkey.toBase58(),
      // Default locked vesting: no vesting (fields required by SDK)
      lockedVesting: {
        amountPerPeriod: new BN(0),
        cliffDurationFromMigrationTime: new BN(0),
        frequency: new BN(0),
        numberOfPeriod: new BN(0),
        cliffUnlockAmount: new BN(0),
      },
    };
    // Merge default curve parameters with any user overrides
    const curveConfigOverrides = portalParams?.curveConfig ?? {};
    const mergedCurveConfig: any = { ...defaultCurveConfig, ...curveConfigOverrides };
    // Inject a default curve segment if none provided: a single point just above start price with initial liquidity
    if (!mergedCurveConfig.curve || !Array.isArray(mergedCurveConfig.curve) || mergedCurveConfig.curve.length === 0) {
      const eps = new BN(1);
      mergedCurveConfig.curve = [
        {
          sqrtPrice: mergedCurveConfig.sqrtStartPrice.add(eps),
          liquidity: poolSupplyRaw,
        },
      ];
    }
    console.log('DBC defaultCurveConfig:', JSON.stringify(defaultCurveConfig, null, 2));
    console.log('DBC overrides:', JSON.stringify(curveConfigOverrides, null, 2));
    console.log('Merged DBC configParam:', JSON.stringify(mergedCurveConfig, null, 2));
    // Create config, pool, and initial buy in one step
    const { createConfigTx, createPoolTx, swapBuyTx } = await dbcClient.pool.createConfigAndPoolWithFirstBuy({
      config: configPubkey.toBase58(),
      feeClaimer: (TREASURY_PUBKEY ?? userPubkey).toBase58(),
      leftoverReceiver: userPubkey.toBase58(),
      quoteMint: NATIVE_MINT.toBase58(),
      payer: userPubkey.toBase58(),
      // Spread merged curve config (includes generated 'curve' and lockedVesting)
      ...mergedCurveConfig,
      // Explicitly set tokenUpdateAuthority
      tokenUpdateAuthority: mergedCurveConfig.tokenUpdateAuthority,
      // Parameters for creating the pool
      createPoolParam: {
        baseMint: mintPubkey,
        poolCreator: TREASURY_PUBKEY ?? userPubkey,
        name: token.name,
        symbol: token.ticker,
        uri: tokenMetadata.uri,
      },
      // Parameters for initial buy
      swapBuyParam: {
        buyAmount: new BN(depositLamports),
        minimumAmountOut: new BN(0),
        referralTokenAccount: null,
      },
    });
    // Append DBC instructions
    // Collect DBC instructions into two groups: config steps (metadata + config) and trade steps (pool + swap)
    // Config instructions (exclude metadata, which is in a separate TX)
    const configIxs: TransactionInstruction[] = [...createConfigTx.instructions];
    const tradeIxs: TransactionInstruction[] = [
      ...createPoolTx.instructions,
      ...swapBuyTx.instructions,
    ];
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
    
    // 1) Serialize mint transaction (with mint keypair partial signature)
    const { blockhash: mintBh } = await connection.getLatestBlockhash();
    const mintMsg = new TransactionMessage({ payerKey: userPubkey, recentBlockhash: mintBh, instructions: instructionsMint }).compileToV0Message();
    const mintTx = new VersionedTransaction(mintMsg);
    mintTx.sign([mintKeypair]);
    const serializedMint = Buffer.from(mintTx.serialize()).toString('base64');
    
    // 2) Serialize config transaction (metadata + config instructions)
    const { blockhash: cfgBh } = await connection.getLatestBlockhash();
    const cfgMsg = new TransactionMessage({ payerKey: userPubkey, recentBlockhash: cfgBh, instructions: configIxs }).compileToV0Message();
    const cfgTx = new VersionedTransaction(cfgMsg);
    const serializedConfig = Buffer.from(cfgTx.serialize()).toString('base64');
    
    // 3) Dynamic chunk splitting for trade instructions (pool + swap)
    const MAX_TX_BYTES = 1232;
    const tradeChunks: string[] = [];
    let chunkIxs: TransactionInstruction[] = [];
    for (const ix of tradeIxs) {
      chunkIxs.push(ix);
      const { blockhash: tradeBh } = await connection.getLatestBlockhash();
      const msg = new TransactionMessage({ payerKey: userPubkey, recentBlockhash: tradeBh, instructions: chunkIxs }).compileToV0Message();
      const tx = new VersionedTransaction(msg);
      if (Buffer.from(tx.serialize()).length > MAX_TX_BYTES) {
        chunkIxs.pop();
        const msgPrev = new TransactionMessage({ payerKey: userPubkey, recentBlockhash: tradeBh, instructions: chunkIxs }).compileToV0Message();
        const txPrev = new VersionedTransaction(msgPrev);
        tradeChunks.push(Buffer.from(txPrev.serialize()).toString('base64'));
        chunkIxs = [ix];
      }
    }
    if (chunkIxs.length) {
      const { blockhash: lastBh } = await connection.getLatestBlockhash();
      const msgLast = new TransactionMessage({ payerKey: userPubkey, recentBlockhash: lastBh, instructions: chunkIxs }).compileToV0Message();
      const txLast = new VersionedTransaction(msgLast);
      tradeChunks.push(Buffer.from(txLast.serialize()).toString('base64'));
    }
    // Return all serialized transactions: mint, config, then trade chunks
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        transactions: [serializedMint, serializedConfig, ...tradeChunks],
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
