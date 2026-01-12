#!/bin/bash
# Voice Dataset Preprocessing Script
# Requires: ffmpeg, sox

set -e

INPUT_DIR="voice-data/raw"
OUTPUT_DIR="voice-data/processed"

mkdir -p "$OUTPUT_DIR"

echo "Processing voice recordings..."

# Process each file
for file in "$INPUT_DIR"/*.{wav,mp3,m4a,flac,ogg}; do
  [ -e "$file" ] || continue

  basename=$(basename "$file" | sed 's/\.[^.]*$//')

  echo "Processing: $basename"

  # Normalize, convert to 24kHz mono, remove silence, apply filters
  ffmpeg -y -i "$file" \
    -af "silenceremove=1:0:-50dB,loudnorm,highpass=f=80,lowpass=f=8000" \
    -ar 24000 -ac 1 \
    "$OUTPUT_DIR/${basename}.wav" 2>/dev/null

done

echo ""
echo "Processed $(ls -1 "$OUTPUT_DIR"/*.wav 2>/dev/null | wc -l) files"
echo "Output directory: $OUTPUT_DIR"
