import { Handler } from '@netlify/functions';
import { Redis } from '@upstash/redis';

/**
 * Endpoint to send a notification for a newly launched token via Telegram.
 * Ensures the token is in the v2 leaderboard, hasn't been notified yet,
 * then sends a Telegram message and records it in notifications:v2.
 */
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
  let payload: any;
  try {
    payload = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }
  const mint: string = payload.mint;
  if (!mint || typeof mint !== 'string') {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing or invalid mint address' }) };
  }
  // Check Redis config
  const { UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = process.env;
  if (!UPSTASH_REDIS_REST_URL || !UPSTASH_REDIS_REST_TOKEN) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Redis env vars missing' }) };
  }
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Telegram env vars missing' }) };
  }
  // Initialize Redis
  let redis: Redis;
  try {
    redis = new Redis({ url: UPSTASH_REDIS_REST_URL, token: UPSTASH_REDIS_REST_TOKEN });
  } catch (err) {
    console.error('Redis init error', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Error initializing Redis' }) };
  }
  // 1) Verify token is in leaderboard:v2
  try {
    const score = await redis.zscore('leaderboard:v2', mint);
    if (score === null) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Token not in leaderboard:v2' }) };
    }
  } catch (err) {
    console.error('Redis zscore error', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Error querying leaderboard' }) };
  }
  // 2) Check if already notified
  try {
    const notified = await redis.zscore('notifications:v2', mint);
    if (notified !== null) {
      return { statusCode: 200, headers, body: JSON.stringify({ skipped: true }) };
    }
  } catch (err) {
    console.error('Redis notify-set check error', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Error checking notifications' }) };
  }
  // Build Telegram message
  const name = payload.token?.name || '';
  const symbol = payload.token?.ticker || '';
  const pool = payload.pool || '';
  const pumpUrl = payload.pumpUrl || `https://pump.fun/coin/${mint}`;
  const text = `🎉 *New Token Launched!*
*${name}* (${symbol})
Mint: \\`${mint}\\`
Pool: \\`${pool}\\`
[View on Pump.fun](${pumpUrl})`;
  // Send via Telegram
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: 'Markdown',
        disable_web_page_preview: false,
      }),
    });
  } catch (err) {
    console.error('Telegram send error', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Error sending Telegram message' }) };
  }
  // 3) Record notification
  try {
    await redis.zadd('notifications:v2', { score: Date.now(), member: mint });
  } catch (err) {
    console.error('Redis zadd notifications error', err);
    // Continue even if recording fails
  }
  return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
};