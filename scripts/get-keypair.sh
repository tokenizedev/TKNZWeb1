#!/usr/bin/env bash
set -euo pipefail

# Usage: get-keypair.sh <private_key_base58_file> [<output_json_file>]
if [ $# -lt 1 ] || [ $# -gt 2 ]; then
  echo "Usage: get-keypair.sh <private_key_base58_file> [<output_json_file>]" >&2
  exit 1
fi

private_key_file="$1"
if [ $# -eq 2 ]; then
  output_file="$2"
else
  dir="$(dirname "$private_key_file")"
  base="$(basename "$private_key_file")"
  name="${base%.*}"
  output_file="$dir/$name.json"
fi

# Locate the TS keypair script in the project
project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/.."
ts_script="$project_root/bin/keypair-from-private.ts"

if [ ! -f "$ts_script" ]; then
  echo "Error: TS script not found at $ts_script" >&2
  exit 1
fi

echo "Generating keypair JSON: $private_key_file -> $output_file"

# Run via ts-node-esm using npx
if command -v npx &> /dev/null; then
  npx ts-node-esm "$ts_script" "$private_key_file" "$output_file"
else
  echo "Error: npx not found in PATH; please install Node.js and ts-node" >&2
  exit 1
fi