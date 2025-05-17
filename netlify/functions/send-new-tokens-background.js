const THREAD_ID = 20934; // Forum topic ID for "Token launches"
const API_URL = 'https://tknz.fun/.netlify/functions/leaderboard?sortBy=launchTime&page=1';
import { format } from 'date-fns';
import { Redis } from '@upstash/redis';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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

  try {
      const response = await fetch(API_URL);
      const { entries: tokens} = await response.json();
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
        
        for (const token of newTokens.reverse()) {
          const name = token.name || "Unknown";
          const ticker = token.symbol || "???";
          const launchTime = token.launchTime || "Unknown";
          const image = token.logoURI || "https://placehold.co/600x400.png?text=TKNZ";
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
