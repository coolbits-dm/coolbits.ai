"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Mic, Plus, ArrowUp, Paperclip, Image as ImageIcon, FileText, Code2 } from "lucide-react";

export default function ChatWindow() {
  return (
    <>
      {/* zonă de scroll; rezerv loc pentru composerul fix */}
      <div className="h-full overflow-y-auto pb-[120px]" />

      {/* Composer (fixed, fără bordură, stă peste orice: z-60) */}
      <div
        className="fixed inset-x-0 bottom-0 z-60 bg-panel/90"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="mx-auto max-w-5xl px-4 py-3">
          <Composer />
          <div className="mt-2 text-center text-xs text-muted">
            Andy can make mistakes. Check important info. See Cookie Preferences.
          </div>
        </div>
      </div>
    </>
  );
}

function Composer() {
  const [value, setValue] = useState("");
  const [openPlus, setOpenPlus] = useState(false);
  const plusRef = useRef<HTMLDivElement>(null);

  const canSend = value.trim().length > 0;

  // close plus menu on outside click / esc
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!plusRef.current) return;
      if (!plusRef.current.contains(e.target as Node)) setOpenPlus(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenPlus(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, []);

  const handleSend = () => {
    if (!canSend) return;
    // mock send
    setValue("");
  };

  return (
    <div className="flex items-center gap-2">
      {/* PLUS + MENU */}
      <div className="relative" ref={plusRef}>
        <button
          aria-label="More input options"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-app/20 hover:bg-panel-soft"
          onClick={() => setOpenPlus((v) => !v)}
        >
          <Plus className="size-5" />
        </button>

        {openPlus && (
          <div
            role="menu"
            className="absolute bottom-12 left-0 z-70 w-56 rounded-xl bg-panel shadow-xl p-2"
          >
            <PlusItem icon={<Paperclip className="size-4" />} label="Attach file" />
            <PlusItem icon={<ImageIcon className="size-4" />} label="Insert image" />
            <PlusItem icon={<FileText className="size-4" />} label="From template" />
            <PlusItem icon={<Code2 className="size-4" />} label="Code block" />
          </div>
        )}
      </div>

      {/* INPUT + VOICE/SEND */}
      <div className="flex-1 flex h-11 items-center rounded-full bg-panel-soft px-3">
        <input
          className="flex-1 bg-transparent outline-none text-sm py-2"
          placeholder="Message Andy"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
        />

        {canSend ? (
          <button
            aria-label="Send"
            className={clsx(
              "flex h-8 w-8 items-center justify-center rounded-full",
              "hover:bg-panel"
            )}
            onClick={handleSend}
            title="Send"
          >
            <ArrowUp className="size-5" />
          </button>
        ) : (
          <button
            aria-label="Voice"
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-panel"
            title="Voice"
          >
            <Mic className="size-5" />
          </button>
        )}
      </div>
    </div>
  );
}

function PlusItem({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <button
      className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm hover:bg-panel-soft text-foreground/90"
      onClick={() => {/* mock */}}
      role="menuitem"
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
}
