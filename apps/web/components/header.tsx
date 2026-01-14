"use client";

import { CounterClockwiseClockIcon, PersonIcon } from "@radix-ui/react-icons";

interface HeaderProps {
  userName?: string;
}

export function Header({ userName = "Austin" }: HeaderProps) {
  return (
    <header className="flex items-center justify-between px-4 py-3 border-b border-dm-border">
      {/* Left: Logo + Chat History */}
      <div className="flex items-center gap-3">
        <div className="text-dm-accent text-xl font-bold">⌘</div>
        <button className="flex items-center gap-2 text-gray-400 hover:text-gray-200 transition-colors">
          <CounterClockwiseClockIcon className="w-4 h-4" />
          <span className="text-sm">Chat History</span>
        </button>
      </div>

      {/* Center: User name with badge */}
      <div className="flex items-center gap-2">
        <span className="text-dm-accent text-lg font-bold">⌘</span>
        <span className="font-semibold text-gray-100">{userName}</span>
        <span className="text-green-500 text-lg">●</span>
      </div>

      {/* Right: Avatar */}
      <div className="flex items-center gap-4">
        <div className="w-8 h-8 rounded-full bg-dm-surface-hover flex items-center justify-center">
          <PersonIcon className="w-4 h-4 text-gray-300" />
        </div>
      </div>
    </header>
  );
}
