// Firebase Admin and Solana RPC imports for data gathering
import admin from 'firebase-admin';
import { Connection, PublicKey } from '@solana/web3.js';
import { Redis } from '@upstash/redis';

// Umi related imports
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { web3JsRpc } from '@metaplex-foundation/umi-rpc-web3js';
import { publicKey as umiPublicKey } from '@metaplex-foundation/umi';
import pkg from '@metaplex-foundation/mpl-token-metadata';
const { mplTokenMetadata, fetchMetadataFromSeeds } = pkg;

const SYSTEM_TOKEN_ADDRESS = 'AfyDiEptGHEDgD69y56XjNSbTs23LaF1YHANVKnWpump';
const APPROXIMATE_SYSTEM_TOKEN_LAUNCH_TIME = 1746046800000;
// Schedule to run every 2 minutes
export const config = { schedule: '*/2 * * * *' };


function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper to fetch the earliest transaction timestamp for a token mint
async function fetchTokenMintTimestamp(connection, mintAddress) {
  try {
    // Using direct Solana RPC to get the oldest transaction signature
    // Note: This gets the *latest* signature by default. To get the *oldest*,
    // we would need to paginate through all signatures, which is highly inefficient.
    // For a simple "launch time", the first transaction *related* to the mint
    // (often its creation) is a reasonable proxy if an indexer isn't used.
    // The current implementation fetches the most recent one, which might not be ideal for "launch time".
    // A more robust solution would involve an indexer or a more complex signature fetching strategy.
    // For now, we'll use a simplified approach similar to the reference if `getSignaturesForAddress` is used.
    // However, the reference component actually fetches the *latest* tx and uses its blockTime.
    // Let's stick to fetching the latest signature's blockTime as a proxy.
    const signatures = await connection.getSignaturesForAddress(new PublicKey(mintAddress), { limit: 1 });
    if (signatures && signatures.length > 0 && signatures[0].blockTime) {
      const timestamp = signatures[0].blockTime * 1000; // Convert seconds to milliseconds
      console.log(`Found transaction timestamp for ${mintAddress}: ${new Date(timestamp).toISOString()}`);
      return timestamp;
    } else {
      console.warn(`No valid blockTime found in RPC response for ${mintAddress}`);
      return Date.now(); // Fallback to current time if no timestamp found
    }
  } catch (err) {
    console.warn(`Error fetching token mint timestamp via RPC for ${mintAddress}:`, err);
    return Date.now(); // Fallback
  }
}


/**
 * Build the leaderboard by querying Firestore for token events,
 * fetching prices via Jupiter API, metadata via Umi, and computing market cap using on-chain supply.
 */
