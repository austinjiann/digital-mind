"use client";

import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { StopIcon } from "@radix-ui/react-icons";

// Custom Mic Icon since Radix doesn't have one
function MicIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}

interface VoiceButtonProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}

export function VoiceButton({ onTranscript, disabled }: VoiceButtonProps) {
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const toggleRecording = () => {
    if (isRecording) {
      // Stop recording
      recognitionRef.current?.stop();
      setIsRecording(false);
    } else {
      // Start recording with Web Speech API
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

      if (!SpeechRecognition) {
        console.error("Speech recognition not supported");
        return;
      }

      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = "en-US";

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        onTranscript(transcript);
      };

      recognition.onerror = (event) => {
        console.error("Speech recognition error:", event.error);
        setIsRecording(false);
      };

      recognition.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
      setIsRecording(true);
    }
  };

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  return (
    <motion.button
      onClick={toggleRecording}
      disabled={disabled}
      className={`p-3 rounded-xl transition-all ${
        isRecording
          ? "bg-red-500 hover:bg-red-600 text-white"
          : "bg-dm-surface/80 backdrop-blur-md hover:bg-dm-surface-hover text-gray-400 hover:text-gray-200 border border-dm-border"
      } disabled:opacity-50 disabled:cursor-not-allowed`}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      animate={isRecording ? { scale: [1, 1.05, 1] } : {}}
      transition={isRecording ? { repeat: Infinity, duration: 1 } : {}}
      aria-label={isRecording ? "Stop recording" : "Start recording"}
    >
      {isRecording ? (
        <StopIcon className="w-5 h-5" />
      ) : (
        <MicIcon className="w-5 h-5" />
      )}
    </motion.button>
  );
}
