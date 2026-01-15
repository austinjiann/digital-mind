"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface MicPillProps {
  onTranscript: (text: string) => void;
  onInterimTranscript?: (text: string) => void;
  disabled?: boolean;
}

// Generate a short beep sound programmatically
function playBeep(frequency: number, duration: number, type: OscillatorType = "sine") {
  const audioCtx = new AudioContext();
  const oscillator = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  oscillator.frequency.value = frequency;
  oscillator.type = type;

  // Fade in/out to avoid clicks
  gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
  gainNode.gain.linearRampToValueAtTime(0.3, audioCtx.currentTime + 0.01);
  gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + duration);

  oscillator.start(audioCtx.currentTime);
  oscillator.stop(audioCtx.currentTime + duration);
}

function playStartSound() {
  playBeep(600, 0.1);
  setTimeout(() => playBeep(800, 0.1), 80);
}

function playStopSound() {
  playBeep(800, 0.1);
  setTimeout(() => playBeep(500, 0.15), 80);
}

// Number of dots/bars for each state
const DOTS_DEFAULT = 5;
const DOTS_HOVER = 8;
const BARS_RECORDING = 12;

export function MicPill({ onTranscript, onInterimTranscript, disabled }: MicPillProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [audioLevels, setAudioLevels] = useState<number[]>(Array(BARS_RECORDING).fill(0));

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Determine how many dots/bars to show
  const visibleDots = isRecording ? BARS_RECORDING : isHovered ? DOTS_HOVER : DOTS_DEFAULT;

  // Audio visualization loop
  const updateAudioLevels = useCallback(() => {
    if (!analyserRef.current || !isRecording) return;

    const analyser = analyserRef.current;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);

    const bands = BARS_RECORDING;
    const bandSize = Math.floor(dataArray.length / bands);
    const levels: number[] = [];

    for (let i = 0; i < bands; i++) {
      let sum = 0;
      for (let j = 0; j < bandSize; j++) {
        sum += dataArray[i * bandSize + j];
      }
      levels.push(Math.min(1, (sum / bandSize / 255) * 2.5));
    }

    setAudioLevels(levels);
    animationFrameRef.current = requestAnimationFrame(updateAudioLevels);
  }, [isRecording]);

  const startRecording = useCallback(async () => {
    if (disabled || isRecording) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.7;
      source.connect(analyser);
      analyserRef.current = analyser;

      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        console.error("Speech recognition not supported");
        return;
      }

      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onresult = (event) => {
        const results = event.results;
        const lastResult = results[results.length - 1];
        const transcript = lastResult[0].transcript;

        if (lastResult.isFinal) {
          onTranscript(transcript);
        } else if (onInterimTranscript) {
          onInterimTranscript(transcript);
        }
      };

      recognition.onerror = (event) => {
        console.error("Speech recognition error:", event.error);
        stopRecording();
      };

      recognition.onend = () => {
        if (isRecording && recognitionRef.current) {
          try {
            recognitionRef.current.start();
          } catch {
            // Already started
          }
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
      setIsRecording(true);
      playStartSound();

      animationFrameRef.current = requestAnimationFrame(updateAudioLevels);
    } catch (err) {
      console.error("Failed to start recording:", err);
    }
  }, [disabled, isRecording, onTranscript, updateAudioLevels]);

  const stopRecording = useCallback(() => {
    if (!isRecording) return;

    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    setIsRecording(false);
    setAudioLevels(Array(BARS_RECORDING).fill(0));
    playStopSound();
  }, [isRecording]);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  // Handle Control key shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Control key (without other modifiers)
      if (e.key === "Control" && !e.metaKey && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        if (!isRecording) {
          startRecording();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Control" && isRecording) {
        stopRecording();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [isRecording, startRecording, stopRecording]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      audioContextRef.current?.close();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Update visualization when recording
  useEffect(() => {
    if (isRecording && analyserRef.current && !animationFrameRef.current) {
      animationFrameRef.current = requestAnimationFrame(updateAudioLevels);
    }
  }, [isRecording, updateAudioLevels]);

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2">
      {/* Tooltip */}
      <AnimatePresence>
        {showTooltip && !isRecording && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.15 }}
            className="px-3 py-2 rounded-full bg-dm-surface border border-dm-border text-xs text-gray-300 whitespace-nowrap shadow-lg"
          >
            Hold <span className="text-pink-400 font-medium">Control</span> to dictate
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mic Pill - Frosted Glass */}
      <motion.button
        onClick={toggleRecording}
        onMouseEnter={() => {
          setIsHovered(true);
          setShowTooltip(true);
        }}
        onMouseLeave={() => {
          setIsHovered(false);
          setShowTooltip(false);
        }}
        disabled={disabled}
        className={`relative rounded-full shadow-lg backdrop-blur-xl disabled:opacity-50 disabled:cursor-not-allowed ${
          isRecording
            ? "bg-white/15 border border-pink-400/40"
            : "bg-white/10 border border-white/20 hover:bg-white/15 hover:border-white/30"
        }`}
        animate={{
          width: isRecording ? 120 : isHovered ? 100 : 56,
          height: isRecording ? 42 : isHovered ? 36 : 14,
        }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        whileTap={{ scale: 0.97 }}
        aria-label={isRecording ? "Stop recording" : "Start recording"}
      >
        {/* Dots/bars - always visible */}
        <motion.div
          className="flex items-center justify-center gap-[3px]"
          animate={{ opacity: 1 }}
        >
          {Array.from({ length: visibleDots }).map((_, i) => {
            const levelIndex = Math.floor((i / visibleDots) * BARS_RECORDING);
            const level = audioLevels[levelIndex];

            return (
              <motion.div
                key={i}
                className={`rounded-full ${
                  isRecording
                    ? "bg-pink-400"
                    : isHovered
                      ? "bg-white/70"
                      : "bg-white/50"
                }`}
                animate={{
                  width: isRecording ? 3 : isHovered ? 3 : 2,
                  height: isRecording ? Math.max(4, level * 20) : isHovered ? 4 : 2,
                }}
                transition={{ duration: 0.05 }}
              />
            );
          })}
        </motion.div>

        {/* Glow effect when recording */}
        {isRecording && (
          <motion.div
            className="absolute inset-0 rounded-full bg-pink-500/30 blur-xl -z-10"
            animate={{ opacity: [0.4, 0.7, 0.4] }}
            transition={{ repeat: Infinity, duration: 1.5 }}
          />
        )}
      </motion.button>
    </div>
  );
}
