import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Austin's Digital Mind",
  description: "Your personal AI assistant",
  icons: {
    icon: "/delphi.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-dm-bg">{children}</body>
    </html>
  );
}
