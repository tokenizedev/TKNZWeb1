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
import { DynamicBondingCurveClient, deriveDbcPoolAddress, getSqrtPriceFromPrice, bpsToFeeNumerator, FeeSchedulerMode, MAX_SQRT_PRICE } from '@meteora-ag/dynamic-bonding-curve-sdk';
// Off-chain metadata upload only; on-chain metadata is created by the DBC program CPI
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
  // Generate a new config keypair for DBC
  // The config account will be created and signed by this keypair
  const configKeypair = Keypair.generate();
  const configPubkey = configKeypair.publicKey;
  console.log('Generated DBC config keypair with address:', configPubkey.toBase58());
  
    // Prepare Solana connection and keys
    // Allow overriding via RPC_ENDPOINT or SOLANA_RPC_URL env vars (RPC_ENDPOINT takes precedence for local testing)
    const RPC_ENDPOINT = process.env.RPC_ENDPOINT || process.env.SOLANA_RPC_URL || 'https://mainnet.helius-rpc.com/?api-key=5e4edb76-36ed-4740-942d-7843adcc1e22';
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
    // Build separate instruction set for minting only (pool setup via DBC SDK handles on-chain metadata)
    const instructionsMint: TransactionInstruction[] = [];
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
    // Mimic pump.fun graduation curve defaults: static base fee of 0.30% and no volatility fee by default
    const defaultCurveConfig = {
      // Fees configuration
      poolFees: {
        baseFee: {
          // 0.30% base fee in bps
          cliffFeeNumerator: bpsToFeeNumerator(30),
          numberOfPeriod: 0,
          periodFrequency: new BN(0),
          reductionFactor: new BN(0),
          feeSchedulerMode: FeeSchedulerMode.Linear,
        },
        // No dynamic volatility fee by default
        dynamicFee: null,
      },
      // Collect only quote fees
      collectFeeMode: 0,
      // Activate immediately via timestamp
      activationType: 1,
      // Migrate threshold: minimal threshold (1 lamport) to ensure branch logic passes
      migrationQuoteThreshold: new BN(1),
      // 0: DAMM V1, 1: DAMM V2
      migrationOption: 1,
      // Token settings: use Token-2022 mint (enables fungible on-chain metadata)
      tokenType: 1,
      tokenDecimal: decimals,
      // LP splits: 5% to platform, 95% to creator
      partnerLpPercentage: 5,
      partnerLockedLpPercentage: 0,
      creatorLpPercentage: 95,
      creatorLockedLpPercentage: 0,
      // Migration fee option: fixed 100 bps (1.00%)
      migrationFeeOption: 2,
      migrationFee: { feePercentage: 1, creatorFeePercentage: 0 },
      // Start sqrt price = as Q64 fixed-point BN (SOL per token)
      sqrtStartPrice: getSqrtPriceFromPrice(
        initialPrice.toString(),
        decimals,
        9
      ),
      // Default locked vesting: no vesting
      lockedVesting: {
        amountPerPeriod: new BN(0),
        cliffDurationFromMigrationTime: new BN(0),
        frequency: new BN(0),
        numberOfPeriod: new BN(0),
        cliffUnlockAmount: new BN(0),
      },
      // Other config parameters
      creatorTradingFeePercentage: 0,
      // Optional fixed token supply before and after migration (null = no fixed supply)
      tokenSupply: null,
      tokenUpdateAuthority: 0,
      // Padding for future use
      padding0: [],
      padding1: [],
    };
    // Merge default curve parameters with any user overrides
    const curveConfigOverrides = portalParams?.curveConfig ?? {};
    const mergedCurveConfig: any = { ...defaultCurveConfig, ...curveConfigOverrides };
    // Inject a default curve segment if none provided: full-range constant-product from start to max price
    if (!mergedCurveConfig.curve || !Array.isArray(mergedCurveConfig.curve) || mergedCurveConfig.curve.length === 0) {
      mergedCurveConfig.curve = [
        {
          // Use MAX_SQRT_PRICE to allow sufficient liquidity capacity
          sqrtPrice: MAX_SQRT_PRICE,
          liquidity: poolSupplyRaw,
        },
      ];
    }
    console.log('DBC defaultCurveConfig:', JSON.stringify(defaultCurveConfig, null, 2));
    console.log('DBC overrides:', JSON.stringify(curveConfigOverrides, null, 2));
    console.log('Merged DBC configParam:', JSON.stringify(mergedCurveConfig, null, 2));
    // Determine quote mint: allow override via portalParams.quoteMint
    const quoteMintArg = portalParams?.quoteMint || NATIVE_MINT.toBase58();
    // If using Token-2022 path, native SOL (NATIVE_MINT) cannot be used as quoteMint
    // if (mergedCurveConfig.tokenType === 1 && quoteMintArg === NATIVE_MINT.toBase58()) {
    //   return {
    //     statusCode: 400,
    //     headers,
    //     body: JSON.stringify({ error: 'Token-2022 path does not support native SOL as quoteMint; please specify a SPL token mint (e.g. USDC) in portalParams.quoteMint' })
    //   };
    // }
    // Build pool instructions, splitting config+pool and optional initial buy.
    let poolIxs: TransactionInstruction[];
    // If depositing native SOL with Token-2022 path, skip initial buy here (swap in client)
    if (mergedCurveConfig.tokenType === 1 && quoteMintArg === NATIVE_MINT.toBase58()) {
      // Create config and pool (no buy)
      const poolTxObj = await dbcClient.pool.createConfigAndPool({
        config: configPubkey.toBase58(),
        feeClaimer: (TREASURY_PUBKEY ?? userPubkey).toBase58(),
        leftoverReceiver: userPubkey.toBase58(),
        quoteMint: quoteMintArg,
        payer: userPubkey.toBase58(),
        ...mergedCurveConfig,
        tokenUpdateAuthority: mergedCurveConfig.tokenUpdateAuthority,
        createPoolParam: {
          baseMint: mintPubkey,
          poolCreator: TREASURY_PUBKEY ?? userPubkey,
          name: token.name,
          symbol: token.ticker,
          uri: tokenMetadata.uri,
        },
      });
      poolIxs = poolTxObj.instructions;
      // Derive DBC pool address for client-side swap
      var poolAddress = deriveDbcPoolAddress(
        new PublicKey(quoteMintArg),
        mintPubkey,
        configPubkey
      );
      console.log('Derived DBC pool address:', poolAddress.toBase58());
      await redis.hset(`dbcPool:${poolAddress.toBase58()}`, 'deployer', walletAddress);
      await redis.hset(`dbcPool:${poolAddress.toBase58()}`, 'mint', mintPubkey.toBase58());
    } else {
      // Create config, pool, and initial buy in one step
      const { createConfigTx, createPoolTx, swapBuyTx } = await dbcClient.pool.createConfigAndPoolWithFirstBuy({
        config: configPubkey.toBase58(),
        feeClaimer: (TREASURY_PUBKEY ?? userPubkey).toBase58(),
        leftoverReceiver: userPubkey.toBase58(),
        quoteMint: quoteMintArg,
        payer: userPubkey.toBase58(),
        ...mergedCurveConfig,
        tokenUpdateAuthority: mergedCurveConfig.tokenUpdateAuthority,
        createPoolParam: {
          baseMint: mintPubkey,
          poolCreator: TREASURY_PUBKEY ?? userPubkey,
          name: token.name,
          symbol: token.ticker,
          uri: tokenMetadata.uri,
        },
        swapBuyParam: {
          buyAmount: new BN(depositLamports),
          minimumAmountOut: new BN(0),
          referralTokenAccount: null,
        },
      });
      // Derive DBC pool address
      var poolAddress = deriveDbcPoolAddress(
        new PublicKey(quoteMintArg),
        mintPubkey,
        configPubkey
      );
      console.log('Derived DBC pool address:', poolAddress.toBase58());
      await redis.hset(`dbcPool:${poolAddress.toBase58()}`, 'deployer', walletAddress);
      await redis.hset(`dbcPool:${poolAddress.toBase58()}`, 'mint', mintPubkey.toBase58());
      // Combine instructions: config+pool+swap
      poolIxs = [
        ...createConfigTx.instructions,
        ...createPoolTx.instructions,
        ...swapBuyTx.instructions,
      ];
    }
    // TX0: mint (create account, initialize mint, mintTo)
    const { blockhash: bh0 } = await connection.getLatestBlockhash();
    const msg0 = new TransactionMessage({ payerKey: userPubkey, recentBlockhash: bh0, instructions: instructionsMint }).compileToV0Message();
    const tx0 = new VersionedTransaction(msg0);
    tx0.sign([mintKeypair]);
    const serialized0 = Buffer.from(tx0.serialize()).toString('base64');
    // TX1: pool setup (config + pool + swap) -- skip metadata to avoid metadata program errors
    // TX1+: Pool setup (config, pool creation, swap), split to fit transaction size
    
    const MAX_TX_BYTES = 1232;
    const poolTxs: string[] = [];
    let chunkIxs: TransactionInstruction[] = [];
    for (const ix of poolIxs) {
      chunkIxs.push(ix);
      const { blockhash } = await connection.getLatestBlockhash();
      const msg = new TransactionMessage({ payerKey: userPubkey, recentBlockhash: blockhash, instructions: chunkIxs }).compileToV0Message();
      const tx = new VersionedTransaction(msg);
      // Partially sign the config creation transaction with server-held config keypair
      try {
        tx.sign([configKeypair]);
      } catch {}
      if (Buffer.from(tx.serialize()).length > MAX_TX_BYTES) {
        // Remove last instruction and finalize the chunk
        const lastIx = chunkIxs.pop()!;
        const prevMsg = new TransactionMessage({ payerKey: userPubkey, recentBlockhash: blockhash, instructions: chunkIxs }).compileToV0Message();
        const prevTx = new VersionedTransaction(prevMsg);
        try {
          prevTx.sign([configKeypair]);
        } catch {}
        poolTxs.push(Buffer.from(prevTx.serialize()).toString('base64'));
        // Start new chunk with the oversized instruction
        chunkIxs = [lastIx];
      }
    }
    if (chunkIxs.length > 0) {
      const { blockhash } = await connection.getLatestBlockhash();
      const msgLast = new TransactionMessage({ payerKey: userPubkey, recentBlockhash: blockhash, instructions: chunkIxs }).compileToV0Message();
      const lastTx = new VersionedTransaction(msgLast);
      // Partially sign with config keypair
      try {
        lastTx.sign([configKeypair]);
      } catch {}
      poolTxs.push(Buffer.from(lastTx.serialize()).toString('base64'));
    }
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        transactions: [serialized0, ...poolTxs],
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
