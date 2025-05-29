const THREAD_ID = 20934; // Forum topic ID for "Token launches"
const API_URL = 'https://tknz.fun/.netlify/functions/leaderboard?sortBy=launchTime&page=1';
import { format } from 'date-fns';
import { Redis } from '@upstash/redis';
// Firestore & on-chain metadata imports
import admin from 'firebase-admin';
import { Connection, PublicKey } from '@solana/web3.js';
import { deserializeMetadata } from '@metaplex-foundation/mpl-token-metadata';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Exponential backoff utility for RPC calls
async function withExponentialBackoff(fn, maxRetries = 3, initialDelay = 5000) {
  let delay = initialDelay;
  let lastError;
  
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      console.warn(`RPC call failed (attempt ${i + 1}/${maxRetries + 1}):`, error.message);
      
      if (i < maxRetries) {
        console.log(`Retrying in ${delay}ms...`);
        await sleep(delay);
        delay *= 2; // Exponential backoff
      }
    }
  }
  
  throw lastError;
}

export const ping = async (event, context) => {
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
  console.log('BOT_TOKEN', BOT_TOKEN);
  console.log('CHAT_ID', CHAT_ID);
  console.log('THREAD_ID', THREAD_ID);
  console.log('API_URL', API_URL);
  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      message_thread_id: THREAD_ID,
      photo: "https://tknz.fun/assets/logo.png",
      caption: "TKNZ",
      parse_mode: 'Markdown',
    })
  });
  console.log("Sent");
  console.log(response);
  return {
      statusCode: 200,
      body: JSON.stringify({ message: "Pong" }),
  };
}

