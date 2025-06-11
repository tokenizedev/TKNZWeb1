#!/usr/bin/env ts-node-esm
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
// Load .env
dotenv.config();

import axios from 'axios';


const payload = {
    "mint": "9cq2LjyLJrg7EmhSwAGgMMtbpVVQ6mm8JV1EpXKdkE3i",
    "launchTime": 1749586716535,
    "token": {
      "name": "TOM and Jerry",
      "ticker": "TOMJ",
      "description": "TOM and Jerry",
      "websiteUrl": "https://tknz.fun",
      "twitter": "https://x.com/tknzfun",
      "telegram": "https://t.me/tknzfun",
      "imageUrl": "https://ipfs.io/ipfs/QmcKySr5B4UPqDAoGekP2nSxX63fJTtXmuRXGGt4cDkyZF"
    },
    "ata": "B8xg7F9cmQn25qUUGYrnqRVNzNv8AXfA4nsAVASYkiwU",
    "createdAt": 1749586716535,
    "portalParams": {
      "amount": 0.01,
      "priorityFee": 0
    },
    "initialSupplyRaw": 1e+18,
    "pool": "CMtNGuNdFJaHd6e6upoNcBimvfkpWNwkuVsxUh9oURT8",
    "feeLamports": 0,
    "isLockLiquidity": false,
    "metadataUri": "https://ipfs.io/ipfs/QmXb3PfuteXMgnhTTTdb3zRbeTjU6wQj9eAHPENkzMJpN5",
    "decimals": 9,
    "depositLamports": 10000000,
    "feeSol": 0,
    "initialSupply": 1000000000,
    "depositSol": 0.01,
    "walletAddress": "GLcHqk15Vom6Bu8S9SqdLumWGpXP4DCt4Zg3HsYxBMk9"
};

axios.post('http://localhost:8888/.netlify/functions/notify-token-creation', payload, { headers: { 'Content-Type': 'application/json' } });

