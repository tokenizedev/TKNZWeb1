// Handler type import removed for runtime compatibility
import { Redis } from '@upstash/redis';

// Initialize Upstash Redis client
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

/**
 * Create a Netlify Function handler for the leaderboard endpoint.
 * Supports pagination via `?page=` query parameter, 25 items per page.
 */
const createLeaderboardHandler = (redisClient) => {
  return async (event, _context) => {
    try {
      //console.log('redisClient', redisClient)
      const pageParam = event.queryStringParameters?.page;
      let page = pageParam ? parseInt(pageParam, 10) : 1;
      if (isNaN(page) || page < 1) page = 1;
      const perPage = 25;
      const start = (page - 1) * perPage;
      const end = start + perPage - 1;

      // Fetch members and scores in descending order using zrange with rev and withScores
      const pipeline = redisClient.pipeline();
      pipeline.zrange(
        'leaderboard',
        start,
        end,
        { rev: true, withScores: true }
      );
      const pipelineResults = await pipeline.exec();

      if (!pipelineResults || pipelineResults.length === 0) {
        console.error('Pipeline execution failed or returned no results for zrevrange');
        // Optionally, return an error response or throw, depending on desired handling
        return {
          statusCode: 500,
          body: JSON.stringify({ error: 'Failed to fetch leaderboard data from Redis pipeline' }),
        };
      }
      const raw = pipelineResults[0]; // Result of the zrevrange command

      const membersWithScores = [];
      for (let i = 0; i < raw.length; i += 2) {
        membersWithScores.push({ address: String(raw[i]), marketCap: Number(raw[i + 1]) });
      }

      if (membersWithScores.length === 0) {
        return {
          statusCode: 200,
          body: JSON.stringify({ page, perPage, entries: [] }),
        };
      }

      const detailsPipeline = redisClient.pipeline(); // Use pipeline for batching HGETALL
      membersWithScores.forEach(item => {
        detailsPipeline.hgetall(`token:${item.address}`);
      });

      const hashResults = await detailsPipeline.exec();

      const detailedEntries = membersWithScores.map((item, index) => {
        const rawDetails = hashResults[index];

        if (rawDetails === null || typeof rawDetails !== 'object') {
          console.warn(`No hash details found or invalid format for token: ${item.address}`);
          return {
            address: item.address,
            marketCap: item.marketCap,
            name: 'Unknown',
            symbol: '???',
            logoURI: '/default-token.svg', // Ensure this path is correct
            price: 0,
            supply: 0,
            creatorWallet: 'UNKNOWN',
            launchTime: 0,
            lastUpdated: 0,
            detailsMissing: true,
          };
        }

        // Parse specific fields from strings (as stored in Redis hash) to numbers
        // The marketCap from the sorted set (item.marketCap) is authoritative.
        // Fields in rawDetails are all strings.
        const parsedDetails = {
          name: rawDetails.name || 'Unknown',
          symbol: rawDetails.symbol || '???',
          logoURI: rawDetails.logoURI || '/default-token.svg',
          price: parseFloat(rawDetails.price) || 0,
          supply: parseFloat(rawDetails.supply) || 0,
          creatorWallet: rawDetails.creatorWallet || 'UNKNOWN',
          launchTime: parseInt(rawDetails.launchTime, 10) || 0,
          lastUpdated: parseInt(rawDetails.lastUpdated, 10) || 0,
        };
        
        // The marketCap from item.marketCap is the score from the sorted set and is authoritative.
        // Do not use marketCap from rawDetails if it exists, to avoid conflict.

        return {
          address: item.address,
          marketCap: item.marketCap,
          ...parsedDetails,
        };
      });

      return {
        statusCode: 200,
        body: JSON.stringify({ page, perPage, entries: detailedEntries }),
      };
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Internal Server Error' }),
      };
    }
  };
};

// Export Netlify function handler
export const handler = createLeaderboardHandler(redis);