export const handler = async (event, _context) => {
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

  if (!BOT_TOKEN || !CHAT_ID) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'BOT_TOKEN or CHAT_ID is not set' })
    };
  }

  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'REDIS_URL or REDIS_TOKEN is not set' })
    };
  }
  
  console.log('BOT_TOKEN', BOT_TOKEN);
  console.log('CHAT_ID', CHAT_ID);
  console.log('THREAD_ID', THREAD_ID);
  console.log('API_URL', API_URL);

  // Initialize Redis client
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });

  // Helper to escape HTML for Telegram messages
  function escapeHTML(text) {
    if (typeof text !== 'string') text = String(text);
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // Initialize Firebase Admin (for createdCoins) and Solana connection (for metadata)
  if (!admin.apps.length) {
    if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
      throw new Error('Firebase environment variables are not set');
    }
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });
  }
  const db = admin.firestore();
  if (!process.env.SOLANA_RPC_URL) {
    throw new Error('SOLANA_RPC_URL is not set');
  }
  const connection = new Connection(process.env.SOLANA_RPC_URL);
  try {
    // Pull created coins directly from Firestore instead of leaderboard API
    const snapshot = await db.collection('createdCoins').get();
    const tokens = snapshot.docs.map(doc => {
      const data = doc.data();
      const addr = data.address;
      // Convert Firestore timestamp or string to ms
      let launchTime = Date.now();
      const raw = data.createdAt;
      if (raw && typeof raw.toMillis === 'function') {
        launchTime = raw.toMillis();
      } else {
        const dt = new Date(raw);
        if (!isNaN(dt.getTime())) launchTime = dt.getTime();
      }
      return {
        address: addr,
        launchTime,
        // Firestore fields
        name: data.name,
        symbol: data.ticker,
        // optional: pump URL or other links
        pumpUrl: data.pumpUrl,
        walletAddress: data.walletAddress,
      };
    });
    console.log('tokens', tokens);
    const newTokens = [];
      
      for (const token of tokens) {
        // Check if token has already been sent using Redis
        const isSent = await redis.zscore('notifications-sent', token.address);
        
        if (!isSent) {
          newTokens.push(token);
        } else {
          continue;
        }
      }
      
      console.log('newTokens', newTokens);

      if (newTokens.length > 0) {
        console.log('newTokens', newTokens);
        // Reverse order so oldest first
        const tokensToSend = newTokens.slice().reverse();
        // Batch fetch on-chain metadata PDAs
        const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
        const pdaInfos = await Promise.all(
          tokensToSend.map(async token => {
            const [pda] = await PublicKey.findProgramAddress(
              [Buffer.from('metadata'), METADATA_PROGRAM_ID.toBuffer(), new PublicKey(token.address).toBuffer()],
              METADATA_PROGRAM_ID
            );
            return { address: token.address, pda };
          })
        );
        const metadataMap = {};
        const batchSize = 50;
        for (let i = 0; i < pdaInfos.length; i += batchSize) {
          const batch = pdaInfos.slice(i, i + batchSize);
          const infos = await withExponentialBackoff(async () => {
            return await connection.getMultipleAccountsInfo(batch.map(x => x.pda));
          });
          
          batch.forEach((item, idx) => {
            const info = infos[idx];
            if (info?.data) {
              try {
                const md = deserializeMetadata(info);
                metadataMap[item.address] = {
                  name: md.name.replace(/\0/g, '').trim(),
                  symbol: md.symbol.replace(/\0/g, '').trim(),
                  uri: md.uri.replace(/\0/g, '').trim(),
                };
              } catch (e) {
                metadataMap[item.address] = null;
              }
            } else {
              metadataMap[item.address] = null;
            }
          });
          
          // Add delay between batches to avoid rate limiting
          if (i + batchSize < pdaInfos.length) {
            await sleep(5000);
          }
        }
        // Iterate sending tokens with merged metadata
        for (const token of tokensToSend) {
          const meta = metadataMap[token.address] || {};
          const name = meta.name || token.name || 'Unknown';
          const ticker = meta.symbol || token.symbol || '???';
          const launchTime = token.launchTime || 'Unknown';
          let image = token.logoURI || 'https://placehold.co/600x400.png?text=TKNZ';
          if (meta.uri) {
            try {
              const { image: fetchedImage, image_url: fetchedImageUrl } = await withExponentialBackoff(async () => {
                const res = await fetch(meta.uri);
                if (!res.ok) {
                  throw new Error(`Failed to fetch metadata: ${res.status} ${res.statusText}`);
                }
                return await res.json();
              }, 2, 2000); // 2 retries, starting at 2 seconds for metadata fetches
              
              image = fetchedImage || fetchedImageUrl || image;
            } catch (e) {
              console.warn('Failed to fetch token metadata JSON', e);
            }
          }
          const xUrl = token.xUrl;
          const tknzUrl = `https://pump.fun/coin/${token.address}`;
  
          // Format the timestamp to a readable date if it's a number
          let formattedLaunchTime = "Unknown";
          if (launchTime && !isNaN(launchTime)) {
            try {
              const date = new Date(Number(launchTime));
              formattedLaunchTime = format(date, 'MMM d, yyyy h:mm a');
            } catch (err) {
              console.error('Error formatting date:', err);
              formattedLaunchTime = String(launchTime);
            }
          } else {
            formattedLaunchTime = String(launchTime);
          }
  
          // Escape content for HTML
          const escapedName = escapeHTML(name);
          const escapedTicker = escapeHTML(ticker.toString());
          const escapedFormattedLaunchTime = escapeHTML(formattedLaunchTime);

          // Construct HTML caption
          const tknzLink = `<a href="${tknzUrl}">View on Pump.fun</a>`;
          const xLink = xUrl ? `<a href="${xUrl}">View on X</a>` : '';

          const caption = `<b>🚀 New Token Launch on TKNZ!</b>\n\n` +
            `<b>🪙 Name:</b> ${escapedName}\n` +
            `<b>📈 Ticker:</b> $${escapedTicker}\n` +
            `<b>🌐</b> ${tknzLink}\n` +
            (xUrl ? `<b>🐦</b> ${xLink}\n` : '') +
            `<b>🔗 Launched:</b> ${escapedFormattedLaunchTime}`;
          console.log('caption', caption);
          const body = {
            chat_id: CHAT_ID,
            message_thread_id: THREAD_ID,
            photo: image,
            caption: caption,
            parse_mode: 'HTML',
          };
          console.log('body', body);

          // Send to Telegram API with error handling
          try {
            const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            });
            const text = await response.text();
            let data;
            try {
              data = JSON.parse(text);
            } catch (e) {
              data = text;
            }
            if (!response.ok) {
              // Parse error fields if JSON, else wrap raw data
              const { ok: okRes, error_code, description } =
                typeof data === 'object'
                  ? data
                  : { ok: false, error_code: response.status, description: data };
              console.error(`Telegram API Error → ok=${okRes}, code=${error_code}, description=${description}`);
              // Retry with fallback image if content-type error
              if (error_code === 400 && /wrong type of the web page content/i.test(description)) {
                console.warn('Retrying with fallback image URL…');
                const fallbackBody = { ...body, photo: "https://placehold.co/600x400.png?text=TKNZ" };
                const retryRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(fallbackBody),
                });
                const retryText = await retryRes.text();
                console.log('Fallback send status:', retryRes.status, retryRes.statusText, retryText);
              }
            } else {
              console.log('Telegram API response status:', response.status);
              console.log('Telegram API response data:', data);
            }
          } catch (error) {
            console.error('Error sending Telegram API request:', error);
          }
          
          // Add token to Redis sorted set after sending notification
          await redis.zadd('notifications-sent', { score: launchTime || Date.now(), member: token.address });
          
          await sleep(10_000);
        }
      } else {
        console.log('No new tokens');
      }
  
      return {
        statusCode: 200,
        body: JSON.stringify({ sent: newTokens.length }),
      };
    } catch (error) {
      console.error("Telegram bot error:", error);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: error.message }),
      };
    }
}