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
        "transformers==4.36.0",
        "numpy<2",
        "fastapi[standard]",
    )
    .env({"COQUI_TOS_AGREED": "1"})
    .run_commands("python -c \"from TTS.api import TTS; TTS('tts_models/multilingual/multi-dataset/xtts_v2')\"")
)

app = modal.App("digital-mind-tts", image=image)

# Volume for storing voice profiles
voice_volume = modal.Volume.from_name("voice-profiles", create_if_missing=True)


@app.cls(
    gpu="A10G",
    scaledown_window=300,
    min_containers=1,  # Keep warm
    volumes={"/voices": voice_volume},
    timeout=600,
)
class TTSService:
    @modal.enter()
    def load_model(self):
        """Load XTTS model and pre-cache voice embeddings."""
        import os
        import torch
        os.environ["COQUI_TOS_AGREED"] = "1"

        from TTS.tts.configs.xtts_config import XttsConfig
        from TTS.tts.models.xtts import Xtts

        print("Loading XTTS model...")

        # Load model directly for more control
        model_path = "/root/.local/share/tts/tts_models--multilingual--multi-dataset--xtts_v2"
        config = XttsConfig()
        config.load_json(f"{model_path}/config.json")

        self.model = Xtts.init_from_config(config)
        self.model.load_checkpoint(config, checkpoint_dir=model_path)
        self.model.cuda()
        self.model.eval()

        # Pre-cache voice embeddings
        self.voice_cache = {}
        self._preload_voices()

        print("Model loaded successfully!")

    def _preload_voices(self):
        """Pre-compute speaker embeddings for faster inference."""
        import os

        voices_dir = "/voices"
        if not os.path.exists(voices_dir):
            return

        for voice_id in os.listdir(voices_dir):
            voice_path = f"{voices_dir}/{voice_id}"
            if os.path.isdir(voice_path):
                wav_files = sorted([
                    f"{voice_path}/{f}"
                    for f in os.listdir(voice_path)
                    if f.endswith(".wav")
                ])[:3]  # Use only 3 best clips

                if wav_files:
                    print(f"Pre-computing embeddings for voice: {voice_id}")
                    gpt_cond_latent, speaker_embedding = self.model.get_conditioning_latents(
                        audio_path=wav_files
                    )
                    self.voice_cache[voice_id] = {
                        "gpt_cond_latent": gpt_cond_latent,
                        "speaker_embedding": speaker_embedding,
                    }
                    print(f"  Cached {voice_id} with {len(wav_files)} clips")

    def _get_voice(self, voice_id: str):
        """Get cached voice embeddings, computing if needed."""
        import os

        if voice_id in self.voice_cache:
            return self.voice_cache[voice_id]

        # Load from disk if not cached
        voice_path = f"/voices/{voice_id}"
        if not os.path.exists(voice_path):
            raise ValueError(f"Voice '{voice_id}' not found")

        wav_files = sorted([
            f"{voice_path}/{f}"
            for f in os.listdir(voice_path)
            if f.endswith(".wav")
        ])[:3]

        gpt_cond_latent, speaker_embedding = self.model.get_conditioning_latents(
            audio_path=wav_files
        )
        self.voice_cache[voice_id] = {
            "gpt_cond_latent": gpt_cond_latent,
            "speaker_embedding": speaker_embedding,
        }
        return self.voice_cache[voice_id]

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

        voice_volume.commit()

        # Compute embeddings immediately
        gpt_cond_latent, speaker_embedding = self.model.get_conditioning_latents(
            audio_path=paths[:3]
        )
        self.voice_cache[voice_id] = {
            "gpt_cond_latent": gpt_cond_latent,
            "speaker_embedding": speaker_embedding,
        }

        return {"voice_id": voice_id, "status": "created", "clips": len(paths)}

    def _estimate_duration(self, text: str, chars_per_second: float = 14.0) -> float:
        """Estimate expected audio duration based on text length."""
        # Average English speech: ~14-15 characters per second
        # Add buffer for natural pauses
        base_duration = len(text) / chars_per_second
        return base_duration * 1.3  # 30% buffer

    def _trim_audio(self, wav, text: str, sample_rate: int = 24000):
        """Trim audio to expected duration + buffer."""
        import numpy as np

        if hasattr(wav, 'cpu'):
            wav = wav.cpu().numpy()
        wav = np.array(wav)

        # Calculate max allowed duration
        expected_duration = self._estimate_duration(text)
        max_samples = int(expected_duration * sample_rate)

        # Hard truncate if too long
        if len(wav) > max_samples:
            print(f"  Trimming audio: {len(wav)/sample_rate:.2f}s -> {max_samples/sample_rate:.2f}s")
            wav = wav[:max_samples]

            # Fade out last 50ms to avoid click
            fade_samples = int(0.05 * sample_rate)
            fade = np.linspace(1.0, 0.0, fade_samples)
            wav[-fade_samples:] = wav[-fade_samples:] * fade

        return wav

    @modal.method()
    def synthesize(self, text: str, voice_id: str = "austin") -> bytes:
        """Synthesize audio with strict settings to prevent hallucination."""
        import torch
        import torchaudio

        voice = self._get_voice(voice_id)

        # Use inference() directly with strict parameters
        out = self.model.inference(
            text=text,
            language="en",
            gpt_cond_latent=voice["gpt_cond_latent"],
            speaker_embedding=voice["speaker_embedding"],
            # Strict settings to prevent hallucination
            temperature=0.1,  # Very low = very deterministic
            length_penalty=1.0,  # Encourage shorter outputs
            repetition_penalty=10.0,  # Strongly prevent repetition
            top_k=20,  # Very limited vocabulary
            top_p=0.5,  # Conservative nucleus sampling
            speed=1.0,
            enable_text_splitting=False,  # Don't split text internally
        )

        # Get wav and trim to expected duration (prevents gibberish)
        wav = out["wav"]
        wav = self._trim_audio(wav, text)

        # Convert to WAV
        audio_tensor = torch.tensor(wav).unsqueeze(0)

        buffer = io.BytesIO()
        torchaudio.save(buffer, audio_tensor, 24000, format="wav")

        return buffer.getvalue()

    @modal.method()
    def health(self) -> dict:
        return {"status": "ok", "voices": list(self.voice_cache.keys())}


# HTTP endpoint
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
