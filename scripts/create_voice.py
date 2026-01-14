#!/usr/bin/env python3
"""
Create voice profile on Modal TTS service.
"""

import modal
from pathlib import Path

CLIPS_DIR = Path("voice-data/clips")
VOICE_ID = "austin"

print(f"Loading clips from {CLIPS_DIR}...")

# Get all wav clips
clip_files = sorted(CLIPS_DIR.glob("*.wav"))[:10]  # Use up to 10 clips
print(f"Found {len(clip_files)} clips, using {len(clip_files)}")

# Read clip bytes
clips = []
for clip_path in clip_files:
    print(f"  Loading {clip_path.name}...")
    clips.append(clip_path.read_bytes())

print(f"\nCreating voice profile '{VOICE_ID}' on Modal...")

# Call Modal function using Function.from_name
TTSService = modal.Cls.from_name("digital-mind-tts", "TTSService")
result = TTSService().create_voice.remote(VOICE_ID, clips)

print(f"✅ Voice profile created: {result}")

# Test synthesis
print("\n🎤 Testing synthesis...")
audio = TTSService().synthesize.remote("Hello, this is a test of my cloned voice.", VOICE_ID)
print(f"   Generated {len(audio)} bytes of audio")

# Save test audio
test_path = Path("voice-data/test_output.wav")
test_path.write_bytes(audio)
print(f"   Saved to {test_path}")

print("\n✅ Voice cloning complete!")
print(f"   Voice ID: {VOICE_ID}")
print(f"   Test: play voice-data/test_output.wav")
