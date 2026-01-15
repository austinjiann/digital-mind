"use client";

import { motion, AnimatePresence } from "framer-motion";
import { PaperPlaneIcon } from "@radix-ui/react-icons";
import { VoiceButton } from "./voice-button";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  interimTranscript?: string;
}

export function ChatInput({
  value,
  onChange,
  onSubmit,
  disabled,
  interimTranscript,
}: ChatInputProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  };

  const hasText = value.trim().length > 0;

  const handleTranscript = (text: string) => {
    onChange(text);
  };

  return (
    <motion.div
      className="flex items-center"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="flex-1 flex items-center gap-3 px-4 py-3 bg-dm-surface/80 backdrop-blur-md border border-dm-border rounded-xl">
        {/* Text input */}
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={interimTranscript || "Type..."}
          className="flex-1 bg-transparent text-gray-200 placeholder-gray-400 focus:outline-none"
          disabled={disabled}
        />

        {/* Swap between Voice button and Send button */}
        <AnimatePresence mode="wait">
          {hasText ? (
            <motion.button
              key="send"
              onClick={onSubmit}
              disabled={disabled}
              initial={{ opacity: 0, scale: 0.8, rotate: -90 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              exit={{ opacity: 0, scale: 0.8, rotate: 90 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              className="p-3 bg-dm-accent text-white rounded-xl hover:bg-orange-600 disabled:opacity-50 transition-colors"
            >
              <PaperPlaneIcon className="w-5 h-5" />
            </motion.button>
          ) : (
            <motion.div
              key="voice"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <VoiceButton
                onTranscript={handleTranscript}
                disabled={disabled}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
