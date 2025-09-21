// components/AccentPicker.tsx
"use client";

import { useEffect, useState, useRef } from "react";
import { Palette } from "lucide-react";
import { IconButton } from "./Ui";

const ACCENTS: Record<string, string> = {
  blue: "#2563eb",
  violet: "#7c3aed",
  emerald: "#10b981",
  orange: "#f59e0b",
  pink: "#ec4899",
};

function useOutsideClose<T extends HTMLElement>(open: boolean, onClose: () => void) {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!open || !ref.current) return;
      if (!ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, onClose]);
  return ref;
}

export function AccentPicker() {
  const [open, setOpen] = useState(false);
  const [accent, setAccent] = useState<string>("blue");
  const ref = useOutsideClose<HTMLDivElement>(open, () => setOpen(false));

  useEffect(() => {
    const saved = localStorage.getItem("cb-accent");
    if (saved && ACCENTS[saved]) {
      setAccent(saved);
      applyAccent(saved);
    } else {
      // default
      applyAccent("blue");
    }
  }, []);

  function applyAccent(name: string) {
    const val = ACCENTS[name];
    const root = document.documentElement;
    root.style.setProperty("--accent", val);
    // când userul selectează, logo-ul urmează accentul în ambele teme
    root.setAttribute("data-accent-override", "true");
  }

  function onPick(name: string) {
    setAccent(name);
    localStorage.setItem("cb-accent", name);
    applyAccent(name);
    setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <IconButton aria-label="Accent color" onClick={() => setOpen(v => !v)} title="Accent color">
        <Palette className="size-5" />
      </IconButton>

      {open && (
        <div className="absolute right-0 mt-2 w-44 rounded-xl border border-zinc-800 bg-zinc-950 shadow-xl p-2 z-50">
          <div className="grid grid-cols-5 gap-2">
            {Object.entries(ACCENTS).map(([name, hex]) => (
              <button
                key={name}
                onClick={() => onPick(name)}
                className="h-7 w-7 rounded-full border border-zinc-700"
                style={{ backgroundColor: hex, outline: accent === name ? `2px solid ${hex}` : undefined }}
                aria-label={`Accent ${name}`}
                title={name}
              />
            ))}
          </div>
          <div className="mt-2 text-[11px] text-zinc-400">Afectează linii, focus, butoane și logo.</div>
        </div>
      )}
    </div>
  );
}

