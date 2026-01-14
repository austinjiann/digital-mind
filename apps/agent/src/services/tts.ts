/**
 * TTS Client for Modal XTTS service
 */

interface TTSResponse {
  audio: string; // base64 encoded WAV
  format: string;
}

export class TTSClient {
  private baseUrl: string;
  private voiceId: string;

  constructor() {
    // Modal endpoint URL for the tts_endpoint function
    this.baseUrl =
      process.env.MODAL_TTS_URL ||
      "https://austinjian07--digital-mind-tts-tts-endpoint.modal.run";
    this.voiceId = process.env.VOICE_ID || "austin";
  }

  /**
   * Synthesize text to audio.
   * Returns base64-encoded WAV audio.
   */
  async synthesize(text: string): Promise<string> {
    const startTime = Date.now();
    console.log(`[TTS] Synthesizing: "${text.slice(0, 50)}..."`);

    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        voice_id: this.voiceId,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`TTS error: ${response.status} - ${error}`);
    }

    const data = (await response.json()) as TTSResponse;
    console.log(
      `[TTS] Generated ${data.audio.length} bytes in ${Date.now() - startTime}ms`
    );

    return data.audio;
  }
}

// Singleton instance
let ttsClient: TTSClient | null = null;

export function getTTSClient(): TTSClient {
  if (!ttsClient) {
    ttsClient = new TTSClient();
  }
  return ttsClient;
}
