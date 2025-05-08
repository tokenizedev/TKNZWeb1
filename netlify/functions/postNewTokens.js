const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const THREAD_ID = 20934; // Forum topic ID for "Token launches"
const API_URL = 'https://tknz.fun/.netlify/functions/leaderboard?sortBy=launchTime&page=1';

let lastLaunchTimeCache = null;

export const config = { schedule: '*/30 * * * *' };

export default async function () {
  try {
    const response = await fetch(API_URL);
    const tokens = await response.json();

    const newTokens = [];
    for (const token of tokens) {
      if (!lastLaunchTimeCache || token.launchTime > lastLaunchTimeCache) {
        newTokens.push(token);
      } else {
        break;
      }
    }

    if (newTokens.length > 0) {
      lastLaunchTimeCache = newTokens[0].launchTime;

      for (const token of newTokens.reverse()) {
        const name = token.name || "Unknown";
        const ticker = token.ticker || "???";
        const launchTime = token.launchTime || "Unknown";
        const image = token.image || "https://placehold.co/600x400?text=TKNZ";
        const xUrl = token.xUrl;
        const tknzUrl = `https://tknz.fun/token/${ticker}`;

        const caption = `
🚀 *New Token Launch on TKNZ!*

🪙 *Name:* ${name}
📈 *Ticker:* $${ticker}
🌐 [View on TKNZ](${tknzUrl})
${xUrl ? `🐦 [View on X](${xUrl})` : ""}
🔗 *Launched:* ${launchTime}
        `.trim();

        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: CHAT_ID,
            message_thread_id: THREAD_ID,
            photo: image,
            caption: caption,
            parse_mode: 'Markdown',
          }),
        });
      }
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
};