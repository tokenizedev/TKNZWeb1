import React, { useState, useEffect } from 'react';
import { ExternalLink, Clock, AlertCircle } from 'lucide-react';

interface TokenData {
  address: string;
  creatorWallet: string;
  lastUpdated: number;
  symbol: string | number;
  logoURI: string;
  launchTime: number;
  marketCap: number;
  name: string;
  price: number;
  supply: number;
}

const LiveTicker: React.FC = () => {
  const [tokens, setTokens] = useState<TokenData[]>([]);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    const fetchTokens = async () => {
      try {
        setError(null);
        const response = await fetch(
          `https://tknz.fun/.netlify/functions/leaderboard?page=${page}`,
          {
            headers: {
              Accept: 'application/json',
            },
          }
        );

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (!data) {
          throw new Error('Empty response received from API');
        }

        const tokenArray = data.entries;

        if (!Array.isArray(tokenArray)) {
          throw new Error('Invalid data format: Expected an array of tokens');
        }

        const validatedTokens = tokenArray.filter(
          (token): token is TokenData => {
            const isValid =
              token &&
              typeof token === 'object' &&
              typeof token.address === 'string' &&
              ['string', 'number'].includes(typeof token.symbol) &&
              typeof token.launchTime === 'number';

            if (!isValid) {
              console.warn('Invalid token data:', token);
            }
            return isValid;
          }
        );

        if (validatedTokens.length === 0) {
          setHasMore(false);
          if (tokens.length === 0) {
            throw new Error('No valid token data found in the response');
          }
          return;
        }

        setTokens((prevTokens) => {
          const allTokens = [...prevTokens, ...validatedTokens];
          const sortedTokens = allTokens.sort((a, b) => b.launchTime - a.launchTime);
          const uniqueTokens = Array.from(
            new Map(sortedTokens.map(token => [token.address, token])).values()
          );
          return uniqueTokens.slice(0, 20);
        });

        setPage((prev) => prev + 1);
      } catch (error) {
        console.error('Error fetching tokens:', error);
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error occurred';
        setError(`Unable to fetch latest tokens: ${errorMessage}. Retrying...`);

        setTimeout(() => {
          setPage((prev) => prev);
        }, 5000);
      } finally {
        setIsLoading(false);
      }
    };

    if (hasMore && page === 1) {
      fetchTokens();
    }
  }, [page, hasMore]);

  const formatTimeAgo = (dateString: number) => {
    const date = new Date(dateString);
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);

    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  const logoResolver = (logoURI: string) => {
    return (
      logoURI ||
      'https://images.pexels.com/photos/844124/pexels-photo-844124.jpeg?auto=compress&cs=tinysrgb&w=200'
    );
  };

  if (isLoading && tokens.length === 0) {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 bg-black/90 backdrop-blur-md border-b border-green-500/20">
        <div className="h-12 flex items-center justify-center text-green-400">
          Loading latest tokens...
        </div>
      </div>
    );
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-black/90 backdrop-blur-md border-b border-green-500/20">
      {error && (
        <div className="absolute top-0 right-0 mt-2 mr-2 bg-red-500/20 text-red-400 px-3 py-1 rounded-full text-xs flex items-center">
          <AlertCircle size={12} className="mr-1" />
          {error}
        </div>
      )}
      <div className="ticker-container h-12 overflow-hidden">
        <div className="ticker-track py-2">
          {tokens.length > 0 ? (
            tokens.map((token, index) => (
              <a
                key={`${token.address}-${index}`}
                href={`https://pump.fun/coin/${token.address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="ticker-item mx-4 bg-black/70 backdrop-blur-sm border border-green-500/30 rounded-full px-4 py-1 flex items-center hover:bg-gray-800/70 transition-all hover:border-green-400/50 hover:scale-105"
              >
                <div className="w-6 h-6 rounded-full overflow-hidden flex-shrink-0 border border-gray-700">
                  <img
                    src={logoResolver(token.logoURI)}
                    alt={token.symbol}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.src =
                        'https://images.pexels.com/photos/844124/pexels-photo-844124.jpeg?auto=compress&cs=tinysrgb&w=200';
                    }}
                  />
                </div>
                <div className="ml-2 mr-3">
                  <div className="font-mono text-sm text-green-400">
                    {token.symbol}
                  </div>
                </div>
                <div className="flex items-center text-gray-400 text-xs">
                  <Clock size={10} className="mr-1" />
                  <span>{formatTimeAgo(token.launchTime)}</span>
                </div>
                <ExternalLink size={10} className="ml-2 text-gray-400" />
              </a>
            ))
          ) : (
            <div className="ticker-item mx-4 bg-black/70 backdrop-blur-sm border border-yellow-500/30 rounded-full px-4 py-1 flex items-center">
              <span className="text-yellow-400 text-sm">No recent tokens found</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LiveTicker;