/**
 * Splits streaming text into speakable segments.
 * Goal: Get first audio chunk ASAP while maintaining natural speech.
 */
export class SpeechChunker {
  private buffer = "";
  private minChunkLength = 60; // Longer chunks = fewer pauses
  private maxChunkLength = 250; // Allow longer chunks for smoother speech

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
      return chunk;
    }

    // Check for clause boundary if buffer is getting long (comma, semicolon, etc)
    if (this.buffer.length > 100) {
      const clauseMatch = this.buffer.match(/^(.+?[,;:\-—])\s+(.*)$/s);
      if (clauseMatch && clauseMatch[1].length >= this.minChunkLength) {
        const chunk = clauseMatch[1].trim();
        this.buffer = clauseMatch[2];
        return chunk;
      }
    }

    // Force emit if way too long (prevents runaway buffer)
    if (this.buffer.length > this.maxChunkLength) {
      // Find last space
      const lastSpace = this.buffer.lastIndexOf(" ", this.maxChunkLength - 20);
      if (lastSpace > this.minChunkLength) {
        const chunk = this.buffer.slice(0, lastSpace).trim();
        this.buffer = this.buffer.slice(lastSpace + 1);
        return chunk;
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
      return chunk;
    }
    return null;
  }

  reset() {
    this.buffer = "";
  }
}