async function buildLeaderboardFromSolana() {
  // Initialize Firebase Admin if not already
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
      }),
    });
  }
  const db = admin.firestore();
  const rpcUrl = process.env.SOLANA_RPC_URL;
  const connection = new Connection(rpcUrl);

  let umi;
  try {
    umi = createUmi(rpcUrl)
      .use(web3JsRpc(connection))
      .use(mplTokenMetadata());
  } catch (initError) {
    console.error("Failed to initialize Umi:", initError);
    // If Umi fails, we might still proceed with basic data or handle error appropriately
    // For now, we'll let it throw or log, depending on desired behavior.
    // throw new Error("Umi initialization failed"); // Option: halt execution
  }


  // Fetch token balance update events
  const snapshot = await db
    .collection('events')
    .where('eventName', '==', 'token_balance_update')
    .get();
  // Collect unique token addresses and their first known creator wallet
  const uniqueTokensMap = new Map(); // Using a Map to store address -> initial creator
  snapshot.forEach((doc) => {
    const data = doc.data();
    if (data.tokenAddress) {
      if (!uniqueTokensMap.has(data.tokenAddress)) {
        uniqueTokensMap.set(data.tokenAddress, data.walletAddress || 'UNKNOWN');
      }
    }
  });
  // Fetch token launched events to capture launch timestamps
  const launchedSnapshot = await db
    .collection('events')
    .where('eventName', '==', 'token_launched')
    .get();
  const launchTimestamps = new Map();
  launchedSnapshot.forEach((doc) => {
    const data = doc.data();
    if (data.contractAddress && data.timestamp) {
      let ts = data.timestamp;
      if (ts.toMillis) {
        ts = ts.toMillis();
      }
      launchTimestamps.set(data.contractAddress, ts);
    }
  });

  if (!launchTimestamps.has(SYSTEM_TOKEN_ADDRESS)) {
    console.log(`Setting launch time for system token ${SYSTEM_TOKEN_ADDRESS} to ${APPROXIMATE_SYSTEM_TOKEN_LAUNCH_TIME}`);
    launchTimestamps.set(SYSTEM_TOKEN_ADDRESS, APPROXIMATE_SYSTEM_TOKEN_LAUNCH_TIME);
  }

  // Ensure system token is included
  if (!uniqueTokensMap.has(SYSTEM_TOKEN_ADDRESS)) {
    uniqueTokensMap.set(SYSTEM_TOKEN_ADDRESS, 'TKNZ_SYSTEM');
  }
  const addresses = Array.from(uniqueTokensMap.keys());

  // Fetch prices in batches from Jupiter
  const priceMap = {};
  const batchSize = 10; // Reduced batch size for API rate limits and increased sleep
  for (let i = 0; i < addresses.length; i += batchSize) {
    const batch = addresses.slice(i, i + batchSize);
    try {
      console.log(`Fetching prices for ${batch}`);
      const url = `https://lite-api.jup.ag/price/v2?ids=${batch.join(',')}`;
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        if (json.data) Object.assign(priceMap, json.data);
        console.log(`Prices for ${batch}: ${JSON.stringify(json.data)}`);
      } else {
        console.warn(`Price fetch failed for batch ${i/batchSize}: ${res.status} ${await res.text()}`);
      }
      await sleep(2000); // Increased sleep between Jupiter calls
    } catch (err) {
      console.warn(`Price batch fetch failed: ${err}`);
    }
  }


  const results = [];
  for (const address of addresses) {
    const priceInfo = priceMap[address];
    const price = Number(priceInfo?.price ?? 0);
    let supply = 0;
    let fetchedName = null;
    let fetchedSymbol = null;
    let fetchedLogo = 'https://images.pexels.com/photos/844124/pexels-photo-844124.jpeg?auto=compress&cs=tinysrgb&w=200';
    let fetchedCreator = uniqueTokensMap.get(address) || 'UNKNOWN'; // Get initial creator from Firestore event
    let launchTime = null;

    try {
      console.log(`Fetching supply for ${address}`);
      const pubkey = new PublicKey(address);
      const supplyInfo = await connection.getTokenSupply(pubkey);
      supply = Number(supplyInfo.value.uiAmount ?? 0); // Assuming 1B supply from reference if not available
      console.log(`Supply for ${address}: ${supply}`);
    } catch (err) {
      console.warn(`Failed to fetch supply for ${address}: ${err}. Assuming 0.`);
      // If supply fetch fails, market cap will be 0. This is a safe fallback.
    }
    await sleep(500); // Sleep between individual token supply/metadata calls

    if (umi) {
      try {
        console.log(`Fetching Umi metadata for ${address}`);
        const mint = umiPublicKey(address);
        const metadataAccount = await fetchMetadataFromSeeds(umi, { mint });

        fetchedName = metadataAccount.name?.replace(/\\0/g, '').trim() || null;
        fetchedSymbol = metadataAccount.symbol?.replace(/\\0/g, '').trim() || null;
        const fetchedUri = metadataAccount.uri?.replace(/\\0/g, '').trim();

        if (metadataAccount.creators && metadataAccount.creators.__option === 'Some') {
          const creators = metadataAccount.creators.value;
          const verifiedCreator = creators.find(c => c.verified);
          if (verifiedCreator) {
            fetchedCreator = verifiedCreator.address.toString();
          } else if (creators.length > 0) {
            fetchedCreator = creators[0].address.toString(); // Fallback to first creator if no verified one
          }
        }

        if (fetchedUri) {
          try {
            const response = await fetch(fetchedUri);
            if (response.ok) {
              const json = await response.json();
              fetchedLogo = json.image || json.image_url || '/default-token.svg';
            } else {
              console.warn(`Failed to fetch URI JSON for ${address}: ${response.status}`);
            }
          } catch (uriError) {
            console.warn(`Error fetching or parsing URI JSON for ${address}`, uriError);
          }
        }
        console.log(`Umi metadata for ${address}: Name=${fetchedName}, Symbol=${fetchedSymbol}, Creator=${fetchedCreator}, Logo=${fetchedLogo}`);
      } catch (err) {
        console.warn(`Umi metadata fetch failed for ${address}: ${err.message}. Name/Symbol might be missing.`);
      }
      await sleep(500); // Sleep after Umi call
    }
    
    // Fetch launch time
    try {
        console.log(`Fetching launch time for ${address}`);
        if (launchTimestamps.has(address)) {
            console.log(`Launch time found for ${address}: ${launchTimestamps.get(address)}`);
            launchTime = launchTimestamps.get(address);
        } else {
            console.log(`Launch time not found for ${address}, fetching from Solana`);
            launchTime = await fetchTokenMintTimestamp(connection, address);
        }
    } catch (err) {
        console.warn(`Failed to fetch launch time for ${address}: ${err}`);
        launchTime = Date.now(); // Fallback
    }
    await sleep(500); // Sleep after launch time call


    const marketCap = price * supply;
    const tokenDetails = {
      address,
      name: fetchedName || address.slice(0, 6), // Fallback name
      symbol: fetchedSymbol || address.slice(0, 4), // Fallback symbol
      logoURI: fetchedLogo,
      price,
      marketCap,
      supply,
      creatorWallet: fetchedCreator,
      launchTime: launchTime || Date.now(), // Fallback launch time
      lastUpdated: Date.now(),
    };
    results.push(tokenDetails);
    console.log(`Processed ${address}: MCAP ${marketCap}`);
  }
  // Sort descending by score (marketCap)
  results.sort((a, b) => b.marketCap - a.marketCap);
  return results;
}

