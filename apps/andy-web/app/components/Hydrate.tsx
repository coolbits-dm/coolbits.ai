// app/components/Hydrate.tsx
"use client";

import { useEffect, useState } from "react";

export function Hydrate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!ready) return null;
  return <>{children}</>;
}
