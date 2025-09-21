// components/ChatMessage.tsx
"use client";

import clsx from "clsx";

export function ChatMessage({
  role,
  content,
}: {
  role: "user" | "assistant";
  content: string;
}) {
  const isUser = role === "user";
  return (
    <div
      className={clsx(
        "rounded-lg p-3 text-sm leading-relaxed",
        isUser ? "bg-zinc-900/70 border border-zinc-800" : "bg-transparent"
      )}
    >
      <div className="text-[11px] uppercase tracking-wide text-zinc-400 mb-1">
        {isUser ? "You" : "Andy"}
      </div>
      <div className="whitespace-pre-wrap text-zinc-100">{content}</div>
    </div>
  );
}
