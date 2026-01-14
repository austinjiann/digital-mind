"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRightIcon } from "@radix-ui/react-icons";
import { AgentConnection } from "@/lib/websocket";
import { StreamingAudioPlayer } from "@/lib/audio-player";
import { Header } from "@/components/header";
import { MessageBubble } from "@/components/chat/message-bubble";
import { SuggestedQuestions } from "@/components/chat/suggested-questions";
import { ChatInput } from "@/components/chat/chat-input";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface Latency {
  retrieval_ms: number;
  llm_first_token_ms: number;
  llm_total_ms: number;
  tts_first_chunk_ms?: number;
  tts_total_ms?: number;
  total_ms: number;
}

const WELCOME_SUGGESTIONS = [
  "Building social confidence",
  "Advancing my career",
  "Making great first impressions",
  "Mastering presentations or public speaking",
];

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentResponse, setCurrentResponse] = useState("");
  const [latency, setLatency] = useState<Latency | null>(null);
  const [readingMessageId, setReadingMessageId] = useState<string | null>(null);

  const connectionRef = useRef<AgentConnection | null>(null);
  const audioPlayerRef = useRef<StreamingAudioPlayer | null>(null);
  const currentMessageIdRef = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const currentResponseRef = useRef("");

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, currentResponse]);

  useEffect(() => {
    // Initialize audio player
    audioPlayerRef.current = new StreamingAudioPlayer();

    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:3002";
    const conn = new AgentConnection(wsUrl);
    connectionRef.current = conn;

    conn.subscribe(async (event) => {
      switch (event.type) {
        case "agent.thinking":
          setIsProcessing(true);
          setCurrentResponse("");
          currentResponseRef.current = "";
          currentMessageIdRef.current = crypto.randomUUID();
          break;


        case "agent.token":
          setCurrentResponse(event.accumulated);
          currentResponseRef.current = event.accumulated;
          break;

        case "agent.audio_chunk":
          // Only play audio if we're reading a specific message
          if (readingMessageId && event.audio && !event.is_last) {
            if (!audioPlayerRef.current?.playing) {
              await audioPlayerRef.current?.start();
            }
            await audioPlayerRef.current?.addChunk(event.audio);
          }
          if (event.is_last) {
            setReadingMessageId(null);
          }
          break;

        case "agent.done": {
          const finalContent = currentResponseRef.current;
          const messageId = currentMessageIdRef.current;

          currentResponseRef.current = "";
          currentMessageIdRef.current = null;

          if (messageId && finalContent) {
            setMessages((prev) => [
              ...prev,
              {
                id: messageId,
                role: "assistant",
                content: finalContent,
              },
            ]);
          }

          setCurrentResponse("");
          setIsProcessing(false);
          setLatency(event.latency);
          break;
        }

        case "agent.error":
          console.error("Agent error:", event.error);
          setIsProcessing(false);
          setCurrentResponse("");
          currentResponseRef.current = "";
          audioPlayerRef.current?.stop();
          setReadingMessageId(null);
          break;

        case "agent.interrupted":
          setIsProcessing(false);
          setCurrentResponse("");
          currentResponseRef.current = "";
          audioPlayerRef.current?.stop();
          setReadingMessageId(null);
          break;
      }
    });

    conn.connect();
    return () => conn.disconnect();
  }, [readingMessageId]);

  const sendMessage = (content?: string) => {
    const messageContent = content || input.trim();
    if (!messageContent || isProcessing) return;

    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", content: messageContent },
    ]);

    connectionRef.current?.send({
      type: "user.text",
      content: messageContent,
    });

    setInput("");
  };

  const handleReadAloud = (messageId: string, content: string) => {
    setReadingMessageId(messageId);
    // Request TTS for this specific message
    connectionRef.current?.send({
      type: "user.request_tts",
      content: content,
    });
  };

  const handleStopReading = () => {
    audioPlayerRef.current?.stop();
    setReadingMessageId(null);
    connectionRef.current?.send({ type: "user.interrupt" });
  };

  const showWelcome = messages.length === 0 && !isProcessing;

  return (
    <div className="flex flex-col h-screen">
      <Header userName="Austin" />

      {/* Scrollable messages area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto w-full px-4 py-4 space-y-6">
          {/* Latency HUD */}
        <AnimatePresence>
          {latency && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="text-xs text-gray-500 py-2 font-mono bg-dm-surface/80 backdrop-blur-sm border border-dm-border rounded-lg mt-4 px-3"
            >
              <span className="mr-3">Retrieval: {latency.retrieval_ms}ms</span>
              <span className="mr-3">LLM TTFT: {latency.llm_first_token_ms}ms</span>
              <span className="mr-3">LLM: {latency.llm_total_ms}ms</span>
              {latency.tts_first_chunk_ms !== undefined && (
                <span className="mr-3">TTS TTFC: {latency.tts_first_chunk_ms}ms</span>
              )}
              {latency.tts_total_ms !== undefined && (
                <span className="mr-3">TTS: {latency.tts_total_ms}ms</span>
              )}
              <span className="font-bold text-dm-accent">
                Total: {latency.total_ms}ms
              </span>
            </motion.div>
          )}
        </AnimatePresence>


        {/* Messages */}
        <div className="space-y-6">
          {/* Welcome message */}
          <AnimatePresence>
            {showWelcome && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.4 }}
                className="p-6 rounded-xl border border-dm-border bg-dm-surface/80 backdrop-blur-sm"
              >
                <motion.p
                  className="text-gray-200 mb-4"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.1 }}
                >
                  Hi! I&apos;m Austin, your RAG-powered voice agent. I can help you
                  with real-time information and insights.
                </motion.p>
                <motion.p
                  className="text-gray-200 mb-4"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 }}
                >
                  In the next 2 mins, I&apos;ll teach you a powerful cue to instantly
                  make you more charismatic.
                </motion.p>
                <motion.p
                  className="text-gray-300 mb-4"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                >
                  What can I assist you with today?
                </motion.p>
                <div className="space-y-2">
                  {WELCOME_SUGGESTIONS.map((suggestion, index) => (
                    <motion.button
                      key={suggestion}
                      onClick={() => sendMessage(suggestion)}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.4 + index * 0.1 }}
                      whileHover={{ x: 4 }}
                      className="flex items-center gap-2 text-gray-300 hover:text-white transition-colors"
                    >
                      <ArrowRightIcon className="w-4 h-4 text-dm-accent" />
                      <span>{suggestion}</span>
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Chat messages */}
          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              role={msg.role}
              content={msg.content}
              onReadAloud={
                msg.role === "assistant"
                  ? () => handleReadAloud(msg.id, msg.content)
                  : undefined
              }
              onStopReading={handleStopReading}
              isReading={readingMessageId === msg.id}
            />
          ))}


          {/* Streaming response */}
          {currentResponse && (
            <MessageBubble
              role="assistant"
              content={currentResponse}
              isStreaming
            />
          )}

          {/* Processing indicator */}
          <AnimatePresence>
            {isProcessing && !currentResponse && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="p-4 rounded-xl bg-dm-surface/80 backdrop-blur-sm border border-dm-border"
              >
                <div className="flex items-center gap-2 text-gray-500">
                  {[0, 1, 2].map((i) => (
                    <motion.div
                      key={i}
                      className="w-2 h-2 bg-dm-accent rounded-full"
                      animate={{ y: [0, -8, 0] }}
                      transition={{
                        repeat: Infinity,
                        duration: 0.6,
                        delay: i * 0.1,
                      }}
                    />
                  ))}
                  <span className="ml-2 text-gray-400">Thinking...</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div ref={messagesEndRef} />
        </div>
        </div>
      </div>

      {/* Fixed bottom area */}
      <div className="flex-shrink-0 border-t border-dm-border/50 bg-dm-bg">
        <div className="max-w-4xl mx-auto w-full px-4 py-4 space-y-4">
          {/* Suggested questions */}
          <SuggestedQuestions
            onSelect={(question) => sendMessage(question)}
            disabled={isProcessing}
          />

          {/* Chat input */}
          <ChatInput
            value={input}
            onChange={setInput}
            onSubmit={() => sendMessage()}
            disabled={isProcessing}
          />
        </div>
      </div>
    </div>
  );
}
