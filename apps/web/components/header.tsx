"use client";

import Link from "next/link";
import Image from "next/image";

interface HeaderProps {
  userName?: string;
}

export function Header({ userName = "Austin" }: HeaderProps) {
  return (
    <header className="grid grid-cols-3 items-center px-4 py-3 border-b border-dm-border">
      {/* Left: Logo and account */}
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

      {/* Center: User name with badge */}
      <div className="flex items-center justify-center gap-2">
        <Image
          src="/logo.png"
          alt="Digital Mind"
          width={24}
          height={24}
        />
        <span className="font-semibold text-gray-100">{userName}</span>
        <span className="text-green-500 text-lg">●</span>
      </div>

      {/* Right: Call button */}
      <div className="flex items-center justify-end gap-4">
        <Link
          href="/call"
          className="w-8 h-8 rounded-full bg-dm-surface-hover flex items-center justify-center hover:bg-dm-accent/20 transition-colors"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-gray-300"
          >
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
          </svg>
        </Link>
      </div>
    </header>
  );
}
