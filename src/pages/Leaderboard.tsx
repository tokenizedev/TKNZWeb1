import React, { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Search, ArrowUpDown } from 'lucide-react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';

interface TokenEvent {
  tokenAddress: string;
  walletAddress: string;
  timestamp: string | null;
  balance: number | null;
}

interface TokenInfo {
  address: string;
  name: string;
  symbol: string;
  logoURI: string;
  price: number;
  marketCap: number;
  creatorWallet: string;
  launchTime: number;
}

function Leaderboard() {
  const [tokens, setTokens] = useState<TokenInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'mc'>('mc');
  const [error, setError] = useState<string | null>(null);

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const fetchTokenDetails = async (): Promise<any[]> => {
    try {
      const res = await fetch('https://token.jup.ag/all');
      const data = await res.json();
      return data;
    } catch (err) {
      console.error("Failed to fetch token details", err);
      return [];
    }
  };

  const fetchFromGeckoTerminal = async (address: string): Promise<any | null> => {
    try {
      const response = await fetch(`https://api.geckoterminal.com/api/v2/search/pump?query=${address}`);
      const json = await response.json();
      const match = json?.data?.find((item: any) => item?.attributes?.contract_address === address);
      if (!match) return null;
      const tokenData = match.attributes;
      const metadata = {
        address,
        name: tokenData.name,
        symbol: tokenData.symbol,
        logoURI: tokenData.image_url || '/default-token.svg',
        createdAt: new Date(tokenData.created_at).getTime(),
      };
      console.log(`Gecko Metadata for ${address}:`, metadata);
      return metadata;
    } catch (err) {
      console.warn(`Gecko fetch failed for ${address}`, err);
      return null;
    }
  };

  const fetchTokenPricesInBatches = async (addresses: string[], batchSize = 10) => {
    const priceMap: Record<string, any> = {};

    for (let i = 0; i < addresses.length; i += batchSize) {
      const batch = addresses.slice(i, i + batchSize);
      try {
        const url = `https://lite-api.jup.ag/price/v2?ids=${batch.join(',')}`;
        const res = await fetch(url);
        const json = await res.json();
        if (json?.data) {
          Object.assign(priceMap, json.data);
        }
      } catch (err) {
        console.warn(`Batch ${i / batchSize} failed`, err);
      }
      await sleep(500);
    }

    return priceMap;
  };

  useEffect(() => {
    const loadTokens = async () => {
      try {
        const eventsQuery = query(
          collection(db, 'events'),
          where('eventName', '==', 'token_balance_update')
        );

        const snapshot = await getDocs(eventsQuery);
        const events: TokenEvent[] = [];

        snapshot.forEach((doc) => {
          const data = doc.data();
          if (data.tokenAddress && data.walletAddress) {
            events.push({
              tokenAddress: data.tokenAddress,
              walletAddress: data.walletAddress,
              timestamp: data.timestamp || null,
              balance: data.balance || null,
            });
          }
        });

        const uniqueTokensMap: Record<string, string> = {};
        for (const event of events) {
          uniqueTokensMap[event.tokenAddress] = event.walletAddress;
        }

        if (!uniqueTokensMap['AfyDiEptGHEDgD69y56XjNSbTs23LaF1YHANVKnWpump']) {
          uniqueTokensMap['AfyDiEptGHEDgD69y56XjNSbTs23LaF1YHANVKnWpump'] = 'TKNZ_SYSTEM';
        }

        const tokenAddresses = Object.keys(uniqueTokensMap);
        const [allTokenMetadata, priceMap] = await Promise.all([
          fetchTokenDetails(),
          fetchTokenPricesInBatches(tokenAddresses),
        ]);

        const tokenInfos = await Promise.all(tokenAddresses.map(async (address) => {
          const priceInfo = priceMap[address];
          const meta = allTokenMetadata.find((t: any) => t.address === address);

          let name = meta?.name;
          let symbol = meta?.symbol;
          let logoURI = meta?.logoURI || '/default-token.svg';
          let launchTime = meta?.createdAt ? new Date(meta.createdAt).getTime() : Date.now();

          if (!meta) {
            const fallbackMeta = await fetchFromGeckoTerminal(address);
            if (fallbackMeta) {
              name = fallbackMeta.name;
              symbol = fallbackMeta.symbol;
              logoURI = fallbackMeta.logoURI;
              launchTime = fallbackMeta.createdAt;
            }
          }

          const price = Number(priceInfo?.price || 0);
          const marketCap = price * 1_000_000_000;

          return {
            address,
            name: name || address.slice(0, 4),
            symbol: symbol || name || address.slice(0, 4),
            logoURI,
            price,
            marketCap,
            creatorWallet: uniqueTokensMap[address],
            launchTime,
          } satisfies TokenInfo;
        }));

        const validTokens = tokenInfos.filter((t) => t.price > 0);

        if (validTokens.length === 0) {
          setError('No valid tokens found. Please try again later.');
        } else {
          setTokens(validTokens);
          setError(null);
        }
      } catch (err) {
        console.error('Error loading tokens from Firestore:', err);
        setError('Failed to load token data. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    loadTokens();
  }, []);

  const filteredTokens = tokens.filter((token) =>
    token.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    token.creatorWallet.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const sortedTokens = [...filteredTokens].sort((a, b) => b.marketCap - a.marketCap);

  return (
    <div className="min-h-screen bg-black matrix-bg">
      <div className="container mx-auto px-4 py-12">
        <div className="cyber-border bg-black/80 p-8 neon-box relative overflow-hidden">
          <div className="absolute inset-0 pointer-events-none scanlines"></div>

          <div className="relative z-10">
            <div className="mb-8">
              <h1 className="text-5xl md:text-7xl text-[#00FF9D] font-bold text-center mb-6 glitch-text">
                TKNZ_LEADERBOARD
              </h1>

              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#00FF9D]/60 w-5 h-5" />
                  <input
                    type="text"
                    placeholder="SEARCH_TOKEN || CREATOR"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-black/50 border-2 border-[#00FF9D]/20 text-[#00FF9D] py-2 pl-10 pr-4 focus:outline-none focus:border-[#00FF9D]/50 transition-colors cyber-input"
                  />
                </div>

                <button
                  onClick={() => setSortBy('mc')}
                  className="flex items-center space-x-2 text-[#00FF9D]/80 hover:text-[#00FF9D] transition-colors cyber-button"
                >
                  <ArrowUpDown className="w-4 h-4" />
                  <span>SORT_BY: MC</span>
                </button>
              </div>

              {error ? (
                <div className="text-center py-12">
                  <div className="error-text">[ERROR]: {error}</div>
                </div>
              ) : loading ? (
                <div className="text-center py-12">
                  <div className="text-[#00FF9D] animate-pulse">&gt; LOADING_DATA...</div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b-2 border-[#00FF9D]/20">
                        <th className="text-left py-4 text-[#00FF9D]/80">&gt; RANK</th>
                        <th className="text-left py-4 text-[#00FF9D]/80">&gt; TOKEN</th>
                        <th className="text-right py-4 text-[#00FF9D]/80">&gt; MC</th>
                        <th className="text-left py-4 px-6 text-[#00FF9D]/80">&gt; CREATOR</th>
                        <th className="text-right py-4 text-[#00FF9D]/80">&gt; LAUNCHED</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedTokens.map((token, index) => (
                        <tr
                          key={token.address}
                          className="border-b border-[#00FF9D]/10 hover:bg-[#00FF9D]/5 transition-colors cyber-row"
                        >
                          <td className="py-4 text-[#00FF9D]/60">#{index + 1}</td>
                          <td className="py-4 flex items-center gap-2">
                            <img src={token.logoURI} alt="logo" className="w-5 h-5 rounded-full" />
                            <a
                              href={`https://pump.fun/${token.address}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[#00FF9D] hover:text-[#00FF9D]/80 transition-colors"
                            >
                              {token.symbol}
                            </a>
                          </td>
                          <td className="py-4 text-right text-[#00FF9D]/80 font-mono">
                            ${token.marketCap.toFixed(2)} USD
                          </td>
                          <td className="py-4 px-6 text-[#00FF9D]/60 font-mono">
                            {`${token.creatorWallet.slice(0, 4)}...${token.creatorWallet.slice(-4)}`}
                          </td>
                          <td className="py-4 text-right text-[#00FF9D]/60">
                            {formatDistanceToNow(token.launchTime, { addSuffix: true })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Leaderboard;
