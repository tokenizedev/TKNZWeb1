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
 * Supports sorting via `?sortBy=` query parameter (`marketCap` or `launchTime`).
 */
const createLeaderboardHandler = (redisClient) => {
  return async (event, _context) => {
    try {
      // Pagination parameters
      const pageParam = event.queryStringParameters?.page;
      let page = pageParam ? parseInt(pageParam, 10) : 1;
      if (isNaN(page) || page < 1) page = 1;
      const perPage = 25;
      const start = (page - 1) * perPage;
      const end = start + perPage - 1;

      // Sorting parameter
      const sortByParam = event.queryStringParameters?.sortBy;
      let sortBy = 'marketCap'; // Default sort option
      if (sortByParam) {
        const normalizedSortBy = sortByParam.toLowerCase();
        if (normalizedSortBy === 'launchtime') {
          sortBy = 'launchTime';
        } // 'marketcap' is already the default, no explicit check needed.
          // Invalid values will use the default 'marketCap'.
      }

      let redisKey = 'leaderboard'; // Default for marketCap
      let scoreField = 'marketCap'; // The field in 'item' that holds the score from the sorted set

      if (sortBy === 'launchTime') {
        redisKey = 'leaderboard:launchTime'; // Assumes this sorted set exists, with scores as timestamps
        scoreField = 'launchTime';
      }

      // Fetch members and scores in descending order using zrange with rev and withScores
      const pipeline = redisClient.pipeline();
      // Always fetch in descending order: highest market cap, or newest launch time
      pipeline.zrange(
        redisKey,
        start,
        end,
        { rev: true, withScores: true }
      );
      const pipelineResults = await pipeline.exec();

      // Check if pipeline execution itself failed or returned unexpected structure
      if (!pipelineResults || !Array.isArray(pipelineResults) || pipelineResults.length === 0) {
        console.error('Pipeline execution failed or returned an invalid structure.');
        return {
          statusCode: 500,
          body: JSON.stringify({ error: 'Failed to fetch leaderboard data from Redis (pipeline error).' }),
        };
      }

      const zrangeResult = pipelineResults[0];

      // Check if the zrange command within the pipeline resulted in an error
      if (zrangeResult instanceof Error) {
        console.error(`Error in zrange command ('${redisKey}') within pipeline:`, zrangeResult.message);
        return {
          statusCode: 500,
          body: JSON.stringify({ error: `Failed to fetch leaderboard data from Redis (zrange error: ${zrangeResult.message}).` }),
        };
      }

      // Check if zrangeResult is null or not an array
      if (zrangeResult === null || !Array.isArray(zrangeResult)) {
        console.warn(`Sorted set '${redisKey}' might not exist or zrange returned an unexpected type. Result:`, zrangeResult);
        // Treat as empty list for robustness
        return {
          statusCode: 200,
          body: JSON.stringify({ sortBy, page, perPage, entries: [] }),
        };
      }
      
      const raw = zrangeResult; // raw is now guaranteed to be an array

      // If raw is an empty array (key exists but no members in range, or key is empty)
      if (raw.length === 0) {
        return {
          statusCode: 200,
          body: JSON.stringify({ sortBy, page, perPage, entries: [] }),
        };
      }
      
      const membersWithScores = [];
      for (let i = 0; i < raw.length; i += 2) {
        const memberData = { address: String(raw[i]) };
        // Dynamically assign the score to the correct field based on sortBy
        memberData[scoreField] = Number(raw[i + 1]);
        membersWithScores.push(memberData);
      }

      if (membersWithScores.length === 0) { // Should be caught by raw.length === 0, but as a safeguard
        return {
          statusCode: 200,
          body: JSON.stringify({ sortBy, page, perPage, entries: [] }),
        };
      }

      const detailsPipeline = redisClient.pipeline(); // Use pipeline for batching HGETALL
      membersWithScores.forEach(item => {
        detailsPipeline.hgetall(`token:${item.address}`);
      });

      const hashResults = await detailsPipeline.exec();

      const detailedEntries = membersWithScores.map((item, index) => {
        const rawDetails = hashResults[index];
        // item contains { address: String, [scoreField]: Number }
        // e.g., if sortBy is 'marketCap', item is { address: "...", marketCap: 12345 }
        // e.g., if sortBy is 'launchTime', item is { address: "...", launchTime: 1625097600 }

        if (rawDetails === null || typeof rawDetails !== 'object' || rawDetails instanceof Error) {
          if (rawDetails instanceof Error) {
            console.warn(`Error fetching hash details for token: ${item.address}: ${rawDetails.message}`);
          } else {
            console.warn(`No hash details found or invalid format for token: ${item.address}`);
          }
          return {
            address: item.address,
            marketCap: sortBy === 'marketCap' ? item.marketCap : 0, // Use score if sorting by marketCap, else default
            launchTime: sortBy === 'launchTime' ? item.launchTime : 0, // Use score if sorting by launchTime, else default
            name: 'Unknown',
            symbol: '???',
            logoURI: '/default-token.svg', 
            price: 0,
            supply: 0,
            creatorWallet: 'UNKNOWN',
            lastUpdated: 0,
            detailsMissing: true,
          };
        }

        // Parse specific fields from strings (as stored in Redis hash) to numbers
        // The scoreField (marketCap or launchTime) from the sorted set (item[scoreField]) is authoritative for that field.
        const entry = {
          address: item.address,
          name: rawDetails.name || 'Unknown',
          symbol: rawDetails.symbol || '???',
          logoURI: rawDetails.logoURI || '/default-token.svg',
          price: parseFloat(rawDetails.price) || 0,
          supply: parseFloat(rawDetails.supply) || 0,
          creatorWallet: rawDetails.creatorWallet || 'UNKNOWN',
          lastUpdated: parseInt(rawDetails.lastUpdated, 10) || 0,
          // Assign marketCap based on sorting:
          // If sorting by marketCap, item.marketCap is authoritative.
          // If sorting by launchTime, get marketCap from rawDetails.
          marketCap: sortBy === 'marketCap' 
            ? item.marketCap 
            : (parseFloat(rawDetails.marketCap) || 0),
          // Assign launchTime based on sorting:
          // If sorting by launchTime, item.launchTime is authoritative.
          // If sorting by marketCap, get launchTime from rawDetails.
          launchTime: sortBy === 'launchTime'
            ? item.launchTime
            : (parseInt(rawDetails.launchTime, 10) || 0),
        };
        return entry;
      });

      return {
        statusCode: 200,
        body: JSON.stringify({ sortBy, page, perPage, entries: detailedEntries }),
      };
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Internal Server Error', details: error.message }),
      };
    }
  };
};

// Export Netlify function handler
// Wrap the base handler to add CORS headers
const baseHandler = createLeaderboardHandler(redis);

export const handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers
    };
  }

  const response = await baseHandler(event, context);
  return {
    ...response,
    headers
  };
};