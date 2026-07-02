import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Thought-to-Docs",
  description: "Brain-dump a raw thought; an LLM files it into living project docs.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
