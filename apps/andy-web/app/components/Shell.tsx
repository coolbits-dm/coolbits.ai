// app/components/Shell.tsx
"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";

export default function Shell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  // read persistent state
  useEffect(() => {
    const saved = localStorage.getItem("cb-sb-collapsed");
    setCollapsed(saved === "1");
  }, []);

  // write CSS var + body class + persist
  useEffect(() => {
    document.body.classList.toggle("sb-collapsed", collapsed);
    document.body.style.setProperty("--sbw", collapsed ? "3.5rem" : "16rem");
    localStorage.setItem("cb-sb-collapsed", collapsed ? "1" : "0");
  }, [collapsed]);

  return (
    <div className="h-dvh grid grid-cols-[var(--sbw)_1fr] overflow-hidden transition-[grid-template-columns] duration-200">
      {/* col 1: width driven by --sbw */}
      <aside className="shrink-0 bg-panel">
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(v => !v)} />
      </aside>

      {/* col 2: main expands when --sbw scade */}
      <div className="min-w-0 flex flex-col">
        <Topbar />
        <main className="flex-1 min-h-0">{children}</main>
      </div>
    </div>
  );
}
