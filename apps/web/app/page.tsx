"use client";

import { useState, useEffect, useRef } from "react";
import { AgentConnection } from "@/lib/websocket";
import { StreamingAudioPlayer } from "@/lib/audio-player";

interface Source {
  chunk_id: string;
  document_id: string;
  filename: string;
  excerpt: string;
  score: number;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
}

interface Latency {
  retrieval_ms: number;
  llm_first_token_ms: number;
  llm_total_ms: number;
  tts_first_chunk_ms?: number;
  tts_total_ms?: number;
  total_ms: number;
}

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [currentResponse, setCurrentResponse] = useState("");
  const [currentSources, setCurrentSources] = useState<Source[]>([]);
  const [latency, setLatency] = useState<Latency | null>(null);

  const connectionRef = useRef<AgentConnection | null>(null);
  const audioPlayerRef = useRef<StreamingAudioPlayer | null>(null);
  const currentMessageIdRef = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const currentResponseRef = useRef("");
  const currentSourcesRef = useRef<Source[]>([]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, currentResponse]);

  useEffect(() => {
    // Initialize audio player
    audioPlayerRef.current = new StreamingAudioPlayer();

    const wsUrl =
      process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:3002";
    const conn = new AgentConnection(wsUrl);
    connectionRef.current = conn;

    conn.subscribe(async (event) => {
      switch (event.type) {
        case "agent.thinking":
          setIsProcessing(true);
          setCurrentResponse("");
          setCurrentSources([]);
          currentResponseRef.current = "";
          currentSourcesRef.current = [];
          currentMessageIdRef.current = crypto.randomUUID();
          break;

        case "agent.sources":
          setCurrentSources(event.sources);
          currentSourcesRef.current = event.sources;
          break;

        case "agent.token":
          setCurrentResponse(event.accumulated);
          currentResponseRef.current = event.accumulated;
          break;

        case "agent.audio_chunk":
          if (event.is_last) {
            // Audio stream finished
            setIsSpeaking(false);
          } else if (event.audio) {
            // Start audio player if not already playing
            if (!audioPlayerRef.current?.playing) {
              await audioPlayerRef.current?.start();
              setIsSpeaking(true);
            }
            await audioPlayerRef.current?.addChunk(event.audio);
          }
          break;

        case "agent.done": {
          // Capture values BEFORE any resets
          const finalContent = currentResponseRef.current;
          const finalSources = [...currentSourcesRef.current];
          const messageId = currentMessageIdRef.current;

          // Reset refs immediately
          currentResponseRef.current = "";
          currentSourcesRef.current = [];
          currentMessageIdRef.current = null;

          // Add message if we have content
          if (messageId && finalContent) {
            setMessages((prev) => [
              ...prev,
              {
                id: messageId,
                role: "assistant",
                content: finalContent,
                sources: finalSources,
              },
            ]);
          }

          // Reset state
          setCurrentResponse("");
          setCurrentSources([]);
          setIsProcessing(false);
          setLatency(event.latency);
          break;
        }

        case "agent.error":
          console.error("Agent error:", event.error);
          setIsProcessing(false);
          setIsSpeaking(false);
          setCurrentResponse("");
          currentResponseRef.current = "";
          audioPlayerRef.current?.stop();
          break;

        case "agent.interrupted":
          setIsProcessing(false);
          setIsSpeaking(false);
          setCurrentResponse("");
          currentResponseRef.current = "";
          audioPlayerRef.current?.stop();
          break;
      }
    });

    conn.connect();
    return () => conn.disconnect();
  }, []);

  const sendMessage = () => {
    if (!input.trim() || isProcessing) return;

    // Add user message
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", content: input },
    ]);

    // Send to agent
    connectionRef.current?.send({
      type: "user.text",
      content: input,
    });

    setInput("");
  };

  const handleInterrupt = () => {
    audioPlayerRef.current?.stop();
    setIsSpeaking(false);
    connectionRef.current?.send({ type: "user.interrupt" });
  };

  return (
    <div className="flex flex-col h-screen max-w-3xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-2">Digital Mind</h1>

      {/* Latency HUD */}
      {latency && (
        <div className="text-xs text-gray-500 mb-4 font-mono bg-gray-100 p-2 rounded">
          <span className="mr-3">Retrieval: {latency.retrieval_ms}ms</span>
          <span className="mr-3">LLM TTFT: {latency.llm_first_token_ms}ms</span>
          <span className="mr-3">LLM: {latency.llm_total_ms}ms</span>
          {latency.tts_first_chunk_ms !== undefined && (
            <span className="mr-3">TTS TTFC: {latency.tts_first_chunk_ms}ms</span>
          )}
          {latency.tts_total_ms !== undefined && (
            <span className="mr-3">TTS: {latency.tts_total_ms}ms</span>
          )}
          <span className="font-bold">Total: {latency.total_ms}ms</span>
        </div>
      )}

      {/* Speaking indicator */}
      {isSpeaking && (
        <div className="flex items-center gap-3 mb-4 p-2 bg-green-50 rounded-lg">
          <div className="flex gap-1">
            <span className="w-2 h-4 bg-green-500 rounded animate-[bounce_0.5s_ease-in-out_infinite]" />
            <span className="w-2 h-4 bg-green-500 rounded animate-[bounce_0.5s_ease-in-out_infinite_0.1s]" style={{ animationDelay: "0.1s" }} />
            <span className="w-2 h-4 bg-green-500 rounded animate-[bounce_0.5s_ease-in-out_infinite_0.2s]" style={{ animationDelay: "0.2s" }} />
          </div>
          <span className="text-sm text-green-700">Speaking...</span>
          <button
            onClick={handleInterrupt}
            className="ml-auto text-sm px-3 py-1 bg-red-100 text-red-600 rounded hover:bg-red-200"
          >
            Stop
          </button>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 mb-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`p-4 rounded-lg ${
              msg.role === "user" ? "bg-blue-100 ml-12" : "bg-gray-100 mr-12"
            }`}
          >
            <div className="whitespace-pre-wrap">{msg.content}</div>
            {msg.sources && msg.sources.length > 0 && (
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer text-gray-600 hover:text-gray-800">
                  {msg.sources.length} source{msg.sources.length > 1 ? "s" : ""}
                </summary>
                <ul className="mt-2 space-y-2">
                  {msg.sources.map((s) => (
                    <li
                      key={s.chunk_id}
                      className="bg-white p-2 rounded border text-gray-700"
                    >
                      <div className="font-medium text-gray-900">
                        {s.filename}
                      </div>
                      <div className="text-xs text-gray-500">
                        Score: {(s.score * 100).toFixed(1)}%
                      </div>
                      <div className="mt-1 text-gray-600">{s.excerpt}</div>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        ))}

        {/* Streaming response */}
        {currentResponse && (
          <div className="p-4 rounded-lg bg-gray-100 mr-12">
            <div className="whitespace-pre-wrap">
              {currentResponse}
              <span className="animate-pulse">▊</span>
            </div>
          </div>
        )}

        {/* Processing indicator */}
        {isProcessing && !currentResponse && (
          <div className="p-4 rounded-lg bg-gray-100 mr-12">
            <div className="flex items-center gap-2 text-gray-500">
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
              <div
                className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                style={{ animationDelay: "0.1s" }}
              />
              <div
                className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                style={{ animationDelay: "0.2s" }}
              />
              <span className="ml-2">Thinking...</span>
            </div>
          </div>
        )}

        {messages.length === 0 && !isProcessing && (
          <div className="text-center text-gray-500 py-8">
            Start a conversation with your Digital Mind
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          placeholder="Ask me anything..."
          className="flex-1 p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={isProcessing}
        />
        <button
          onClick={sendMessage}
          disabled={isProcessing || !input.trim()}
          className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Send
        </button>
      </div>
    </div>
  );
}
