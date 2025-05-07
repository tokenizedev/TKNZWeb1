#!/bin/bash

INPUT=$1
BASENAME=$(basename "$INPUT" | cut -d. -f1)
OUTPUT_DIR="./favicons_${BASENAME}"
mkdir -p "$OUTPUT_DIR"

echo "🎨 Generating favicons from: $INPUT"

# Sizes to generate
SIZES=(16 32 48 96 192 256 512)

# Generate PNGs
for SIZE in "${SIZES[@]}"; do
  convert "$INPUT" -resize ${SIZE}x${SIZE} "$OUTPUT_DIR/favicon-${SIZE}x${SIZE}.png"
done

# Apple touch icon (180x180)
convert "$INPUT" -resize 180x180 "$OUTPUT_DIR/apple-touch-icon.png"

# Android Chrome icon
convert "$INPUT" -resize 192x192 "$OUTPUT_DIR/android-chrome-192x192.png"

# Favicon ICO (16, 32, 48)
convert "$OUTPUT_DIR/favicon-16x16.png" "$OUTPUT_DIR/favicon-32x32.png" "$OUTPUT_DIR/favicon-48x48.png" \
  "$OUTPUT_DIR/favicon.ico"

echo "✅ Favicons saved to: $OUTPUT_DIR"