import { Handler } from '@netlify/functions';
import admin from 'firebase-admin';
import { Redis } from '@upstash/redis';

/**
 * Endpoint to record confirmed token creation for v2 leaderboard.
 * Stores token data in Firestore and updates Redis sorted set and hash.
 */
export const handler: Handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };
  // Handle CORS preflight
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
  } catch (err) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }
  const mint: string = payload.mint;
  if (!mint || typeof mint !== 'string') {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing or invalid mint address' }) };
  }
  // Initialize Firebase Admin SDK if not already
  if (!admin.apps.length) {
    const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;
    if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
      console.error('Firebase environment variables are not set');
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server misconfiguration: Firebase env vars missing' }) };
    }
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: FIREBASE_PROJECT_ID,
        clientEmail: FIREBASE_CLIENT_EMAIL,
        // Replace escaped newlines in private key
        privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });
  }
  const db = admin.firestore();
  // Write token creation record to Firestore
  try {
    await db.collection('tokenCreationsV2')
      .doc(mint)
      .set({
        ...payload,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
  } catch (err) {
    console.error('Error writing to Firestore:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Error writing to Firestore' }) };
  }
  // Initialize Redis client
  const { UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN } = process.env;
  if (!UPSTASH_REDIS_REST_URL || !UPSTASH_REDIS_REST_TOKEN) {
    console.error('Redis environment variables are not set');
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server misconfiguration: Redis env vars missing' }) };
  }
  let redis: Redis;
  try {
    redis = new Redis({ url: UPSTASH_REDIS_REST_URL, token: UPSTASH_REDIS_REST_TOKEN });
  } catch (err) {
    console.error('Error initializing Redis client:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Error initializing Redis' }) };
  }
  // Prepare data for Redis hash
  const timestamp = Date.now();
  const flat: Record<string, string> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value === null || value === undefined) {
      flat[key] = '';
    } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      flat[key] = String(value);
    } else {
      // Serialize objects and arrays
      try {
        flat[key] = JSON.stringify(value);
      } catch {
        flat[key] = '';
      }
    }
  }
  flat.createdAt = String(timestamp);
  // Write to Redis: hash and sorted set for v2 leaderboard
  try {
    const pipeline = redis.multi();
    // Hash key for token details
    const hashKey = `token:v2:${mint}`;
    pipeline.hset(hashKey, flat);
    // Sorted set for launch time ordering
    pipeline.zadd('leaderboard:v2', { score: timestamp, member: mint });
    await pipeline.exec();
  } catch (err) {
    console.error('Error writing to Redis:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Error writing to Redis' }) };
  }
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ success: true, createdAt: timestamp }),
  };
};