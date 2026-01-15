/**
 * Splits streaming text into speakable segments.
 * Goal: Get first audio chunk ASAP while maintaining natural speech.
 */

// Varied filler words for natural pauses
const FILLERS = [
  "Um,",
  "Uh,",
  "Hmm,",
  "So,",
  "Well,",
  "Like,",
  "Yeah,",
  "I mean,",
  "You know,",
  "Basically,",
];

export class SpeechChunker {
  private buffer = "";
  private minChunkLength = 80; // Shorter chunks = more responsive
  private maxChunkLength = 300; // Shorter max for faster delivery
  private isFirstChunk = true;
  private useFiller: boolean;
  private lastFillerIndex = -1;

  /**
   * @param useFiller - Whether to add filler words between chunks (default true).
   *                    Set to false for read-aloud of prepared text.
   */
  constructor(useFiller = true) {
    this.useFiller = useFiller;
  }

  /**
   * Get a random filler word, avoiding repeating the last one used.
   */
  private getRandomFiller(): string {
    let index: number;
    do {
      index = Math.floor(Math.random() * FILLERS.length);
    } while (index === this.lastFillerIndex && FILLERS.length > 1);
    this.lastFillerIndex = index;
    return FILLERS[index];
  }

  /**
   * Add filler at the beginning of non-first chunks to fill the pause
   * from the previous chunk finishing.
   */
  private maybeAddFiller(chunk: string): string {
    if (this.isFirstChunk) {
      this.isFirstChunk = false;
      return chunk;
    }
    // Add a varied filler at the start to fill the gap after previous chunk
    // Only for streaming responses, not read-aloud
    if (this.useFiller) {
      return this.getRandomFiller() + " " + chunk;
    }
    return chunk;
  }

  /**
   * Add tokens and get any complete chunks.
   */
  addToken(token: string): string | null {
    this.buffer += token;

    // Check for sentence boundary (. ! ?)
    const sentenceMatch = this.buffer.match(/^(.+?[.!?])\s+(.*)$/s);
    if (sentenceMatch && sentenceMatch[1].length >= this.minChunkLength) {
      const chunk = sentenceMatch[1].trim();
      this.buffer = sentenceMatch[2];
      return this.maybeAddFiller(chunk);
    }

    // Check for clause boundary if buffer is getting long (comma, semicolon, etc)
    if (this.buffer.length > 200) {
      const clauseMatch = this.buffer.match(/^(.+?[,;:\-—])\s+(.*)$/s);
      if (clauseMatch && clauseMatch[1].length >= this.minChunkLength) {
        const chunk = clauseMatch[1].trim();
        this.buffer = clauseMatch[2];
        return this.maybeAddFiller(chunk);
      }
    }

    // Force emit if way too long (prevents runaway buffer)
    if (this.buffer.length > this.maxChunkLength) {
      // Find last space
      const lastSpace = this.buffer.lastIndexOf(" ", this.maxChunkLength - 20);
      if (lastSpace > this.minChunkLength) {
        const chunk = this.buffer.slice(0, lastSpace).trim();
        this.buffer = this.buffer.slice(lastSpace + 1);
        return this.maybeAddFiller(chunk);
      }
    }

    return null;
  }

  /**
   * Flush remaining buffer at end of response.
   */
  flush(): string | null {
    if (this.buffer.trim()) {
      const chunk = this.buffer.trim();
      this.buffer = "";
      // Don't add filler to final chunk - it sounds unnatural
      return chunk;
    }
    return null;
  }

  reset() {
    this.buffer = "";
    this.isFirstChunk = true;
    this.lastFillerIndex = -1;
  }
}
