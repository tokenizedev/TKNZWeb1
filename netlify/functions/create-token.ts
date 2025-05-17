import { Handler } from '@netlify/functions';
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL, Transaction } from '@solana/web3.js';
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
  transaction: string; // Base64 serialized transaction
  feeAmount: number;   // Fee in SOL
  totalAmount: number; // Total investment in SOL
  netAmount: number;   // Net investment after fee in SOL
}


const RPC_ENDPOINT = process.env.RPC_ENDPOINT;
const TREASURY_WALLET = process.env.TREASURY_WALLET;
const FEE_PERCENTAGE = 0.01; // 1% fee

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
    return { statusCode: 204, headers };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  if (!event.body) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing request body' }) };
  }

  try {
    req = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON in request body' }) };
  }

  const { walletAddress, portalParams, token } = req;
  
  if (!walletAddress || typeof walletAddress !== 'string') {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing or invalid walletAddress' }) };
  }
  
  if (!portalParams || typeof portalParams !== 'object') {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing or invalid portalParams' }) };
  }
  
  if (!token || typeof token !== 'object') {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing or invalid token' }) };
  }
  
  try {
    tokenMetadata = await createTokenMetadata(token);
  } catch (e) {
    console.error('Error creating token metadata:', e);
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Error creating token metadata' }) };
  }

  if (!tokenMetadata || typeof tokenMetadata !== 'object') {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing or invalid tokenMetadata' }) };
  }

  if (['SOL', 'USDC', 'USDT', 'TKNZ'].includes(tokenMetadata.symbol.trim().toUpperCase())) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: `Token symbol ${tokenMetadata.symbol} is reserved and cannot be used.` }) };
  }

  Object.assign(portalParams, { tokenMetadata });

  const { amount } = portalParams;

  if (typeof amount !== 'number' || amount <= 0) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing or invalid amount in pumpPortalParams' }) };
  }

  if (!RPC_ENDPOINT || !TREASURY_WALLET) {
    console.error('Environment misconfiguration: RPC_ENDPOINT or TREASURY_WALLET not set');
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server misconfiguration' }) };
  }

  let userPubkey: PublicKey, treasuryPubkey: PublicKey;
  try {
    userPubkey = new PublicKey(walletAddress);
    treasuryPubkey = new PublicKey(TREASURY_WALLET);
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid public key(s)' }) };
  }

  // Calculate fee and net amounts
  const totalAmount = amount;
  const feeAmount = parseFloat((FEE_PERCENTAGE * totalAmount).toFixed(9));
  const netAmount = parseFloat((totalAmount - feeAmount).toFixed(9));
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

    // Parse response (expecting base64 string)
    let serializedTxBase64: string;
    const ct = pumpRes.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      const j = await pumpRes.json();
      serializedTxBase64 = j.transaction || j.serializedTransaction;
      if (typeof serializedTxBase64 !== 'string') {
        console.error('Invalid PumpPortal JSON:', j);
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'Invalid PumpPortal response format' }) };
      }
    } else {
      serializedTxBase64 = await pumpRes.text();
    }

    // Deserialize and modify transaction
    const raw = Buffer.from(serializedTxBase64, 'base64');
    const tx = Transaction.from(raw);
    // Prepend fee instruction
    const feeIx = SystemProgram.transfer({
      fromPubkey: userPubkey,
      toPubkey: treasuryPubkey,
      lamports: feeLamports
    });
    tx.instructions.unshift(feeIx);
    // Clear signatures for client to sign
    tx.signatures.forEach(sig => (sig.signature = null));

    // Serialize and return
    const finalTx = tx.serialize({ requireAllSignatures: false }).toString('base64');
    const responseBody: CreateTokenResponse = {
      transaction: finalTx,
      feeAmount,
      totalAmount,
      netAmount
    };

    return { statusCode: 200, headers, body: JSON.stringify(responseBody) };
  } catch (err) {
    console.error('Error building transaction:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Internal server error' }) };
  }
};