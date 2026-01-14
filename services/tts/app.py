"""
Digital Mind TTS Service - XTTS v2 on Modal
Provides voice cloning and text-to-speech synthesis.
"""

import modal
import io
import base64

# Define the Modal image with XTTS dependencies
image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("ffmpeg", "libsndfile1")
    .pip_install(
        "TTS==0.22.0",
        "torch==2.1.0",
        "torchaudio==2.1.0",
        "transformers==4.36.0",  # Pin to avoid pytree compatibility issue
        "numpy<2",
        "fastapi[standard]",
    )
    .env({"COQUI_TOS_AGREED": "1"})  # Auto-accept license
    .run_commands("python -c \"from TTS.api import TTS; TTS('tts_models/multilingual/multi-dataset/xtts_v2')\"")
)

app = modal.App("digital-mind-tts", image=image)

# Volume for storing voice profiles
voice_volume = modal.Volume.from_name("voice-profiles", create_if_missing=True)


@app.cls(
    gpu="A10G",
    scaledown_window=300,  # Keep warm for 5 min
    volumes={"/voices": voice_volume},
    timeout=600,
)
class TTSService:
    @modal.enter()
    def load_model(self):
        """Load XTTS model on container start."""
        import os
        os.environ["COQUI_TOS_AGREED"] = "1"

        from TTS.api import TTS

        print("Loading XTTS model...")
        self.tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2", gpu=True)
        self.speaker_wavs = {}
        print("Model loaded successfully!")

    @modal.method()
    def create_voice(self, voice_id: str, audio_clips: list[bytes]) -> dict:
        """Create a voice profile from audio clips."""
        import os

        voice_dir = f"/voices/{voice_id}"
        os.makedirs(voice_dir, exist_ok=True)

        paths = []
        for i, clip in enumerate(audio_clips):
            path = f"{voice_dir}/clip_{i}.wav"
            with open(path, "wb") as f:
                f.write(clip)
            paths.append(path)

        self.speaker_wavs[voice_id] = paths
        voice_volume.commit()

        return {"voice_id": voice_id, "status": "created", "clips": len(paths)}

    @modal.method()
    def synthesize(self, text: str, voice_id: str = "austin") -> bytes:
        """Synthesize audio for text."""
        import torch
        import torchaudio
        import os

        if voice_id not in self.speaker_wavs:
            voice_dir = f"/voices/{voice_id}"
            if os.path.exists(voice_dir):
                self.speaker_wavs[voice_id] = sorted([
                    f"{voice_dir}/{f}" for f in os.listdir(voice_dir) if f.endswith(".wav")
                ])
            else:
                raise ValueError(f"Voice '{voice_id}' not found")

        speaker_wav = self.speaker_wavs[voice_id][:5]

        # Use lower temperature to prevent hallucination/gibberish
        wav = self.tts.tts(
            text=text,
            speaker_wav=speaker_wav,
            language="en",
            temperature=0.3,  # Lower = more deterministic, less hallucination
            repetition_penalty=10.0,  # Prevent repeating sounds
            top_k=30,  # Limit vocabulary choices
            top_p=0.7,  # Nucleus sampling threshold
        )

        audio_tensor = torch.tensor(wav).unsqueeze(0)
        buffer = io.BytesIO()
        torchaudio.save(buffer, audio_tensor, 24000, format="wav")

        return buffer.getvalue()

    @modal.method()
    def health(self) -> dict:
        return {"status": "ok"}


# Simple web endpoint
@app.function(image=image)
@modal.fastapi_endpoint(method="POST")
def tts_endpoint(request: dict):
    """HTTP endpoint for synthesis."""
    text = request.get("text", "")
    voice_id = request.get("voice_id", "austin")

    if not text:
        return {"error": "No text provided"}

    service = TTSService()
    audio_bytes = service.synthesize.remote(text, voice_id)

    return {
        "audio": base64.b64encode(audio_bytes).decode(),
        "format": "wav",
    }
