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
   * Clean text for TTS - remove problematic characters
   */
  private cleanText(text: string): string {
    return text
      .replace(/\.{2,}/g, ".") // Replace multiple dots with single
      .replace(/…/g, ".") // Replace ellipsis character
      .replace(/[*_~`#]/g, "") // Remove markdown characters
      .replace(/[\u{1F300}-\u{1F9FF}]/gu, "") // Remove emojis
      .replace(/[\u{2600}-\u{26FF}]/gu, "") // Remove misc symbols
      .replace(/[\u{2700}-\u{27BF}]/gu, "") // Remove dingbats
      .replace(/[—–]/g, ", ") // Replace em/en dash with comma
      .replace(/[""'']/g, "'") // Normalize quotes
      .replace(/[^\x00-\x7F]/g, "") // Remove any remaining non-ASCII
      .replace(/\s+/g, " ") // Normalize whitespace
      .trim();
  }

  /**
   * Synthesize text to audio.
   * Returns base64-encoded WAV audio.
   */
  async synthesize(text: string): Promise<string> {
    const cleanedText = this.cleanText(text);
    const startTime = Date.now();
    console.log(`[TTS] Synthesizing: "${cleanedText.slice(0, 50)}..."`);

    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: cleanedText,
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
