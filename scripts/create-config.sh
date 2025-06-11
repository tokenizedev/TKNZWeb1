#!/bin/bash

ts-node bin/create-static-config.ts \
   --keypair ./config/keys/treasury.json \
   --rpc https://mainnet.helius-rpc.com/?api-key=5e4edb76-36ed-4740-942d-7843adcc1e22 \
   --index 0 \
   --pool-fees-file ./config/token/pool-fees.json \
   --sqrt-min-price 0 \
   --sqrt-max-price 340282366920938463463374607431768211455 \
   --vault-config-key 11111111111111111111111111111111