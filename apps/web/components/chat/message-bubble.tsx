"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SpeakerLoudIcon, StopIcon } from "@radix-ui/react-icons";

interface MessageBubbleProps {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
  onReadAloud?: () => void;
  onStopReading?: () => void;
  isReading?: boolean;
}

export function MessageBubble({
  role,
  content,
  isStreaming,
  onReadAloud,
  onStopReading,
  isReading,
}: MessageBubbleProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="relative"
    >
      <div
        className="p-4 rounded-xl border border-dm-border bg-dm-surface/80 backdrop-blur-sm"
      >
        <motion.div
          className="whitespace-pre-wrap text-gray-200"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
        >
          {content}
          {isStreaming && (
            <motion.span
              className="text-dm-accent"
              animate={{ opacity: [1, 0, 1] }}
              transition={{ repeat: Infinity, duration: 1 }}
            >
              ▊
            </motion.span>
          )}
        </motion.div>

      </div>

      {/* Read Aloud button - only show for assistant messages */}
      {role === "assistant" && !isStreaming && onReadAloud && (
        <>
          <AnimatePresence>
            {(isHovered || isReading) && (
              <motion.button
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                onClick={isReading ? onStopReading : onReadAloud}
                className={`absolute bottom-3 right-3 flex items-center justify-center gap-2 w-[110px] py-1.5 text-sm backdrop-blur-xl rounded-full shadow-lg transition-colors ${
                  isReading
                    ? "bg-white/15 border border-orange-400/40 text-orange-400"
                    : "bg-white/10 border border-white/20 text-gray-300 hover:bg-white/15 hover:border-white/30 hover:text-white"
                }`}
              >
                {isReading ? (
                  <>
                    <StopIcon className="w-4 h-4" />
                    <span>Stop</span>
                  </>
                ) : (
                  <>
                    <SpeakerLoudIcon className="w-4 h-4" />
                    <span>Read aloud</span>
                  </>
                )}
              </motion.button>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {isHovered && !isReading && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute -bottom-5 right-3 text-[11px] text-gray-400"
              >
                May take time depending on Modal server
              </motion.span>
            )}
          </AnimatePresence>
        </>
      )}
    </motion.div>
  );
}
