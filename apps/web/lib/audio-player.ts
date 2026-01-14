/**
 * Handles gapless playback of streaming audio chunks.
 */
export class StreamingAudioPlayer {
  private audioContext: AudioContext | null = null;
  private scheduledEndTime = 0;
  private sources: AudioBufferSourceNode[] = [];
  private isPlaying = false;
  private onEndCallback?: () => void;

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
  }

  async addChunk(base64Audio: string) {
    if (!this.audioContext || !this.isPlaying || !base64Audio) return;

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
        if (this.sources.length === 0 && this.onEndCallback) {
          this.onEndCallback();
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
  }

  onEnd(callback: () => void) {
    this.onEndCallback = callback;
  }

  get playing() {
    return this.isPlaying;
  }
}
