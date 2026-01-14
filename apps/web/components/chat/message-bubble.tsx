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
        <AnimatePresence>
          {(isHovered || isReading) && (
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              onClick={isReading ? onStopReading : onReadAloud}
              className="absolute bottom-3 right-3 flex items-center gap-2 px-3 py-1.5 text-sm text-gray-400 bg-dm-surface/95 backdrop-blur-sm border border-dm-border rounded-lg hover:text-gray-200 hover:bg-dm-surface-hover transition-colors"
            >
              {isReading ? (
                <>
                  <StopIcon className="w-4 h-4" />
                  <span>Stop</span>
                </>
              ) : (
                <>
                  <SpeakerLoudIcon className="w-4 h-4" />
                  <span>Read Aloud</span>
                </>
              )}
            </motion.button>
          )}
        </AnimatePresence>
      )}
    </motion.div>
  );
}
