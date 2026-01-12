"use client";

import { useState, useEffect, useRef } from "react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const sendMessage = () => {
    if (!input.trim() || isProcessing) return;

    // Add user message
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", content: input },
    ]);

    // TODO: Send to WebSocket agent
    setInput("");
  };

  return (
    <div className="flex flex-col h-screen max-w-3xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Digital Mind</h1>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 mb-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`p-4 rounded-lg ${
              msg.role === "user"
                ? "bg-blue-100 ml-12"
                : "bg-gray-100 mr-12"
            }`}
          >
            {msg.content}
          </div>
        ))}

        {messages.length === 0 && (
          <div className="text-center text-gray-500 py-8">
            Start a conversation with your Digital Mind
          </div>
        )}
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
