const THREAD_ID = 20934; // Forum topic ID for "Token launches"
const API_URL = 'https://tknz.fun/.netlify/functions/leaderboard?sortBy=launchTime&page=1';
import { format } from 'date-fns';

let lastLaunchTimeCache = null;

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

export const handler = async (event, context) => {
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

  console.log('BOT_TOKEN', BOT_TOKEN);
  console.log('CHAT_ID', CHAT_ID);
  console.log('THREAD_ID', THREAD_ID);
  console.log('API_URL', API_URL);

    try {
        const response = await fetch(API_URL);
        const { entries: tokens} = await response.json();
        console.log('tokens', tokens);
        const newTokens = [];
        for (const token of tokens) {
          
          if (!lastLaunchTimeCache || token.launchTime > lastLaunchTimeCache) {
            newTokens.push(token);
          } else {
            break;
          }
        }
        console.log('newTokens', newTokens);
        if (newTokens.length > 0) {
          console.log('newTokens', newTokens);
          lastLaunchTimeCache = newTokens[0].launchTime;
    
          for (const token of newTokens.reverse()) {
            const name = token.name || "Unknown";
            const ticker = token.symbol || "???";
            const launchTime = token.launchTime || "Unknown";
            const image = token.logoURI || "https://placehold.co/600x400?text=TKNZ";
            const xUrl = token.xUrl;
            const tknzUrl = `https://tknz.fun/token/${ticker}`;
    
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
    
            const caption = `
    🚀 *New Token Launch on TKNZ\!*
    
    🪙 *Name:* ${name.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&')}
    📈 *Ticker:* $${ticker.toString().replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&')}
    🌐 [View on TKNZ](${tknzUrl.replace(/[)]/g, '\\$&')})
    ${xUrl ? `🐦 [View on X](${xUrl.replace(/[)]/g, '\\$&')})` : ""}
    🔗 *Launched:* ${formattedLaunchTime.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&')}
            `.trim();
            console.log('caption', caption);
            const body = {
              chat_id: CHAT_ID,
              message_thread_id: THREAD_ID,
              photo: image,
              caption: caption,
              parse_mode: 'Markdown',
            }
            console.log('body', body);

            const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            });
            console.log('sent', response);
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
