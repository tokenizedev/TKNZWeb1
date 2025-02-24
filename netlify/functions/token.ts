import { Handler } from '@netlify/functions'
import axios from 'axios'
import * as cheerio from 'cheerio'
import OpenAI from 'openai'

interface ArticleData {
  title: string
  image: string
  description: string
  url: string
  author?: string
  xUrl?: string
}

const openai = new OpenAI({
    apiKey: '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'
});

const systemPrompt = (prompt: string, level: number) => `You are a blockchain tokenization expert specializing in creating literal and accurate token names for social media content. Your primary goal is to accurately represent the content, especially at Level 0.

### **Level 0 (Most Important - Current level: ${level === 0}):**
- **Core Principle:** 100% literal, no creativity, just facts
- **Name Format:**
  - For tweets with images: Use format "[Subject] Image" (e.g., "Bitcoin Chart Image", "Cat Photo")
  - For text-only tweets: Use 2-4 key words that summarize the main point
- **Ticker:** Direct abbreviation of key words (2-5 chars recommended, but can be up to 15)
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

Output Format:
{
  "name": "Literal Name",
  "ticker": "TICK",
  "description": "Literal Description"
}`;


const extractTweetData = async (url: string): Promise<ArticleData> => {
  try {
    const response = await axios.get(url)
    const $ = cheerio.load(response.data)
    
    // Find tweet container
    const tweetContainer = $('article[data-testid="tweet"]')
    if (!tweetContainer.length) {
      throw new Error('Tweet container not found')
    }

    const tweetText = tweetContainer.find('div[lang]').text() || ''
    const tweetImage = tweetContainer.find('img[alt="Image"]').attr('src') || ''
    const authorName = tweetContainer.find('div[data-testid="User-Name"] span').text() || ''

    return {
      title: tweetText || 'Tweet',
      image: tweetImage,
      description: tweetText,
      author: authorName,
      url: url,
      xUrl: url
    }
  } catch (error) {
    console.error('Error extracting tweet data:', error)
    return {
      title: 'Tweet',
      image: '',
      description: '',
      url: url,
      xUrl: url,
      author: ''
    }
  }
}

const extractArticleData = async (url: string): Promise<ArticleData> => {
  try {
    const response = await axios.get(url)
    const $ = cheerio.load(response.data)
    
    let title = ''
    let image = ''
    let description = ''

    // Extract title
    const titleSelectors = [
      'h1',
      'article h1',
      'meta[property="og:title"]',
      'meta[name="twitter:title"]',
      'title'
    ]

    for (const selector of titleSelectors) {
      const element = $(selector)
      if (element.length) {
        title = element.is('meta') ? element.attr('content') || '' : element.text().trim()
        if (title) break
      }
    }

    // Extract image
    const imageSelectors = [
      'meta[property="og:image"]',
      'meta[name="twitter:image"]',
      'link[rel="image_src"]',
      'article img',
      '.article-content img',
      '.post-content img'
    ]

    for (const selector of imageSelectors) {
      const element = $(selector)
      if (element.length) {
        let imgSrc = element.is('meta') ? element.attr('content') || '' : element.attr('src') || ''
        
        if (imgSrc) {
          try {
            if (!imgSrc.startsWith('http')) {
              imgSrc = new URL(imgSrc, url).href
            }
            image = imgSrc
            break
          } catch (e) {
            console.warn('Invalid image URL:', imgSrc)
            continue
          }
        }
      }
    }

    // Extract description
    const descriptionSelectors = [
      'meta[name="description"]',
      'meta[property="og:description"]',
      'meta[name="twitter:description"]',
      'article p',
      '.article-content p',
      '.post-content p'
    ]

    for (const selector of descriptionSelectors) {
      const element = $(selector)
      if (element.length) {
        description = element.is('meta') ? element.attr('content') || '' : element.text().trim()
        if (description) break
      }
    }

    // Get canonical URL
    const canonicalUrl = $('link[rel="canonical"]').attr('href')
    const ogUrl = $('meta[property="og:url"]').attr('content')
    
    const finalUrl = canonicalUrl || ogUrl || url

    return {
      title: title || 'Untitled Article',
      image,
      description,
      url: finalUrl
    }
  } catch (error) {
    console.error('Error extracting article data:', error)
    return {
      title: 'Untitled Article',
      image: '',
      description: '',
      url: url
    }
  }
}

export const handler: Handler = async (event) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    }
  }

  try {
    const { url, level = 1 } = JSON.parse(event.body || '{}')

    if (!url) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'URL is required' })
      }
    }

    // Check if it's a Twitter/X post
    const isXPost = url.includes('x.com') || url.includes('twitter.com')
    
    const data = isXPost 
      ? await extractTweetData(url)
      : await extractArticleData(url)
    const { title, description: articleDesc } = data
    const prompt = `Article Title: ${title}\nDescription: ${articleDesc}\nType: ${isXPost ? 'Social Media Post' : 'News Article'}\n\nGenerate a ${isXPost ? 'tweet-based' : 'news-based'} meme coin.`;
    const generatedPrompt = systemPrompt(prompt, level)

    const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: generatedPrompt },
          { role: "user", content: prompt }
        ],
        temperature: 0.7 + (level * 0.1) // Increase creativity with level
    });

    const response = completion.choices[0]?.message?.content;

    if (!response) {
        throw new Error('No response from AI');
    }

    try {
        JSON.parse(response)
    } catch (error) {
        console.error('Error parsing response:', error)
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Error parsing response' })
        }
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json'
      },
      body: response
    }

  } catch (error) {
    console.error('Error processing request:', error)
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    }
  }
} 