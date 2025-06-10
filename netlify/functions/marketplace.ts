import { Handler } from '@netlify/functions';
import { Redis } from '@upstash/redis';

// Initialize Upstash Redis client
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

/**
 * Marketplace endpoint: lists v2 tokens sorted by launch date and pool liquidity.
 * GET /.netlify/functions/marketplace
 * Response: { entries: Array<TokenEntry> }
 * TokenEntry includes all fields stored in Redis hash plus parsed types.
 */
export const handler: Handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
  };
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  try {
    // Fetch all v2 tokens sorted by launch time (desc)
    const raw = await redis.zrange('leaderboard:v2', 0, -1, { rev: true, withScores: true });
    if (!Array.isArray(raw) || raw.length === 0) {
      return { statusCode: 200, headers, body: JSON.stringify({ entries: [] }) };
    }
    // Build list of { mint, launchTime }
    const tokens: { mint: string; launchTime: number }[] = [];
    for (let i = 0; i < raw.length; i += 2) {
      const mint = String(raw[i]);
      const launchTime = Number(raw[i + 1]);
      tokens.push({ mint, launchTime });
    }
    // Fetch hash details for each token
    const pipe = redis.pipeline();
    tokens.forEach(({ mint }) => pipe.hgetall(`token:v2:${mint}`));
    const hashResults = await pipe.exec();
    // Combine and parse entries
    const entries = tokens.map(({ mint, launchTime }, idx) => {
      const rawDetails = hashResults[idx] as Record<string, string> | null;
      const entry: Record<string, any> = { mint, launchTime };
      if (rawDetails && typeof rawDetails === 'object') {
        for (const [key, val] of Object.entries(rawDetails)) {
          if (val == null) continue;
          // Parse known numeric fields
          if (/^(decimals|initialSupply|initialSupplyRaw|depositSol|depositLamports|feeSol|feeLamports|createdAt)$/.test(key)) {
            entry[key] = Number(val);
          } else if (key === 'isLockLiquidity') {
            entry[key] = val === 'true';
          } else if (key === 'token' || key === 'portalParams') {
            try { entry[key] = JSON.parse(val); } catch { entry[key] = null; }
          } else {
            // Keep as string
            entry[key] = val;
          }
        }
      }
      return entry;
    });
    // Secondary sort: if same launchTime, sort by depositLamports (desc)
    entries.sort((a, b) => {
      if (b.launchTime !== a.launchTime) return b.launchTime - a.launchTime;
      return (b.depositLamports || 0) - (a.depositLamports || 0);
    });
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ entries }),
    };
  } catch (err: any) {
    console.error('Error in marketplace endpoint:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Internal Server Error' }) };
  }
};