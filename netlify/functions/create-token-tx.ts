import { Handler } from '@netlify/functions';
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL, Transaction, VersionedTransaction, TransactionMessage } from '@solana/web3.js';
import { Buffer, Blob } from 'buffer';

// Endpoint to build and return a Solana transaction for token creation with a fee instruction

interface Token {
    name: string;
    ticker: string;
    imageUrl: string;
    description: string;
    websiteUrl?: string;
    twitter?: string;
    telegram?: string;
}

interface TokenMetadata {
  name: string;
  symbol: string;
  uri: string;
}

interface PortalParams {
  action: string;
  amount: number;
  tokenMetadata: TokenMetadata;
  denominatedInSol: string;
  slippage: number;
  publicKey: string;
  mint: string;
  priorityFee: number;
  pool: string;
}

interface CreateTokenRequest {
  walletAddress: string;
  token: Token;
  portalParams: Partial<PortalParams>
}

interface CreateTokenResponse {
  transaction: string;    // Base64 serialized transaction
  feeAmount: number;      // Platform fee in SOL (0.01)
  pumpFeeAmount: number;  // Pump portal fee in SOL (0.02)
  totalAmount: number;    // Investment amount in SOL
  netAmount: number;      // Net investment after fees (equal to investment amount)
  totalCost: number;      // Total cost to user: investment + pump portal fee + platform fee
}


// Environment variables
// RPC_ENDPOINT is not currently used
const TREASURY_WALLET = process.env.TREASURY_WALLET;
// Fixed platform fee in SOL for each token creation transaction
const FEE_SOL = 0.01;
// Fixed pump portal fee in SOL charged per transaction
const PUMP_FEE_SOL = 0.02;

const defaultPumpPortalParams = {
    action: "create",
    denominatedInSol: "true",
    slippage: 10,
    priorityFee: 0.0005,
    pool: "pump"
}

async function createTokenMetadata(token: Token): Promise<TokenMetadata> {
    const { name, ticker, description, imageUrl, websiteUrl, twitter, telegram } = token;

    if (!imageUrl) {
        throw new Error('No image provided for coin creation');
    }

    const formData = new FormData();

    let fileBlob: Blob;
    
    if (imageUrl.startsWith('data:')) {
      // Handle base64 data URL
      const [meta, base64Data] = imageUrl.split(',');
      const contentType = meta.split(':')[1].split(';')[0];
      const buffer = Buffer.from(base64Data, 'base64');
      fileBlob = new Blob([buffer], { type: contentType });
    } else {
      const imgRes = await fetch(imageUrl);
      fileBlob = await imgRes.blob();
    }

    formData.append("file", fileBlob);
    formData.append("name", name);
    formData.append("symbol", ticker);
    formData.append("description", description);
    if (websiteUrl) {
        formData.append("website", websiteUrl);
    }
    if (twitter) {
        formData.append("twitter", twitter);
    }
    if (telegram) {
        formData.append("telegram", telegram);
    }
    formData.append("showName", "true");

    const metadataResponse = await fetch("https://pump.fun/api/ipfs", {
      method: "POST",
      body: formData,
    });
    
    if (!metadataResponse.ok) {
      throw new Error(`Failed to upload metadata: ${metadataResponse.statusText}`);
    }
    
    const metadataResponseJSON = await metadataResponse.json();

    return {
        name: metadataResponseJSON.metadata.name,
        symbol: metadataResponseJSON.metadata.symbol,
        uri: metadataResponseJSON.metadataUri
    }
}