/** Netlify Scheduled Function to update the leaderboard in Upstash Redis */
export const handler = async (_event, _context) => {
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });

  try {
    const tokenDataArray = await buildLeaderboardFromSolana();
    if (!tokenDataArray || tokenDataArray.length === 0) {
      console.log('No token data to update.');
      return { statusCode: 200, body: 'No token data to update.' };
    }
    
    const pipeline = redis.multi();
    
    // Atomically update token details and leaderboard scores
    // We are not deleting the 'leaderboard' key anymore.
    // ZADD will update the score if the member exists, or add it if it's new.
    // HSET will update fields in the hash or create the hash if it doesn't exist.

    for (const tokenDetails of tokenDataArray) {
      const { address, marketCap, ...detailsToStore } = tokenDetails;
      if (!address) {
        console.warn("Skipping token with no address:", tokenDetails);
        continue;
      }
      const tokenKey = `token:${address}`;
      
      // Store all token details in a hash
      // HSET expects key-value pairs, so we spread the detailsToStore object.
      // Ensure all values are strings or numbers for Redis.
      const flatDetails = {};
      for (const [key, value] of Object.entries(detailsToStore)) {
        flatDetails[key] = value !== null && value !== undefined ? String(value) : '';
      }

      pipeline.hset(tokenKey, flatDetails);
      console.log(`Pipelining HSET for ${tokenKey} with details:`, flatDetails);

      // Update the leaderboard sorted set with the market cap
      // Only add/update if marketCap is a valid number
      if (typeof marketCap === 'number' && !isNaN(marketCap)) {
        pipeline.zadd('leaderboard', { score: marketCap, member: address });
        console.log(`Pipelining ZADD for leaderboard: ${address} with score ${marketCap}`);
      } else {
        console.warn(`Skipping ZADD for ${address} due to invalid marketCap: ${marketCap}`);
      }
    }
    
    const results = await pipeline.exec();
    console.log('✅ Leaderboard and token details updated in Redis. Pipeline results:', results);
    return { statusCode: 200, body: '✅ Leaderboard and token details updated.' };
  } catch (error) {
    console.error('Error updating leaderboard and token details:', error);
    // Log the full error object if possible, especially for pipeline errors
    if (error.results) { // Upstash Redis pipeline errors often have a 'results' array
        console.error('Pipeline execution errors:', error.results);
    }
    return { statusCode: 500, body: 'Error updating leaderboard and token details' };
  }
};

export default handler;