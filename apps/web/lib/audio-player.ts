/**
 * Handles gapless playback of streaming audio chunks with ordering support.
 */
export class StreamingAudioPlayer {
  private audioContext: AudioContext | null = null;
  private scheduledEndTime = 0;
  private sources: AudioBufferSourceNode[] = [];
  private isPlaying = false;
  private onEndCallback?: () => void;

  // Chunk ordering
  private chunkBuffer: Map<number, string> = new Map();
  private nextExpectedChunk = 0;
  private isProcessing = false;

  constructor() {
    if (typeof window !== "undefined") {
      this.audioContext = new AudioContext();
    }
  }

  async start() {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }
    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }
    this.scheduledEndTime = this.audioContext.currentTime;
    this.isPlaying = true;

    // Reset chunk ordering state
    this.chunkBuffer.clear();
    this.nextExpectedChunk = 0;
  }

  async addChunk(base64Audio: string, chunkIndex?: number) {
    if (!this.audioContext || !this.isPlaying || !base64Audio) return;

    // If no chunk index provided, play immediately (backwards compatibility)
    if (chunkIndex === undefined) {
      await this.scheduleAudio(base64Audio);
      return;
    }

    // Buffer the chunk at its index
    this.chunkBuffer.set(chunkIndex, base64Audio);

    // Process buffered chunks in order
    await this.processBufferedChunks();
  }

  private async processBufferedChunks() {
    // Prevent concurrent processing
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      // Process chunks sequentially in order
      while (this.chunkBuffer.has(this.nextExpectedChunk)) {
        const audio = this.chunkBuffer.get(this.nextExpectedChunk)!;
        this.chunkBuffer.delete(this.nextExpectedChunk);

        await this.scheduleAudio(audio);
        this.nextExpectedChunk++;
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private async scheduleAudio(base64Audio: string) {
    if (!this.audioContext || !this.isPlaying) return;

    try {
      // Decode base64 to ArrayBuffer
      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Decode audio
      const audioBuffer = await this.audioContext.decodeAudioData(
        bytes.buffer.slice(0)
      );

      // Create source node
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioContext.destination);

      // Schedule playback (gapless)
      const startTime = Math.max(
        this.scheduledEndTime,
        this.audioContext.currentTime
      );
      source.start(startTime);

      this.scheduledEndTime = startTime + audioBuffer.duration;
      this.sources.push(source);

      // Cleanup when done
      source.onended = () => {
        const idx = this.sources.indexOf(source);
        if (idx !== -1) this.sources.splice(idx, 1);

        // Check if all audio has finished
        if (this.sources.length === 0) {
          this.isPlaying = false;
          if (this.onEndCallback) {
            this.onEndCallback();
          }
        }
      };
    } catch (error) {
      console.error("[AudioPlayer] Error decoding audio:", error);
    }
  }

  stop() {
    this.isPlaying = false;

    // Stop all scheduled audio immediately
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        // Already stopped
      }
    }
    this.sources = [];
    this.scheduledEndTime = 0;

    // Clear chunk buffer
    this.chunkBuffer.clear();
    this.nextExpectedChunk = 0;
  }

  onEnd(callback: () => void) {
    this.onEndCallback = callback;
  }

  get playing() {
    return this.isPlaying;
  }
}
