/**
 * AudioRecorder - Captures microphone audio and streams PCM16 chunks.
 * Designed for streaming to Deepgram STT (16kHz, mono, PCM16).
 */
export class AudioRecorder {
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private onAudioChunk: (chunk: ArrayBuffer) => void;

  constructor(onAudioChunk: (chunk: ArrayBuffer) => void) {
    this.onAudioChunk = onAudioChunk;
  }

  async start(): Promise<void> {
    // Request microphone access
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 16000,
      },
    });

    // Create audio context at 16kHz for Deepgram
    this.audioContext = new AudioContext({ sampleRate: 16000 });
    const source = this.audioContext.createMediaStreamSource(this.stream);

    // Use ScriptProcessor for raw PCM access
    // Buffer size of 4096 gives ~256ms chunks at 16kHz
    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

    this.processor.onaudioprocess = (event) => {
      const inputData = event.inputBuffer.getChannelData(0);

      // Convert float32 [-1, 1] to int16 [-32768, 32767]
      const pcm16 = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        const sample = Math.max(-1, Math.min(1, inputData[i]));
        pcm16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      }

      this.onAudioChunk(pcm16.buffer);
    };

    // Connect: source -> processor -> destination (required for processor to work)
    source.connect(this.processor);
    this.processor.connect(this.audioContext.destination);
  }

  stop(): void {
    // Disconnect and clean up
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
  }

  get isRecording(): boolean {
    return this.stream !== null && this.audioContext !== null;
  }
}
