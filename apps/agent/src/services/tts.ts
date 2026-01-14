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
   * Tech terms to natural pronunciation
   */
  private readonly techTerms: [RegExp, string][] = [
    // Frameworks with .js - match variations
    [/Next\.?js/gi, "Next JS"],
    [/Node\.?js/gi, "Node JS"],
    [/React\.?js/gi, "React"],
    [/Vue\.?js/gi, "View JS"],
    [/Express\.?js/gi, "Express"],
    [/Three\.?js/gi, "Three JS"],
    // Acronyms - use word boundaries
    [/\bAPIs?\b/g, "A P I"],
    [/\bUI\b/g, "U I"],
    [/\bUX\b/g, "U X"],
    [/\bCSS\b/g, "C S S"],
    [/\bHTML\b/g, "H T M L"],
    [/\bAWS\b/g, "A W S"],
    [/\bGCP\b/g, "G C P"],
    [/\bCLI\b/g, "C L I"],
    [/\bSDK\b/g, "S D K"],
    [/\bIDE\b/g, "I D E"],
    [/\bNPM\b/g, "N P M"],
    [/\bURL\b/g, "U R L"],
    [/\bJSON\b/gi, "jay-son"],
    [/\bYAML\b/gi, "yammel"],
    [/\bOAuth\b/gi, "oh-auth"],
    [/\bJWT\b/g, "J W T"],
    [/\bREST\b/g, "rest"],
    [/\bGraphQL\b/gi, "graph Q L"],
    [/\bLLM\b/g, "L L M"],
    [/\bGPT\b/g, "G P T"],
    [/\bRAG\b/g, "rag"],
    [/\bSQL\b/gi, "sequel"],
    [/\bNoSQL\b/gi, "no sequel"],
    // Compound words
    [/TypeScript/gi, "Type Script"],
    [/JavaScript/gi, "Java Script"],
    [/GitHub/gi, "Git Hub"],
    [/GitLab/gi, "Git Lab"],
    [/VS\s?Code/gi, "V S Code"],
    [/PostgreSQL/gi, "postgres"],
    [/MongoDB/gi, "mongo D B"],
    [/Firebase/gi, "fire base"],
    [/Tailwind/gi, "tailwind"],
    [/Kubernetes/gi, "kubernetes"],
    [/\bk8s\b/gi, "kubernetes"],
    [/DevOps/gi, "dev ops"],
    [/WebSocket/gi, "web socket"],
    [/localhost/gi, "local host"],
    [/OpenAI/gi, "open A I"],
    [/Supabase/gi, "soopa base"],
    [/Vercel/gi, "ver-sell"],
    [/Hono/gi, "hoh-no"],
  ];

  /**
   * Clean text for TTS - remove problematic characters and fix pronunciation
   */
  private cleanText(text: string): string {
    let cleaned = text;

    // Replace tech terms with pronunciations
    for (const [pattern, pronunciation] of this.techTerms) {
      cleaned = cleaned.replace(pattern, pronunciation);
    }

    return cleaned
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
