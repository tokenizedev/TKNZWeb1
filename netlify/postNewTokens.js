const fetch = require('node-fetch');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const THREAD_ID = 20934;
const API_URL = 'https://tknz.fun/.netlify/functions/leaderboard?sortBy=launchTime&page=1';

let lastLaunchTimeCache = null;

exports.handler = async function () {
  try {
    const response = await fetch(API_URL);
    const data = await response.json();
    const tokens = data.entries;

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
        const symbol = token.symbol || "???";
        const address = token.address || "N/A";
        const logo = token.logoURI || "https://placehold.co/600x400?text=TKNZ";
        const launchTime = token.launchTime || "Unknown";
        const pumpUrl = `https://pump.fun/coin/${address}`;
        const xUrl = token.xUrl || null;
        const url = token.url || null;
        const description = token.description || null;
        const creatorShort = token.creatorWallet ? `\`${token.creatorWallet.slice(0, 6)}...${token.creatorWallet.slice(-4)}\`` : "N/A";

        let caption = `
🚀 *New Token Launch on TKNZ!*

🪙 *Name:* ${name}
📈 *Ticker:* $${symbol}
🌐 [View on Pump.fun](${pumpUrl})
🔗 *Launched:* ${launchTime}
🧠 *Creator:* ${creatorShort}
        `.trim();

        if (description) caption += `\n📝 ${description}`;
        if (url) caption += `\n🔗 [Website](${url})`;
        if (xUrl) caption += `\n🐦 [View on X](${xUrl})`;

        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: CHAT_ID,
            message_thread_id: THREAD_ID,
            photo: logo,
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