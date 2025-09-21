// app/components/Ui.tsx
"use client";

import clsx from "clsx";
import type {
  ButtonHTMLAttributes,
  DetailedHTMLProps,
  PropsWithChildren,
} from "react";

type BtnProps = DetailedHTMLProps<
  ButtonHTMLAttributes<HTMLButtonElement>,
  HTMLButtonElement
>;

export function Button({
  children,
  className,
  variant = "primary",
  size = "md",
  ...props
}: PropsWithChildren<BtnProps & { variant?: "primary" | "ghost"; size?: "sm" | "md" }>) {
  return (
    <button
      {...props}
      className={clsx(
        "inline-flex items-center rounded-xl border transition-colors focus:outline-none focus:ring-1 focus:ring-[var(--accent)]",
        size === "sm" ? "h-8 px-3 text-sm" : "h-9 px-3 text-sm",
        variant === "primary"
          ? "bg-panel-soft text-app border-panel-soft hover:bg-panel"
          : "bg-transparent text-app border-app/10 hover:bg-panel-soft",
        className
      )}
    >
      {children}
    </button>
  );
}

export function IconButton({
  children,
  className,
  ...props
}: PropsWithChildren<BtnProps>) {
  return (
    <button
      {...props}
      className={clsx(
        "inline-flex items-center justify-center rounded-full h-9 w-9 border border-app/15 text-app hover:bg-panel-soft transition-colors focus:outline-none focus:ring-1 focus:ring-[var(--accent)]",
        className
      )}
    >
      {children}
    </button>
  );
}
