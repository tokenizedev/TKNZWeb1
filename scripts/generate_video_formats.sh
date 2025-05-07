#!/bin/bash

INPUT=$1
BASENAME=$(basename "$INPUT" .mp4)
OUTPUT_DIR="./output_${BASENAME}"
mkdir -p "$OUTPUT_DIR"

echo "🔄 Starting conversion for: $INPUT"

# 1. Optimized MP4 (baseline profile, faststart, compatible)
ffmpeg -i "$INPUT" \
  -vcodec libx264 -profile:v baseline -level 3.0 -pix_fmt yuv420p \
  -acodec aac -b:a 128k -movflags +faststart \
  "$OUTPUT_DIR/${BASENAME}.mp4"

# 2. WebM (VP9 + Opus)
ffmpeg -i "$INPUT" \
  -c:v libvpx-vp9 -b:v 1M -c:a libopus \
  "$OUTPUT_DIR/${BASENAME}.webm"

# 3. HLS (for adaptive streaming)
mkdir -p "$OUTPUT_DIR/hls"
ffmpeg -i "$INPUT" \
  -codec: copy -start_number 0 -hls_time 10 -hls_list_size 0 -f hls \
  "$OUTPUT_DIR/hls/${BASENAME}.m3u8"

# 4. Animated WebP (first 5s only)
ffmpeg -i "$INPUT" -t 5 -vf "fps=10,scale=320:-1:flags=lanczos" -loop 0 \
  "$OUTPUT_DIR/${BASENAME}.webp"

# 5. Still WebP (poster thumbnail)
ffmpeg -i "$INPUT" -ss 00:00:01.000 -vframes 1 "$OUTPUT_DIR/${BASENAME}_poster.webp"

echo "✅ Done! Outputs saved in: $OUTPUT_DIR"
