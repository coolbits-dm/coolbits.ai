// app/components/ChatComposer.tsx
"use client";

import { useMemo, useState } from "react";
import { IconButton, Button } from "./Ui";
import { Plus, Mic, ArrowUp } from "lucide-react";

export default function ChatComposer() {
  const [value, setValue] = useState("");
  const canSend = useMemo(() => value.trim().length > 0, [value]);

  function handleSend() {
    if (!canSend) return;
    // mock
    setValue("");
  }

  return (
    <div className="mx-auto max-w-5xl px-3 md:px-4 py-3">
      <div className="flex items-center gap-2 rounded-2xl bg-panel-soft px-3 py-2 ring-accent">
        <div className="relative">
          <IconButton aria-label="More input options"><Plus className="size-5" /></IconButton>
        </div>

        <input
          className="flex-1 bg-transparent outline-none text-sm py-2"
          placeholder="Message Andy"
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
        />

        {!canSend ? (
          <IconButton aria-label="Voice"><Mic className="size-5" /></IconButton>
        ) : (
          <Button aria-label="Send" onClick={handleSend}><ArrowUp className="size-5" /></Button>
        )}
      </div>

      <div className="mt-2 text-center text-xs text-muted">
        Andy can make mistakes. Check important info. See Cookie Preferences.
      </div>
    </div>
  );
}
