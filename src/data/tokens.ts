import { Token } from '../types';

// Simulated token data
export const recentTokens: Token[] = [
  {
    id: '1',
    name: 'Viral Tweet',
    ticker: '$VIRAL',
    thumbnail: 'https://images.pexels.com/photos/1591062/pexels-photo-1591062.jpeg?auto=compress&cs=tinysrgb&w=200',
    launchTime: new Date(Date.now() - 3 * 60 * 1000), // 3 minutes ago
    pumpLink: 'https://pump.fun'
  },
  {
    id: '2',
    name: 'NFT Collection',
    ticker: '$NFTC',
    thumbnail: 'https://images.pexels.com/photos/2582937/pexels-photo-2582937.jpeg?auto=compress&cs=tinysrgb&w=200',
    launchTime: new Date(Date.now() - 7 * 60 * 1000), // 7 minutes ago
    pumpLink: 'https://pump.fun'
  },
  {
    id: '3',
    name: 'Meme Economy',
    ticker: '$MEME',
    thumbnail: 'https://images.pexels.com/photos/225769/pexels-photo-225769.jpeg?auto=compress&cs=tinysrgb&w=200',
    launchTime: new Date(Date.now() - 12 * 60 * 1000), // 12 minutes ago
    pumpLink: 'https://pump.fun'
  },
  {
    id: '4',
    name: 'Crypto Article',
    ticker: '$READ',
    thumbnail: 'https://images.pexels.com/photos/844124/pexels-photo-844124.jpeg?auto=compress&cs=tinysrgb&w=200',
    launchTime: new Date(Date.now() - 18 * 60 * 1000), // 18 minutes ago
    pumpLink: 'https://pump.fun'
  },
  {
    id: '5',
    name: 'Viral Video',
    ticker: '$VVID',
    thumbnail: 'https://images.pexels.com/photos/3861969/pexels-photo-3861969.jpeg?auto=compress&cs=tinysrgb&w=200',
    launchTime: new Date(Date.now() - 25 * 60 * 1000), // 25 minutes ago
    pumpLink: 'https://pump.fun'
  },
  {
    id: '6',
    name: 'Community Post',
    ticker: '$COMM',
    thumbnail: 'https://images.pexels.com/photos/3183150/pexels-photo-3183150.jpeg?auto=compress&cs=tinysrgb&w=200',
    launchTime: new Date(Date.now() - 32 * 60 * 1000), // 32 minutes ago
    pumpLink: 'https://pump.fun'
  }
];