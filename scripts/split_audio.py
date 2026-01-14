#!/usr/bin/env python3
"""
Split processed audio files into 3-12 second clips for voice cloning.
Uses ffmpeg directly (no pydub dependency).
"""

import os
import json
import subprocess
from pathlib import Path

INPUT_DIR = Path("voice-data/processed")
OUTPUT_DIR = Path("voice-data/clips")
OUTPUT_DIR.mkdir(exist_ok=True)

# Clear existing clips (except .gitkeep)
for f in OUTPUT_DIR.glob("*.wav"):
    f.unlink()

def get_duration(filepath):
    """Get audio duration using ffprobe."""
    result = subprocess.run([
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "csv=p=0",
        str(filepath)
    ], capture_output=True, text=True)
    return float(result.stdout.strip())

def detect_silence(filepath):
    """Detect silence regions using ffmpeg silencedetect."""
    result = subprocess.run([
        "ffmpeg", "-i", str(filepath),
        "-af", "silencedetect=noise=-40dB:d=0.4",
        "-f", "null", "-"
    ], capture_output=True, text=True)

    # Parse silence_start and silence_end from stderr
    lines = result.stderr.split("\n")
    silences = []
    current_start = None

    for line in lines:
        if "silence_start:" in line:
            current_start = float(line.split("silence_start:")[1].strip().split()[0])
        elif "silence_end:" in line and current_start is not None:
            end = float(line.split("silence_end:")[1].strip().split()[0])
            silences.append((current_start, end))
            current_start = None

    return silences

def split_on_silence(filepath, output_prefix, min_dur=3, max_dur=12):
    """Split audio file on silence points."""
    clips = []
    duration = get_duration(filepath)
    silences = detect_silence(filepath)

    # Find split points (midpoint of each silence region)
    split_points = [0]
    for start, end in silences:
        mid = (start + end) / 2
        split_points.append(mid)
    split_points.append(duration)

    # Create clips from segments
    clip_count = 0
    i = 0
    while i < len(split_points) - 1:
        start = split_points[i]

        # Find end point that gives us a clip in the right duration range
        best_end = None
        for j in range(i + 1, len(split_points)):
            end = split_points[j]
            clip_dur = end - start

            if clip_dur >= min_dur and clip_dur <= max_dur:
                best_end = j
                break
            elif clip_dur > max_dur:
                # If we overshot, use previous point or force split
                if best_end is None and j > i + 1:
                    best_end = j - 1
                break

        if best_end is None:
            # Take whatever is next
            best_end = i + 1

        end = split_points[best_end]
        clip_dur = end - start

        # Only save clips of appropriate length
        if clip_dur >= min_dur and clip_dur <= max_dur:
            clip_name = f"{output_prefix}_clip_{clip_count:03d}.wav"
            output_path = OUTPUT_DIR / clip_name

            subprocess.run([
                "ffmpeg", "-y", "-i", str(filepath),
                "-ss", str(start), "-t", str(clip_dur),
                "-c", "copy",
                str(output_path)
            ], capture_output=True)

            clips.append({
                "path": clip_name,
                "duration": round(clip_dur, 2),
                "text": ""
            })
            clip_count += 1

        i = best_end

    return clips

print("Splitting audio into clips...")

manifest = []

for audio_file in sorted(INPUT_DIR.glob("*.wav")):
    print(f"\nProcessing: {audio_file.name}")

    clips = split_on_silence(audio_file, audio_file.stem)
    manifest.extend(clips)

    print(f"  Created {len(clips)} clips")

# Save manifest
manifest_path = Path("voice-data/manifest.json")
with open(manifest_path, "w") as f:
    json.dump(manifest, f, indent=2)

print(f"\n✅ Created {len(manifest)} clips total")
print(f"   Output: {OUTPUT_DIR}")
print(f"   Manifest: {manifest_path}")
