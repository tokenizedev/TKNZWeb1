# TKNZ: Tokenize Anything. Tokenize Everything!

Welcome, brave adventurers, to the open-source realm of **TKNZ** – the magical Chrome extension and non-custodial wallet built on the Solana blockchain! With a single click, transform any piece of digital content into a shimmering token that lives forever on-chain.

## Table of Contents
- [Introduction](#introduction)
- [Features](#features)
- [Demo](#demo)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Development](#development)
  - [Production Build & Preview](#production-build--preview)
- [Project Structure](#project-structure)
- [Technology Stack](#technology-stack)
- [Configuration](#configuration)
- [Roadmap](#roadmap)
- [Code of Conduct](#code-of-conduct)
- [Contributing](#contributing)
- [License](#license)
- [Contact & Community](#contact--community)

## Introduction

TKNZ empowers any user – from blockchain novices to seasoned crypto-wizards – to mint tokens from news articles, social media posts, images, or any web content in under **5 seconds**. Harness the power of Solana, Pump.fun, and a sprinkle of AI to make tokenization as easy as browsing the web.

## Features
- One-click token creation directly from your browser.
- Non-custodial wallet: you hold your private keys.
- AI-assisted token metadata generation with optional “Memier” mode.
- Preview and customize token name, ticker, and icon before minting.
- Seamless integration with Pump.fun launchpad on Solana.
- Responsive UI crafted with React, Tailwind CSS, and Lucide Icons.
- Netlify-ready for quick deployment.

## Demo

Check out the live demo or install from the Chrome Web Store:
> **Coming soon** – stay tuned for the official release link!

## Getting Started

### Prerequisites
- Node.js (v16+ recommended)
- npm (v8+) or Yarn
- A Solana wallet with test/devnet SOL for experimenting

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/your-org/tknz.git
   cd tknz
   ```
2. Install dependencies:
   ```bash
   npm install
   ```

### Development
Launch the development server with hot-reloading:
```bash
npm run dev
```
  - Access the app at `http://localhost:5173/`.
  - To test Netlify functions locally:
    ```bash
    npm run dev:netlify
    ```

### Testing

Run the test suite, including TypeScript function handlers, using:
```bash
npm test
```

### Production Build & Preview
1. Build for production:
   ```bash
   npm run build
   ```
2. Preview the production build:
   ```bash
   npm run preview
   ```

## Project Structure
```text
.
├── public/                 # Static assets (icons, images, manifest)
├── src/                    # Source code
│   ├── assets/             # Hero images, logos, icons
│   ├── App.tsx             # Main application component
│   ├── PrivacyPolicy.tsx   # Privacy Policy page component
│   ├── main.tsx            # React entry point
│   └── index.css           # Global styles
├── vite.config.ts          # Vite configuration
├── tailwind.config.js      # Tailwind CSS configuration
├── postcss.config.js       # PostCSS plugins
├── netlify.toml            # Netlify deployment settings
├── package.json            # npm scripts & dependencies
└── README.md               # This documentation
```

## Technology Stack
- **Framework**: React 18
- **Language**: TypeScript
- **Bundler**: Vite
- **Styling**: Tailwind CSS, PostCSS
- **Icons**: Lucide React
- **Data Fetching**: Axios, Cheerio
- **Blockchain SDK**: OpenAI (AI metadata), Solana web3.js (wallet integration)
- **Deploy**: Netlify (Functions + Static)

## Configuration
- Edit the Solana contract address in `package.json` under the `tknz.contract` field.
- Tailwind and PostCSS configs live in `tailwind.config.js` and `postcss.config.js`.
- Environment variables for Netlify Functions can be set in the Netlify dashboard or `.env` files.
  
## API Reference

### Leaderboard Endpoint

`GET /.netlify/functions/leaderboard?page=<number>`

Fetches a paginated list of top tokens by market cap.

#### Query Parameters

- `page` (integer, optional): Page number to retrieve. Defaults to `1`. Each page returns 25 entries.

#### Response

Status: `200 OK`

```json
{
  "page": 1,
  "perPage": 25,
  "entries": [
    {
      "address": "TokenMintAddressString",
      "marketCap": 12345678.90,
      "name": "TokenName",
      "symbol": "SYM",
      "logoURI": "https://.../logo.png",
      "price": 0.12345678,
      "supply": 1000000000,
      "creatorWallet": "CreatorWalletAddress",
      "launchTime": 1672531200000,
      "lastUpdated": 1675132800000
    }
    // … more entries
  ]
}
```

##### Fields

- `page`: Current page number.
- `perPage`: Number of entries per page (always 25).
- `entries`: Array of token objects:
  - `address` (string): Mint address.
  - `marketCap` (number): Market capitalization (score from the sorted set).
  - `name` (string): Token name.
  - `symbol` (string): Token symbol.
  - `logoURI` (string): URL to token logo.
  - `price` (number): Price per token.
  - `supply` (number): Total token supply.
  - `creatorWallet` (string): Creator’s wallet address.
  - `launchTime` (number): UNIX timestamp (ms) of token launch.
  - `lastUpdated` (number): UNIX timestamp (ms) of last metadata update.

#### Errors

- `500 Internal Server Error`: Failed to fetch leaderboard or pipeline execution error.

#### Example

> Request:
>
> ```bash
> curl "https://your-site.netlify.app/.netlify/functions/leaderboard?page=2"
> ```
>
> Response:
> ```json
> {
>   "page": 2,
>   "perPage": 25,
>   "entries": [
>     { /* ... */ }
>   ]
> }
> ```

## Token Creation Flow

```mermaid
sequenceDiagram
  participant UX as User/UI
  participant Ext as Extension
  participant CTM as create-token-meteora Function
  participant RPC as Solana RPC
  participant CTC as confirm-token-creation Function
  participant NTC as notify-token-creation Function
  participant Redis as Redis
  participant Telegram as Telegram Bot

  UX->>Ext: Click "CREATE COIN"
  Ext->>CTM: POST /create-token-meteora + token params
  CTM-->>Ext: return { tx1, tx2, mint, ata, metadataUri, pool, ... }
  Ext->>RPC: sendRawTransaction(tx1); confirm
  Ext->>RPC: sendRawTransaction(tx2); confirm
  Ext->>CTC: POST /confirm-token-creation + token data
  CTC->>Redis: zadd leaderboard:v2, hset token:v2:<mint>
  CTC-->>Ext: success
  Ext->>NTC: POST /notify-token-creation + token data
  NTC->>Redis: zscore leaderboard:v2, zscore notifications:v2
  NTC->>Telegram: sendMessage notification
  NTC->>Redis: zadd notifications:v2
  NTC-->>Ext: success
```

## Roadmap
- [ ] Official Chrome Web Store release
- [ ] TikTok & other social platform optimizations
- [ ] Multi-launchpad integrations (Pump.fun, Raydium, etc.)
- [ ] Enhanced AI “Memier” modes and custom templates
- [ ] Community-driven plugin system
- [ ] i18n support for global audiences

## Code of Conduct

Please note that this project is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). By participating in this project, you agree to abide by its guidelines.

## Contributing
We welcome all brave souls and creative coders to join our quest!
1. Fork the repository.
2. Create a feature branch: `git checkout -b feature/my-awesome-idea`.
3. Commit your changes with clear, atomic commits.
4. Ensure linting and formatting: `npm run lint`.
5. Open a Pull Request describing your changes.
6. Join discussions and iterate based on feedback.

Please be excellent to each other and help keep this realm welcoming for all.

## License
This project is released under the MIT License.

## Contact & Community
- Twitter: [@tknzfun](https://x.com/tknzfun)
- Discord: _coming soon_
- GitHub Issues: Submit bugs and feature requests on the project's GitHub Issues page.

Thank you for embarking on this journey with us! May your tokens sparkle and your chains remain unbroken!