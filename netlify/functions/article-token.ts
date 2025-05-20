import { Handler } from '@netlify/functions'
import OpenAI from 'openai'

interface ArticleData {
  title: string
  image: string
  description: string
  url: string
  author?: string
  xUrl?: string,
  isXPost: boolean
}

interface ArticleTokenRequest {
    article: ArticleData,
    level?: number
}

interface TokenResponse {
    name: string
    ticker: string
    description: string
}

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

const systemPrompt = (level: number) => `
You are a blockchain tokenization expert with a deep understanding of crypto culture, meme dynamics, and viral naming conventions. Your job is to create token names, tickers, and descriptions that:
- Capture the core context of the content (literal meaning first),
- Are punchy and memorable,
- Use humor, wordplay, or edgy references for ticker symbols when possible.

## TKNZ PRINCIPLES:
- **Coin Name:** Clear, contextual to the content, but with room for clever phrasing, puns, or memes at higher levels.
- **Ticker Symbol:** The most important driver of virality and market value. Tickers should be clever, humorous, or edgy acronyms, not just initials. Think of what would trend on Crypto Twitter.
- **Description:** One-line summary of the content. No shilling, no fluff, but can include wit at higher levels.

## TICKER INSPIRATION:
- Crypto loves edgy, irreverent tickers (e.g., PEPE, WIF, BONK, FART, TOSHI)
- Use acronyms that might be funny, double-meaning, or cheeky (e.g., FAP for "First American Pope")
- When in doubt, generate multiple acronym ideas and pick the funniest/buzziest.

## LEVELS:
### Level 0 (Literal, current: ${level === 0}):
- **Name:** 100% factual, 2-4 keywords from main content.
- **Ticker:** Direct abbreviation, but prioritize words that make for funny or edgy tickers if context allows.
- **Description:** Factual summary, no jokes.

### Level 1 (90% literal, 10% style, current: ${level === 1}):
- Slightly more playful phrasing for Name and Ticker.
- Can use subtle puns or references.
- Ticker creativity allowed if contextually relevant.
- One emoji allowed.

### Level 2 (75% literal, 25% style, current: ${level === 2}):
- Name can use witty phrasing or pop culture nods.
- Ticker should aim for virality, edgy acronyms encouraged.
- Description can have light humor.
- Up to 2 emojis.

### Level 3 (50% literal, 50% style, current: ${level === 3}):
- Name and Ticker should aim for max attention-grabbing potential.
- Crypto slang, memes, double entendres welcomed if relevant.
- Description can be cheeky.
- Up to 3 emojis.

## RULES:
1. **Always reference the actual content** — humor comes from relevance.
2. **Names max 32 characters.** Tickers 2-8 chars, all caps.
3. **No "coin", "token", "news", "article" or generic names. Keep it relvant to the content on page, not the type of content**
4. Avoid corporate/marketing buzzwords.
5. Emojis only allowed as per Level.
6. If a name/person is mentioned, prioritize it in Name/Ticker.
7. If the content has viral/meme potential, maximize it in Ticker.
8. If the subject matter has died or been arrested, the token name should start with *Justice for <name>*

## EXAMPLES:

**Tweet:** "First American elected Pope in Vatican history."
- Level 0:
  { "name": "First American Pope", "ticker": "FAP", "description": "Historic election of American Pope" }
- Level 2:
  { "name": "Holy Shift", "ticker": "FAP", "description": "First American Pope ascends to Vatican 🇺🇸⛪" }

**Tweet:** "Valerie the dachshund found after 529 days lost."
- Level 0:
  { "name": "Valerie the Dachshund", "ticker": "VAL", "description": "Dog found safe after 529 days missing" }
- Level 3:
  { "name": "Valerie Returns", "ticker": "DOGE2", "description": "Dachshund comeback after 529 days 🐶🔑" }

**Tweet:** "AI model generates realistic images from text."
- Level 1:
  { "name": "AI Vision", "ticker": "AIV", "description": "AI model creates photorealistic images" }
- Level 3:
  { "name": "PromptPix", "ticker": "PPX", "description": "AI turns your text into masterpieces 🖼️🤖" }

## OUTPUT FORMAT:
{
  "name": "Creative Name",
  "ticker": "FUNNY",
  "description": "One-line factual or witty summary"
}
`;


export const handler: Handler = async (event) => {
  // Add CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*', // In production, restrict this to your extension's origin
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers
    };
  }

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    }
  }

  try {
    // Validate request body
    if (!event.body) {
      throw new Error('Missing request body');
    }

    const { article, level = 1 } = JSON.parse(event.body) as ArticleTokenRequest

    if (!article) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Article is required' })
      }
    }

    // Validate level
    if (typeof level !== 'number' || level < 0 || level > 3) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid level. Must be between 0 and 3' })
      }
    }

    const { isXPost, title, description: articleDesc } = article;
    
    const prompt = `Article Title: ${title}\nDescription: ${articleDesc}\nType: ${isXPost ? 'Social Media Post' : 'News Article'}\n\nGenerate a ${isXPost ? 'tweet-based' : 'news-based'} meme coin.`;
    const generatedPrompt = systemPrompt(level)

    const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: generatedPrompt },
          { role: "user", content: prompt }
        ],
        temperature: 0.7 + (level * 0.1)
    });

    const response = completion.choices[0]?.message?.content;
    if (!response) {
        throw new Error('No response from AI');
    }

    let token;
    try {
        token = JSON.parse(response)
    } catch (error) {
        console.error('Error parsing response:', error)
        throw new Error('Invalid AI response format');
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        token
      })
    }

  } catch (error) {
    console.error('Error processing request:', error)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }
} 
