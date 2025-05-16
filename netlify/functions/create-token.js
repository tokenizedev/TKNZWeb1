import { Connection, PublicKey, SystemProgram, LAMPORTS_PER_SOL, Transaction } from '@solana/web3.js';
import { Buffer } from 'buffer';

// Fee percentage (1%) remains constant
const FEE_PERCENTAGE = 0.01; // 1% fee

export const handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
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

  let req;
  try {
    req = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON in request body' }) };
  }

  const walletAddress = req.walletAddress;
  const pumpPortalParams = req.pumpPortalParams;
  if (!walletAddress || typeof walletAddress !== 'string') {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing or invalid walletAddress' }) };
  }
  if (!pumpPortalParams || typeof pumpPortalParams !== 'object') {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing or invalid pumpPortalParams' }) };
  }

  const amount = pumpPortalParams.amount;
  if (typeof amount !== 'number' || amount <= 0) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing or invalid amount in pumpPortalParams' }) };
  }

  // Load required env vars inside handler to pick up dynamic values
  const RPC_ENDPOINT = process.env.RPC_ENDPOINT;
  const TREASURY_WALLET = process.env.TREASURY_WALLET;
  if (!RPC_ENDPOINT || !TREASURY_WALLET) {
    console.error('Environment misconfiguration: RPC_ENDPOINT or TREASURY_WALLET not set');
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server misconfiguration' }) };
  }

  let userPubkey, treasuryPubkey;
  try {
    userPubkey = new PublicKey(walletAddress);
    treasuryPubkey = new PublicKey(TREASURY_WALLET);
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid public key(s)' }) };
  }

  const totalAmount = amount;
  const feeAmount = parseFloat((FEE_PERCENTAGE * totalAmount).toFixed(9));
  const netAmount = parseFloat((totalAmount - feeAmount).toFixed(9));
  const feeLamports = Math.round(feeAmount * LAMPORTS_PER_SOL);

  try {
    const pumpRes = await fetch('https://pumpportal.fun/api/trade-local', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publicKey: walletAddress, ...pumpPortalParams })
    });
    if (!pumpRes.ok) {
      const errText = await pumpRes.text();
      console.error('PumpPortal error:', errText);
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Failed to fetch PumpPortal transaction' }) };
    }

    let serializedTxBase64;
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

    const raw = Buffer.from(serializedTxBase64, 'base64');
    const tx = Transaction.from(raw);
    const feeIx = SystemProgram.transfer({
      fromPubkey: userPubkey,
      toPubkey: treasuryPubkey,
      lamports: feeLamports
    });
    tx.instructions.unshift(feeIx);
    tx.signatures.forEach(sig => (sig.signature = null));

    const finalTx = tx.serialize({ requireAllSignatures: false }).toString('base64');
    const responseBody = { transaction: finalTx, feeAmount, totalAmount, netAmount };

    return { statusCode: 200, headers, body: JSON.stringify(responseBody) };
  } catch (err) {
    console.error('Error building transaction:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Internal server error' }) };
  }
};