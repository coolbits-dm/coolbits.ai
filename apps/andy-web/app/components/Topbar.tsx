// app/components/Topbar.tsx
"use client";

import { IconButton } from "./Ui";
import {
  MoreHorizontal,
  Share2,
  Sun,
  Moon,
  ChevronDown,
  Check,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";

const ACCENTS: Record<string, string> = {
  blue: "#2563eb",
  white: "#ffffff",
  graphite: "#121317",
  violet: "#7c3aed",
  emerald: "#10b981",
  orange: "#f59e0b",
  pink: "#ec4899",
};

function applyAccent(name: string | null) {
  const root = document.documentElement;
  if (!name) {
    root.style.removeProperty("--accent");
    root.removeAttribute("data-accent-override");
    localStorage.removeItem("cb-accent");
    return;
  }
  const v = ACCENTS[name];
  if (!v) return;
  root.style.setProperty("--accent", v);
  root.setAttribute("data-accent-override", "true");
  localStorage.setItem("cb-accent", name);
}

function useAccent() {
  const [accent, setAccent] = useState<string | null>(null);
  useEffect(() => {
    const saved = localStorage.getItem("cb-accent");
    if (saved && ACCENTS[saved]) {
      setAccent(saved);
      applyAccent(saved);
    } else {
      setAccent(null);
      applyAccent(null);
    }
  }, []);
  const choose = (name: string) => {
    if (accent === name) {
      setAccent(null);
      applyAccent(null);
    } else {
      setAccent(name);
      applyAccent(name);
    }
  };
  return { accent, choose };
}

const MODELS = [
  "Andy o3 Auto",
  "Andy o3 Mini",
  "gpt-5-mini",
  "gpt-4.1",
  "Claude 3.5 Sonnet",
  "Llama 3.1 70B Instruct",
];

function ModelSelectInline() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(MODELS[0]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        className="inline-flex items-center gap-1.5 text-sm hover:underline focus:outline-none"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="font-medium">{selected}</span>
        <ChevronDown className="size-4" />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 mt-2 w-56 rounded-xl border border-app/10 bg-panel shadow-xl p-1 z-50"
        >
          {MODELS.map((m) => {
            const active = m === selected;
            return (
              <button
                key={m}
                role="option"
                aria-selected={active}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm hover:bg-panel-soft"
                onClick={() => {
                  setSelected(m);
                  setOpen(false);
                }}
              >
                <span className="truncate">{m}</span>
                {active && <Check className="size-4" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function OverflowMenu() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const { accent, choose } = useAccent();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  if (!mounted) {
    return (
      <IconButton aria-label="More">
        <MoreHorizontal className="size-5" />
      </IconButton>
    );
  }

  const isDark = theme !== "light";
  const Dot = ({ name }: { name: keyof typeof ACCENTS }) => {
    const selected = accent === name;
    return (
      <button
        className="h-3.5 w-3.5 rounded-full border border-app/20"
        style={{
          backgroundColor: ACCENTS[name],
          outline: selected ? `2px solid ${ACCENTS[name]}` : undefined,
          outlineOffset: 2,
        }}
        aria-label={`Accent ${name}`}
        title={name}
        onClick={() => choose(name)}
      />
    );
  };

  return (
    <div className="relative" ref={ref}>
      <IconButton aria-label="More" onClick={() => setOpen((v) => !v)}>
        <MoreHorizontal className="size-5" />
      </IconButton>

      {open && (
        <div className="absolute right-0 mt-2 w-56 rounded-xl border border-app/10 bg-panel shadow-xl p-2 z-50">
          <button
            className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm hover:bg-panel-soft"
            onClick={() => setOpen(false)}
          >
            <Share2 className="size-4" />
            <span>Share (mock)</span>
          </button>

          <button
            className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm hover:bg-panel-soft"
            onClick={() => setTheme(isDark ? "light" : "dark")}
          >
            {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
            <span>{isDark ? "Switch to light" : "Switch to dark"}</span>
          </button>

          <div className="my-2 h-px bg-app/10" />

          <div className="px-2.5 pb-1 text-xs text-muted">Accent color</div>
          <div className="px-2.5 pb-1 flex items-center gap-2">
            <Dot name="blue" />
            <Dot name="white" />
            <Dot name="graphite" />
            <Dot name="violet" />
            <Dot name="emerald" />
            <Dot name="orange" />
            <Dot name="pink" />
          </div>

          <div className="px-2.5 pt-1 text-[10px] text-muted/70">
            Tap same color again to reset to theme default.
          </div>
        </div>
      )}
    </div>
  );
}

export function Topbar() {
  return (
    <header className="h-14 bg-panel sticky top-0 z-30">
      <div className="h-full flex items-center justify-between px-4">
        <ModelSelectInline />
        <OverflowMenu />
      </div>
    </header>
  );
}
