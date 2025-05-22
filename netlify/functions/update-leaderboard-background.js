// Firebase Admin and Solana RPC imports for data gathering
import admin from 'firebase-admin';
import { Connection, PublicKey } from '@solana/web3.js';
import { Redis } from '@upstash/redis';

// Umi related imports
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { web3JsRpc } from '@metaplex-foundation/umi-rpc-web3js';
import { publicKey as umiPublicKey } from '@metaplex-foundation/umi';
import pkg from '@metaplex-foundation/mpl-token-metadata';
// Destructure necessary functions for metadata handling
const { mplTokenMetadata, fetchMetadataFromSeeds, deserializeMetadata } = pkg;

const SYSTEM_TOKEN_ADDRESS = 'AfyDiEptGHEDgD69y56XjNSbTs23LaF1YHANVKnWpump';
const APPROXIMATE_SYSTEM_TOKEN_LAUNCH_TIME = 1746046800000;

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

  // Fetch prices for tokens via Jupiter Datapi endpoint (batch multi-query)
  const priceMap = {};
  const priceBatchSize = 10;
  for (let i = 0; i < addresses.length; i += priceBatchSize) {
    const batch = addresses.slice(i, i + priceBatchSize);
    console.log(`Fetching price data from Datapi for batch: ${batch}`);
    try {
      const url = `https://datapi.jup.ag/v1/assets/search?query=${batch.join(',')}&sortBy=verified`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        // API may return an array or { data: [] }
        const assets = Array.isArray(data) ? data : Array.isArray(data.data) ? data.data : [];
        // Map each returned asset to its price
        assets.forEach(asset => {
          const id = asset.id;
          const price = Number(asset.usdPrice ?? asset.price ?? asset.priceUsd ?? 0);
          // Use the Datapi-provided market cap if available
          const marketCapValue = Number(asset.mcap ?? asset.mcapUsd ?? asset.fdv ?? 0);
          priceMap[id] = { price, marketCap: marketCapValue };
        });
        // Ensure missing tokens get a default price of zero
        batch.forEach(addr => {
          if (priceMap[addr] === undefined) {
            console.warn(`No price/mcap data from Datapi for ${addr}`);
            priceMap[addr] = { price: 0, marketCap: 0 };
          }
        });
        console.log(`Datapi prices:`, Object.entries(priceMap)
          .filter(([id]) => batch.includes(id))
          .map(([id, info]) => ({ id, price: info.price }))
        );
      } else {
        console.warn(`Datapi batch fetch failed: ${res.status} ${await res.text()}`);
        batch.forEach(addr => priceMap[addr] = { price: 0 });
      }
    } catch (err) {
      console.warn(`Error fetching Datapi batch for ${batch}:`, err);
      batch.forEach(addr => priceMap[addr] = { price: 0 });
    }
    // Throttle between batches
    await sleep(2000);
  }

  // Batch fetch token supplies to reduce RPC calls
  console.log('Batch fetching token supplies');
  const supplyMap = {};
  const supplyBatchSize = 20;
  for (let i = 0; i < addresses.length; i += supplyBatchSize) {
    const batch = addresses.slice(i, i + supplyBatchSize);
    console.log(`Fetching supplies for ${batch.length} tokens`);
    const requests = batch.map((address, idx) => ({
      jsonrpc: '2.0',
      id: idx,
      method: 'getTokenSupply',
      params: [address],
    }));
    try {
      const res = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requests),
      });
      if (!res.ok) {
        console.warn(`Batch supply fetch failed: ${res.status}`);
        batch.forEach(addr => supplyMap[addr] = 0);
        continue;
      }
      const json = await res.json();
      json.forEach(r => {
        const idx = r.id;
        const addr = batch[idx];
        const uiAmount = r.result?.value?.uiAmount;
        const val = Number(uiAmount ?? 0);
        supplyMap[addr] = val;
        console.log(`Supply for ${addr}: ${val}`);
      });
    } catch (err) {
      console.warn(`Batch supply fetch error: ${err}`);
      batch.forEach(addr => supplyMap[addr] = 0);
    }
    await sleep(10_000); // throttle between batch RPC calls
  }

  // Batch fetch metadata for all tokens
  console.log('Batch fetching metadata for tokens');
  const metadataBatchSize = 50;
  const metadataMap = {};
  const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
  for (let i = 0; i < addresses.length; i += metadataBatchSize) {
    const batch = addresses.slice(i, i + metadataBatchSize);
    const pdas = await Promise.all(batch.map(addr =>
      PublicKey.findProgramAddress(
        [Buffer.from('metadata'), METADATA_PROGRAM_ID.toBuffer(), new PublicKey(addr).toBuffer()],
        METADATA_PROGRAM_ID
      ).then(([pda]) => pda)
    ));
    const infos = await connection.getMultipleAccountsInfo(pdas);
    infos.forEach((info, idx) => {
      const addr = batch[idx];
      if (info?.data) {
        try {
          // Decode metadata using generated deserializer
          const md = deserializeMetadata(info);
          metadataMap[addr] = {
            name: md.name.replace(/\0/g, '').trim(),
            symbol: md.symbol.replace(/\0/g, '').trim(),
            uri: md.uri.replace(/\0/g, '').trim(),
            creators: md.creators,
          };
        } catch (e) {
          console.warn(`Failed to decode metadata for ${addr}`, e);
          metadataMap[addr] = null;
        }
      } else {
        console.warn(`Metadata account not found for ${addr}`);
        metadataMap[addr] = null;
      }
    });
    await sleep(5000);
  }

  // Bulk fetch missing launch timestamps via RPC batching
  const missingLaunchAddrs = addresses.filter(addr => !launchTimestamps.has(addr));
  const launchBatchSize = 20;
  for (let i = 0; i < missingLaunchAddrs.length; i += launchBatchSize) {
    const batchAddrs = missingLaunchAddrs.slice(i, i + launchBatchSize);
    const requests = batchAddrs.map((addr, idx) => ({
      jsonrpc: '2.0',
      id: idx,
      method: 'getSignaturesForAddress',
      params: [addr, { limit: 1 }],
    }));
    console.log(`Batch fetching launch timestamps for tokens: ${batchAddrs}`);
    try {
      const res = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requests),
      });
      if (res.ok) {
        const json = await res.json();
        json.forEach(rpcRes => {
          const idxLocal = rpcRes.id;
          const addrLocal = batchAddrs[idxLocal];
          const sigs = rpcRes.result || [];
          if (Array.isArray(sigs) && sigs.length > 0 && sigs[0].blockTime) {
            const tsMs = sigs[0].blockTime * 1000;
            launchTimestamps.set(addrLocal, tsMs);
            console.log(`Launch time for ${addrLocal}: ${new Date(tsMs).toISOString()}`);
          } else {
            launchTimestamps.set(addrLocal, Date.now());
          }
        });
      } else {
        console.warn(`Batch launch timestamp fetch failed: ${res.status} ${await res.text()}`);
        batchAddrs.forEach(addrLocal => launchTimestamps.set(addrLocal, Date.now()));
      }
    } catch (err) {
      console.warn(`Error fetching launch timestamps batch: ${err}`);
      batchAddrs.forEach(addrLocal => launchTimestamps.set(addrLocal, Date.now()));
    }
    await sleep(5000);
  }

  const results = [];
  for (const address of addresses) {
    const priceInfo = priceMap[address];
    const price = Number(priceInfo?.price ?? 0);
    const supply = supplyMap[address] ?? 0;
    let fetchedName = null;
    let fetchedSymbol = null;
    let fetchedLogo = 'https://images.pexels.com/photos/844124/pexels-photo-844124.jpeg?auto=compress&cs=tinysrgb&w=200';
    let fetchedCreator = uniqueTokensMap.get(address) || 'UNKNOWN'; // Get initial creator from Firestore event
    let launchTime = null;

    // Apply batched metadata
    const meta = metadataMap[address];
    if (meta) {
      fetchedName = meta.name;
      fetchedSymbol = meta.symbol;
      const fetchedUri = meta.uri;
      try {
        const response = await fetch(fetchedUri);
        if (response.ok) {
          const json = await response.json();
          fetchedLogo = json.image || json.image_url || '/default-token.svg';
        } else {
          console.warn(`Failed to fetch URI JSON for ${address}: ${response.status}`);
        }
      } catch (e) {
        console.warn(`Error fetching URI JSON for ${address}`, e);
      }
    }

    // Determine launch time from pre-fetched timestamps
    launchTime = launchTimestamps.get(address) ?? Date.now();


    // Use Datapi-provided marketCap, fallback to price * supply
    const marketCap = Number(priceInfo?.marketCap ?? price * supply);
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
export const handler = async (event, _context) => {  
  // Determine dry-run mode: skip Redis writes if enabled
  const dryRun = event.dryRun === true || event.dryRun === 'true' || process.env.DRY_RUN === 'true';
  if (dryRun) {
    console.log('Dry run mode enabled: will not write to Redis.');
  }

  try {
    const tokenDataArray = await buildLeaderboardFromSolana();
    if (!tokenDataArray || tokenDataArray.length === 0) {
      console.log('No token data to update.');
      return { statusCode: 200, body: 'No token data to update.' };
    }
    // If dry-run, output the data and exit without writing to Redis
    if (dryRun) {
      console.log('Dry run result, token data array:', tokenDataArray);
      return { statusCode: 200, body: JSON.stringify({ dryRun: true, tokens: tokenDataArray }) };
    }
    // Initialize Redis client for real execution
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
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

      // Update the leaderboard:launchTime sorted set with the launchTime
      // Only add/update if launchTime is a valid number
      const launchTime = tokenDetails.launchTime; // Explicitly get launchTime for clarity
      if (typeof launchTime === 'number' && !isNaN(launchTime)) {
        pipeline.zadd('leaderboard:launchTime', { score: launchTime, member: address });
        console.log(`Pipelining ZADD for leaderboard:launchTime: ${address} with score ${launchTime}`);
      } else {
        console.warn(`Skipping ZADD for leaderboard:launchTime for ${address} due to invalid launchTime: ${launchTime}`);
      }
      await sleep(5000);
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