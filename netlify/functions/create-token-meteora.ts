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
import { CpAmm, derivePoolAddress } from '@meteora-ag/cp-amm-sdk';
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
    
    // Validate fee config account from env
    const CP_AMM_CONFIG = process.env.CP_AMM_STATIC_CONFIG;
    if (!CP_AMM_CONFIG) {
      console.error('Missing CP_AMM_STATIC_CONFIG');
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server misconfiguration: CP_AMM_STATIC_CONFIG' }) };
    }
    let configPubkey: PublicKey;
    try {
      configPubkey = new PublicKey(CP_AMM_CONFIG);
    } catch (err) {
      console.error('Invalid CP_AMM_STATIC_CONFIG public key');
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server misconfiguration: invalid CP_AMM_STATIC_CONFIG' }) };
    }
    const configInfo = await connection.getAccountInfo(configPubkey);
    if (!configInfo) {
      console.error(`Fee config account not found on-chain: ${configPubkey.toBase58()}`);
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server misconfiguration: CP_AMM_STATIC_CONFIG not found on-chain' }) };
    }
    
    // Generate new mint keypair and a fresh keypair for the pool position NFT
    const mintKeypair = Keypair.generate();
    const mintPubkey = mintKeypair.publicKey;
    const positionNftKeypair = Keypair.generate();
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
    
    // 5) Deposit fee (if any) and prepare pool via CP-AMM (pool instructions)
    const cpAmm = new CpAmm(connection);
    // Determine optional fee in SOL (deposit amount solDepositUi defined above)
    const feeUi = portalParams?.priorityFee ?? 0;  // no extra fee by default when AMM config handles fees
    const depositLamports = Math.round(solDepositUi * LAMPORTS_PER_SOL);
    const feeLamports = Math.round(feeUi * LAMPORTS_PER_SOL);
    // Collect fee if specified
    if (feeLamports > 0) {
      const feeAccount = process.env.TREASURY_ACCOUNT;
      if (!feeAccount) {
        throw new Error('Missing TREASURY_ACCOUNT env var for fee collection');
      }
      const feePubkey = new PublicKey(feeAccount);
      instructionsPool.push(
        SystemProgram.transfer({
          fromPubkey: userPubkey,
          toPubkey: feePubkey,
          lamports: feeLamports,
        })
      );
    }
    // Set token amounts for pool initialization
    const tokenAAmountBN = poolSupplyRaw;
    const tokenBAmountBN = new BN(depositLamports);
    // Define price bounds
    const minSqrtPrice = new BN(0);
    const maxSqrtPrice = new BN('340282366920938463463374607431768211455');
    let initSqrtPrice: BN;
    let liquidityDelta: BN;
    if (tokenAAmountBN.gt(new BN(0)) && tokenBAmountBN.eq(new BN(0))) {
      // Single-sided pool creation: init price == min price
      initSqrtPrice = minSqrtPrice;
      liquidityDelta = cpAmm.preparePoolCreationSingleSide({
        tokenAAmount: tokenAAmountBN,
        initSqrtPrice,
        minSqrtPrice,
        maxSqrtPrice,
      });
    } else {
      // Two-sided pool creation, with SOL deposit
      const poolPrep = cpAmm.preparePoolCreationParams({
        tokenAAmount: tokenAAmountBN,
        tokenBAmount: tokenBAmountBN,
        minSqrtPrice,
        maxSqrtPrice,
      });
      initSqrtPrice = poolPrep.initSqrtPrice;
      liquidityDelta = poolPrep.liquidityDelta;
    }
    // Derive pool address
    const poolAddress = derivePoolAddress(configPubkey, mintPubkey, NATIVE_MINT);
    console.log('Derived pool address:', poolAddress.toBase58());
    // Store pool => deployer & mint mapping for fee claims
    const poolKey = `pool:${poolAddress.toBase58()}`;
    await redis.hset(poolKey, 'deployer', walletAddress);
    await redis.hset(poolKey, 'mint', mintPubkey.toBase58());
    // Build pool creation transaction
    // Decide pool creator: treasury if provided, else user
    const poolCreator = TREASURY_PUBKEY ?? userPubkey;
    const poolTx = await cpAmm.createPool({
      payer: userPubkey,
      creator: poolCreator,
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
      isLockLiquidity,
    });
    // Append pool creation instructions
    instructionsPool.push(...poolTx.instructions);
    
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
    // Partially sign tx2 with position NFT keypair
    tx2.sign([positionNftKeypair]);
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
