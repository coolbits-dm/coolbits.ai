"use client";
import { useState } from "react";

type State = "idle" | "sending" | "ok" | "err";

export default function PingButton() {
  const [state, setState] = useState<State>("idle");

  async function onClick() {
    if (state === "sending") return;
    setState("sending");
    try {
      const response = await fetch("/api/proxy/task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job: "ping", args: { x: 1 } }),
      });
      setState(response.ok ? "ok" : "err");
    } catch {
      setState("err");
    } finally {
      setTimeout(() => setState("idle"), 1500);
    }
  }

  return (
    <button
      onClick={onClick}
      disabled={state === "sending"}
      className="border rounded px-3 py-2"
    >
      {state === "sending" ? "Sending…" : "Enqueue ping task"}
      {state === "ok" && <span className="ml-2 text-green-600">✓</span>}
      {state === "err" && <span className="ml-2 text-red-600">✗</span>}
    </button>
  );
}