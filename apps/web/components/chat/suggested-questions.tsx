"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronUpIcon, ChevronDownIcon, ArrowRightIcon } from "@radix-ui/react-icons";

const SUGGESTIONS = [
  "What are PlayCreate and FlowBoard?",
  "What languages and frameworks do you use?",
  "What's your background?",
  "What are you working on right now?",
];

interface SuggestedQuestionsProps {
  onSelect: (question: string) => void;
  disabled?: boolean;
}

export function SuggestedQuestions({ onSelect, disabled }: SuggestedQuestionsProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="w-full">
      <motion.button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-center gap-2 mx-auto px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors rounded-lg border border-dm-border bg-dm-surface/80 backdrop-blur-md hover:bg-dm-surface-hover"
        disabled={disabled}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        <span>Suggested Questions</span>
        {isExpanded ? (
          <ChevronDownIcon className="w-4 h-4" />
        ) : (
          <ChevronUpIcon className="w-4 h-4" />
        )}
      </motion.button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, y: -10, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -10, height: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="mt-3 space-y-2 overflow-hidden"
          >
            {SUGGESTIONS.map((suggestion, index) => (
              <motion.button
                key={suggestion}
                onClick={() => onSelect(suggestion)}
                disabled={disabled}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05, duration: 0.2 }}
                whileHover={{ scale: 1.01, x: 4 }}
                whileTap={{ scale: 0.99 }}
                className="w-full flex items-center gap-3 px-4 py-3 text-left text-gray-300 rounded-lg border border-dm-border bg-dm-surface/80 backdrop-blur-md hover:bg-dm-surface-hover transition-colors disabled:opacity-50"
              >
                <ArrowRightIcon className="w-4 h-4 text-dm-accent flex-shrink-0" />
                <span>{suggestion}</span>
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
