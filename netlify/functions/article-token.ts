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

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

const systemPrompt = (level: number) => `You are a blockchain tokenization expert specializing in creating literal and accurate token names for social media content. Your primary goal is to accurately represent the content, especially at Level 0.
### **Level 0 (Most Important - Current level: ${level === 0}):**
- **Core Principle:** 100% literal, no creativity, just facts
- **Name Format:**
  - For tweets with images: Use format "[Subject] Image" (e.g., "Bitcoin Chart Image", "Cat Photo")
  - For text-only tweets: Use 2-4 key words that summarize the main point
- **Ticker:** Direct abbreviation of key words (2-6 chars recommended, but can be up to 15)
- **Description:**
  - Long tweets (>100 chars): Summarize the key point in one clear sentence
  - Short tweets: Use the exact tweet text
  - Remove hashtags and @mentions
- **Absolutely NO:**
  - Emojis
  - Meme references
  - Crypto slang
  - Marketing language
  - Exclamation marks
- **Example:**
  Tweet: "Just deployed our new AI model that can generate photorealistic images from text descriptions! #AI #Tech"
  Output:
  {
    "name": "AI Model Deployment",
    "ticker": "AIMD",
    "description": "Announcement of new AI model deployment for text-to-image generation"
  }

### **Level 1 (Current level: ${level === 1}):**
- 90% literal content, 10% style
- One emoji maximum
- Keep focus on the actual content
- Example:
  {
    "name": "AI Vision Launch",
    "ticker": "AIVL",
    "description": "New AI model transforms text into photorealistic images ✨"
  }

### **Level 2 (Current level: ${level === 2}):**
- 75% literal content, 25% style
- Two emojis maximum
- Example:
  {
    "name": "AI Creator Pro",
    "ticker": "AIC",
    "description": "Text-to-image AI technology revolutionizing digital art 🎨 🤖"
  }

### **Level 3 (Current level: ${level === 3}):**
- 50% literal content, 50% style
- Three emojis maximum
- Example:
  {
    "name": "AI Pixel Magic",
    "ticker": "MAGIC",
    "description": "Turn your words into masterpieces with our new AI! 🎨 ✨ 🚀"
  }

### **Critical Rules:**
1. Level 0 must be COMPLETELY LITERAL - no creative elements
2. All levels must clearly reference the actual content
3. Never use generic names
4. Ticker suggestions should be 2-5 characters, all caps (though user can input up to 15)
5. No "coin" or "token" words
6. For Level 0, if it's a retweet or quote tweet, focus on the quoted content
7. For Level 0, if there's an image, explicitly mention it in the name
8. If there is a name used in the headline or byline of a story or in a tweet, the name should be used in the ticker and title of the coin. ie: 
"Valerie the dachshund is found safe and well after 529 days on the run on South Australian island" Should output "name": "Valerie the Daschund", "ticker": "VAL"
9. Specifically and only for the https://tknz.fun or www.tknz.fun website, override any settings and use the following outputs (please output correctly for the extension to use as inputs):
"name": "TKNZ.Fun",
"ticker: "TKNZ",
"description": "Tokenize Anything, Tokenize Everything. TKNZ empowers users to create their own tokens on Pump.fun directly from any web page or social media post. With this tool, the friction of launching a token is removed. No need to copy paste links or images. Just one click and the content is tokenized onto the blockchain forever!",
"image": "https://tknz.fun/assets/hero.png",
"xURL": "https://x.com/tknzfun",
"url": "https://tknz.fun",

Output Format:
{
  "name": "Literal Name",
  "ticker": "TICK",
  "description": "Literal Description"
}`;

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
