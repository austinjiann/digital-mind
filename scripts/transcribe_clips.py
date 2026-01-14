#!/usr/bin/env python3
"""
Transcribe audio clips using OpenAI Whisper API.
Requires: OPENAI_API_KEY environment variable
"""

import os
import json
from pathlib import Path

try:
    from openai import OpenAI
except ImportError:
    print("Installing openai...")
    os.system("pip install openai --break-system-packages")
    from openai import OpenAI

CLIPS_DIR = Path("voice-data/clips")
MANIFEST_PATH = Path("voice-data/manifest.json")

# Load manifest
with open(MANIFEST_PATH) as f:
    manifest = json.load(f)

# Initialize OpenAI client
client = OpenAI()

print(f"Transcribing {len(manifest)} clips...")

for i, item in enumerate(manifest):
    clip_path = CLIPS_DIR / item["path"]

    if not clip_path.exists():
        print(f"  [{i+1}/{len(manifest)}] SKIP - {item['path']} not found")
        continue

    if item.get("text"):
        print(f"  [{i+1}/{len(manifest)}] SKIP - {item['path']} already transcribed")
        continue

    print(f"  [{i+1}/{len(manifest)}] Transcribing {item['path']}...", end=" ", flush=True)

    try:
        with open(clip_path, "rb") as audio_file:
            result = client.audio.transcriptions.create(
                model="whisper-1",
                file=audio_file,
                response_format="text"
            )

        item["text"] = result.strip()
        print(f"✓ ({len(item['text'])} chars)")

    except Exception as e:
        print(f"✗ Error: {e}")
        item["text"] = ""

# Save updated manifest
with open(MANIFEST_PATH, "w") as f:
    json.dump(manifest, f, indent=2)

transcribed = sum(1 for item in manifest if item.get("text"))
print(f"\n✅ Transcribed {transcribed}/{len(manifest)} clips")
print(f"   Manifest updated: {MANIFEST_PATH}")