export const handler: Handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };
  
  let tokenMetadata: TokenMetadata;
  let req: CreateTokenRequest;

  if (event.httpMethod === 'OPTIONS') {
    console.log('OPTIONS request');
    return { statusCode: 204, headers };
  }

  if (event.httpMethod !== 'POST') {
    console.log('Method not allowed');
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  if (!event.body) {
    console.log('Missing request body');
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing request body' }) };
  }

  try {
    console.log('Parsing request body');
    req = JSON.parse(event.body);
  } catch (e) {
    console.log('Invalid JSON in request body', e);
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON in request body' }) };
  }

  const { walletAddress, portalParams, token } = req;
  
  if (!walletAddress || typeof walletAddress !== 'string') {
    console.log('Missing or invalid walletAddress');
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing or invalid walletAddress' }) };
  }
  
  if (!portalParams || typeof portalParams !== 'object') {
    console.log('Missing or invalid portalParams');
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing or invalid portalParams' }) };
  }
  
  if (!token || typeof token !== 'object') {
    console.log('Missing or invalid token');
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing or invalid token' }) };
  }
  
  try {
    console.log('Creating token metadata');
    tokenMetadata = await createTokenMetadata(token);
    console.log('Token metadata created', tokenMetadata);
  } catch (e) {
    console.error('Error creating token metadata:', e);
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Error creating token metadata' }) };
  }

  if (!tokenMetadata || typeof tokenMetadata !== 'object') {
    console.log('Missing or invalid tokenMetadata');
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing or invalid tokenMetadata' }) };
  }

  if (['SOL', 'USDC', 'USDT', 'TKNZ'].includes(tokenMetadata.symbol.trim().toUpperCase())) {
    console.log('Token symbol is reserved and cannot be used.');
    return { statusCode: 400, headers, body: JSON.stringify({ error: `Token symbol ${tokenMetadata.symbol} is reserved and cannot be used.` }) };
  }

  Object.assign(portalParams, { tokenMetadata });

  const { amount } = portalParams;

  if (typeof amount !== 'number' || amount <= 0) {
    console.log('Missing or invalid amount in pumpPortalParams');
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing or invalid amount in pumpPortalParams' }) };
  }

  if (!TREASURY_WALLET) {
    console.error('Environment misconfiguration: TREASURY_WALLET not set');
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server misconfiguration: missing TREASURY_WALLET' }) };
  }

  let userPubkey: PublicKey, treasuryPubkey: PublicKey;
  try {
    userPubkey = new PublicKey(walletAddress);
    treasuryPubkey = new PublicKey(TREASURY_WALLET);
  } catch (e) {
    console.log('Invalid public key(s)', e);
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid public key(s)' }) };
  }

  // Calculate fee, pump fee, investment, and total cost
  const totalAmount = amount; // User-specified investment amount in SOL
  const feeAmount = FEE_SOL; // Platform fee in SOL
  const pumpFeeAmount = PUMP_FEE_SOL; // Pump portal fee in SOL
  // Net investment amount passed to pump portal
  const netAmount = totalAmount;
  // Total cost to user: investment + pump fee + platform fee
  const totalCost = parseFloat((totalAmount + pumpFeeAmount + feeAmount).toFixed(9));
  // Lamports for the platform fee transfer
  const feeLamports = Math.round(feeAmount * LAMPORTS_PER_SOL);
  
  try {
    // Fetch transaction from PumpPortal
    const pumpRes = await fetch('https://pumpportal.fun/api/trade-local', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...defaultPumpPortalParams, publicKey: walletAddress, ...portalParams })
    });
    if (!pumpRes.ok) {
      const errText = await pumpRes.text();
      console.error('PumpPortal error:', errText);
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Failed to fetch PumpPortal transaction' }) };
    }

    const data = await pumpRes.arrayBuffer();
    const incomingTx = VersionedTransaction.deserialize(new Uint8Array(data));
    // Create fee transfer instruction
    const feeIx = SystemProgram.transfer({
      fromPubkey: userPubkey,
      toPubkey: treasuryPubkey,
      lamports: feeLamports,
    });
    // Decompile existing message to TransactionInstruction list
    const originalMessage = TransactionMessage.decompile(incomingTx.message);
    const instructions = [feeIx, ...originalMessage.instructions];
    // Compile a new v0 message with the fee instruction first
    const newMessage = new TransactionMessage({
      payerKey: userPubkey,
      recentBlockhash: incomingTx.message.recentBlockhash,
      instructions,
    });
    const v0Message = newMessage.compileToV0Message();
    const newTx = new VersionedTransaction(v0Message);
    // Serialize the versioned transaction (signatures are empty for client signing)
    const serializedTx = Buffer.from(newTx.serialize()).toString('base64');
    const responseBody: CreateTokenResponse & { pumpFeeAmount: number; totalCost: number } = {
      transaction: serializedTx,
      feeAmount,
      pumpFeeAmount,
      totalAmount,
      netAmount,
      totalCost,
    };

    return { statusCode: 200, headers, body: JSON.stringify(responseBody) };
  } catch (err) {
    console.error('Error building transaction:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Internal server error' }) };
  }
};