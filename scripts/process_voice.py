#!/usr/bin/env python3
"""
All-in-one voice processing script.
Usage: python scripts/process_voice.py path/to/your/audio.mp3

This will:
1. Convert to WAV
2. Split into clips (3-12 seconds each)
3. Transcribe each clip
4. Upload to Modal and create voice profile
"""

import sys
import os
import json
import subprocess
from pathlib import Path

# Add project root to path
PROJECT_ROOT = Path(__file__).parent.parent
VOICE_DATA = PROJECT_ROOT / "voice-data"
CLIPS_DIR = VOICE_DATA / "clips"


def convert_to_wav(input_path: str) -> str:
    """Convert audio to WAV format."""
    output_path = VOICE_DATA / "processed" / "input.wav"
    output_path.parent.mkdir(exist_ok=True)

    print(f"Converting {input_path} to WAV...")
    subprocess.run([
        "ffmpeg", "-y", "-i", input_path,
        "-ar", "24000",  # 24kHz sample rate (XTTS native)
        "-ac", "1",      # Mono
        str(output_path)
    ], check=True, capture_output=True)

    return str(output_path)


def split_audio(wav_path: str, min_duration: float = 3.0, max_duration: float = 12.0):
    """Split audio into clips using silence detection."""
    print(f"Splitting audio into {min_duration}-{max_duration}s clips...")

    # Clear clips directory
    for f in CLIPS_DIR.glob("*.wav"):
        f.unlink()

    # Use ffmpeg silence detection
    result = subprocess.run([
        "ffmpeg", "-i", wav_path,
        "-af", "silencedetect=noise=-30dB:d=0.5",
        "-f", "null", "-"
    ], capture_output=True, text=True)

    # Parse silence timestamps
    import re
    silence_starts = []
    silence_ends = []

    for line in result.stderr.split('\n'):
        if 'silence_start' in line:
            match = re.search(r'silence_start: ([\d.]+)', line)
            if match:
                silence_starts.append(float(match.group(1)))
        elif 'silence_end' in line:
            match = re.search(r'silence_end: ([\d.]+)', line)
            if match:
                silence_ends.append(float(match.group(1)))

    # Get total duration
    probe = subprocess.run([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", wav_path
    ], capture_output=True, text=True)
    total_duration = float(probe.stdout.strip())

    # Create segments
    segments = []
    current_start = 0.0

    for i, (s_start, s_end) in enumerate(zip(silence_starts, silence_ends)):
        segment_duration = s_start - current_start

        if segment_duration >= min_duration:
            if segment_duration <= max_duration:
                segments.append((current_start, s_start))
            else:
                # Split long segments
                while current_start < s_start:
                    end = min(current_start + max_duration, s_start)
                    if end - current_start >= min_duration:
                        segments.append((current_start, end))
                    current_start = end

        current_start = s_end

    # Handle last segment
    if total_duration - current_start >= min_duration:
        segments.append((current_start, min(current_start + max_duration, total_duration)))

    # Export clips
    clips = []
    for i, (start, end) in enumerate(segments):
        output_path = CLIPS_DIR / f"clip_{i:03d}.wav"
        duration = end - start

        subprocess.run([
            "ffmpeg", "-y", "-i", wav_path,
            "-ss", str(start), "-t", str(duration),
            "-ar", "24000", "-ac", "1",
            str(output_path)
        ], check=True, capture_output=True)

        clips.append({
            "path": output_path.name,
            "duration": round(duration, 2),
            "start": round(start, 2),
            "end": round(end, 2)
        })
        print(f"  Created {output_path.name} ({duration:.1f}s)")

    print(f"Created {len(clips)} clips")
    return clips


def transcribe_clips(clips: list) -> list:
    """Transcribe clips using OpenAI Whisper API."""
    from openai import OpenAI

    client = OpenAI()
    print("Transcribing clips...")

    for clip in clips:
        clip_path = CLIPS_DIR / clip["path"]

        with open(clip_path, "rb") as f:
            transcript = client.audio.transcriptions.create(
                model="whisper-1",
                file=f,
                response_format="text"
            )

        clip["text"] = transcript.strip()
        print(f"  {clip['path']}: \"{clip['text'][:50]}...\"")

    return clips


def save_manifest(clips: list):
    """Save manifest.json."""
    manifest_path = VOICE_DATA / "manifest.json"

    manifest = [
        {"path": c["path"], "duration": c["duration"], "text": c["text"]}
        for c in clips
    ]

    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)

    print(f"Saved manifest with {len(clips)} clips")


def upload_to_modal(voice_id: str = "austin"):
    """Upload clips to Modal and create voice profile."""
    import modal

    print(f"Uploading to Modal as voice '{voice_id}'...")

    # Load clips
    manifest_path = VOICE_DATA / "manifest.json"
    with open(manifest_path) as f:
        manifest = json.load(f)

    # Read audio files
    audio_clips = []
    for entry in manifest:
        clip_path = CLIPS_DIR / entry["path"]
        with open(clip_path, "rb") as f:
            audio_clips.append(f.read())

    # Upload to Modal
    TTSService = modal.Cls.from_name("digital-mind-tts", "TTSService")
    service = TTSService()

    result = service.create_voice.remote(voice_id, audio_clips)
    print(f"Voice profile created: {result}")

    # Test synthesis
    print("Testing synthesis...")
    audio_bytes = service.synthesize.remote(
        "Hello, this is a test of my new voice.",
        voice_id
    )

    test_path = VOICE_DATA / "test_output.wav"
    with open(test_path, "wb") as f:
        f.write(audio_bytes)

    print(f"Test audio saved to {test_path}")
    print(f"Play it with: afplay {test_path}")


def main():
    if len(sys.argv) < 2:
        print("Usage: python scripts/process_voice.py <audio_file>")
        print("       python scripts/process_voice.py path/to/recording.mp3")
        sys.exit(1)

    input_path = sys.argv[1]

    if not os.path.exists(input_path):
        print(f"Error: File not found: {input_path}")
        sys.exit(1)

    # Ensure clips directory exists
    CLIPS_DIR.mkdir(exist_ok=True)

    # Process pipeline
    wav_path = convert_to_wav(input_path)
    clips = split_audio(wav_path)

    if not clips:
        print("Error: No clips created. Check your audio file.")
        sys.exit(1)

    clips = transcribe_clips(clips)
    save_manifest(clips)
    upload_to_modal()

    print("\n✅ Done! Your new voice is ready to use.")
    print("Restart your agent to use the updated voice.")


if __name__ == "__main__":
    main()
