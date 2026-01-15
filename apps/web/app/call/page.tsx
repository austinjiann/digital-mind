"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { AgentConnection } from "@/lib/websocket";
import { StreamingAudioPlayer } from "@/lib/audio-player";
import { getRandomSuggestions } from "@/components/chat/suggested-questions";

export default function CallPage() {
  const router = useRouter();
  const [isConnected, setIsConnected] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [callStarted, setCallStarted] = useState(false);
  const [callTime, setCallTime] = useState(0);

  const connectionRef = useRef<AgentConnection | null>(null);
  const audioPlayerRef = useRef<StreamingAudioPlayer | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // Refs to avoid stale closures in speech recognition handlers
  const isRecordingRef = useRef(false);
  const isSpeakingRef = useRef(false);

  // Get random suggestions from shared pool (only on client to avoid hydration mismatch)
  const [suggestions, setSuggestions] = useState<string[]>([]);
  useEffect(() => {
    setSuggestions(getRandomSuggestions(4));
  }, []);

  // Call timer - only starts when mic is first tapped
  useEffect(() => {
    if (!callStarted) return;
    const interval = setInterval(() => {
      setCallTime((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [callStarted]);

  // Sync isRecording ref with state
  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  // Sync isSpeaking ref and pause/resume recognition
  useEffect(() => {
    isSpeakingRef.current = isSpeaking;
    if (isSpeaking && recognitionRef.current) {
      // Stop listening while agent speaks to avoid picking up audio
      recognitionRef.current.stop();
    } else if (!isSpeaking && isRecordingRef.current && recognitionRef.current) {
      // Resume listening when agent finishes speaking
      try {
        recognitionRef.current.start();
      } catch {
        // Already started or not ready
      }
    }
  }, [isSpeaking]);

  // Format time as MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  useEffect(() => {
    // Initialize audio player with speaking state tracking
    audioPlayerRef.current = new StreamingAudioPlayer();
    audioPlayerRef.current.onEnd(() => {
      setIsSpeaking(false);
    });

    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:3002";
    const conn = new AgentConnection(wsUrl);
    connectionRef.current = conn;

    conn.subscribe(async (event) => {
      switch (event.type) {
        case "agent.thinking":
          setIsThinking(true);
          setIsSpeaking(false);
          // Reset audio player for new response
          audioPlayerRef.current?.stop();
          break;

        case "agent.token":
          // Text is streaming
          break;

        case "agent.audio_chunk":
          if (event.audio && !event.is_last) {
            setIsThinking(false);
            setIsSpeaking(true);
            if (!audioPlayerRef.current?.playing) {
              await audioPlayerRef.current?.start();
            }
            await audioPlayerRef.current?.addChunk(event.audio, event.chunk_index);
          }
          break;

        case "agent.done":
          setIsThinking(false);
          break;

        case "agent.error":
          console.error("Agent error:", event.error);
          setIsThinking(false);
          setIsSpeaking(false);
          audioPlayerRef.current?.stop();
          break;

        case "agent.interrupted":
          setIsThinking(false);
          setIsSpeaking(false);
          audioPlayerRef.current?.stop();
          break;
      }
    });

    conn.connect();
    setIsConnected(true);

    return () => {
      conn.disconnect();
      recognitionRef.current?.stop();
    };
  }, []);

  const toggleRecording = async () => {
    if (isRecording) {
      // Stop recording
      recognitionRef.current?.stop();
      setIsRecording(false);
    } else {
      // Start recording with speech recognition
      setIsRecording(true);
      if (!callStarted) setCallStarted(true);

      // Use Web Speech API
      const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;

        recognition.onresult = (event) => {
          for (let i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal) {
              const transcript = event.results[i][0].transcript.trim();
              if (transcript) {
                connectionRef.current?.send({
                  type: "user.text",
                  content: transcript,
                });
              }
            }
          }
        };

        recognition.onerror = (event) => {
          console.error("Speech recognition error:", event.error);
          setIsRecording(false);
        };

        recognition.onend = () => {
          // Use refs to get current values (avoid stale closure)
          // Add delay to prevent rapid cycling during silence
          setTimeout(() => {
            if (isRecordingRef.current && !isSpeakingRef.current) {
              try {
                recognition.start();
              } catch {
                // Already started
              }
            }
          }, 300);
        };

        recognitionRef.current = recognition;
        recognition.start();
      }
    }
  };

  const handleEndCall = () => {
    // Stop everything and reset state (don't navigate away)
    audioPlayerRef.current?.stop();
    recognitionRef.current?.stop();

    // Interrupt any ongoing response
    connectionRef.current?.send({ type: "user.interrupt" });

    // Reset all state
    setIsRecording(false);
    setIsThinking(false);
    setIsSpeaking(false);
    setCallStarted(false);
    setCallTime(0);
  };

  return (
    <div className="relative flex flex-col h-screen bg-dm-bg">
      {/* Header */}
      <header className="grid grid-cols-3 items-center px-4 py-3 border-b border-dm-border">
        {/* Left: Logo and name */}
        <div className="flex items-center gap-3">
          <Link href="/">
            <Image
              src="/logo.png"
              alt="Digital Mind"
              width={32}
              height={32}
              className="cursor-pointer"
            />
          </Link>
          <div className="h-6 w-px bg-dm-border" />
          <div className="flex items-center gap-2">
            <Image
              src="/austin-pfp.jpg"
              alt="Austin"
              width={24}
              height={24}
              className="rounded-full"
            />
            <span className="font-medium text-gray-100">Austin Jian</span>
          </div>
        </div>

        {/* Center: Call time and status badges */}
        <div className="flex items-center justify-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-dm-surface border border-dm-border">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-gray-400"
            >
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
            <span className="text-gray-300 text-sm">
              {formatTime(callTime)}
            </span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-dm-surface border border-dm-border">
            <span className="w-2 h-2 rounded-full bg-dm-accent" />
            <span className="text-gray-300 text-sm">Unlimited</span>
          </div>
        </div>

        {/* Right: Empty for balance */}
        <div />
      </header>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        {/* Profile picture with animated ring */}
        <div className="relative">
          {/* Animated orange ring when speaking */}
          <AnimatePresence>
            {isSpeaking && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="absolute inset-0 -m-2"
              >
                <svg
                  className="w-full h-full"
                  viewBox="0 0 200 200"
                  style={{ transform: "rotate(-90deg)" }}
                >
                  <defs>
                    <linearGradient
                      id="speakingGradient"
                      x1="0%"
                      y1="0%"
                      x2="100%"
                      y2="0%"
                    >
                      <stop offset="0%" stopColor="#f97316" stopOpacity="1" />
                      <stop offset="50%" stopColor="#fb923c" stopOpacity="0.5" />
                      <stop offset="100%" stopColor="#f97316" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <motion.circle
                    cx="100"
                    cy="100"
                    r="95"
                    fill="none"
                    stroke="url(#speakingGradient)"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeDasharray="300 300"
                    animate={{ rotate: 360 }}
                    transition={{
                      repeat: Infinity,
                      duration: 1.5,
                      ease: "linear",
                    }}
                    style={{ transformOrigin: "center" }}
                  />
                </svg>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Static border when not speaking */}
          <div
            className={`w-48 h-48 rounded-full overflow-hidden border-4 ${
              isSpeaking ? "border-transparent" : "border-dm-border"
            } transition-colors`}
          >
            <Image
              src="/austin-pfp.jpg"
              alt="Austin"
              width={192}
              height={192}
              className="w-full h-full object-cover"
            />
          </div>
        </div>

        {/* Name */}
        <h1 className="text-3xl font-semibold text-gray-100">Austin Jian</h1>

        {/* Status indicator */}
        <AnimatePresence mode="wait">
          {isThinking ? (
            <motion.div
              key="thinking"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-dm-accent/20"
            >
              <span className="text-dm-accent">Thinking</span>
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="w-1.5 h-1.5 bg-dm-accent rounded-full"
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{
                      repeat: Infinity,
                      duration: 1,
                      delay: i * 0.2,
                    }}
                  />
                ))}
              </div>
            </motion.div>
          ) : isSpeaking ? (
            <motion.div
              key="speaking"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-dm-accent/20"
            >
              <span className="text-dm-accent">Speaking</span>
              <div className="flex gap-1 items-end h-4">
                {[0, 1, 2, 3, 4].map((i) => (
                  <motion.div
                    key={i}
                    className="w-1 bg-dm-accent rounded-full"
                    animate={{ height: ["8px", "16px", "8px"] }}
                    transition={{
                      repeat: Infinity,
                      duration: 0.5,
                      delay: i * 0.1,
                    }}
                  />
                ))}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="ready"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="px-4 py-2 rounded-full bg-dm-surface border border-dm-border"
            >
              <span className="text-gray-400">
                {isRecording ? "Listening..." : "Tap mic to speak"}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Suggested talking points - only show before call starts */}
        <AnimatePresence>
          {!callStarted && !isThinking && !isSpeaking && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ delay: 0.3 }}
              className="flex flex-wrap justify-center gap-2 max-w-md mt-4"
            >
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => {
                    if (!callStarted) setCallStarted(true);
                    connectionRef.current?.send({
                      type: "user.text",
                      content: suggestion,
                    });
                  }}
                  className="px-3 py-1.5 text-sm text-gray-400 bg-dm-surface/50 border border-dm-border/50 rounded-full hover:bg-dm-surface hover:text-gray-300 hover:border-dm-border transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom controls */}
      <div className="absolute bottom-12 left-0 right-0 flex justify-center gap-6">
        {/* Mic button */}
        <motion.button
          onClick={toggleRecording}
          whileTap={{ scale: 0.95 }}
          className={`w-16 h-16 rounded-full flex items-center justify-center transition-colors ${
            isRecording
              ? "bg-dm-accent text-white"
              : "bg-dm-surface-hover text-gray-300 hover:bg-dm-surface"
          }`}
        >
          <svg
            width="24"
            height="24"
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
        </motion.button>

        {/* End call button */}
        <motion.button
          onClick={handleEndCall}
          whileTap={{ scale: 0.95 }}
          className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center text-white transition-colors"
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
            <line x1="23" x2="1" y1="1" y2="23" />
          </svg>
        </motion.button>
      </div>
    </div>
  );
}
