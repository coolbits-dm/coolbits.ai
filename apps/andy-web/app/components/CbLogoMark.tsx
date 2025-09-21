// components/CbLogoMark.tsx
"use client";

export function CbLogoMark({ size = 28, className = "" }: { size?: number; className?: string }) {
  const px = `${size}px`;
  return (
    <span
      aria-label="CoolBits"
      title="CoolBits"
      style={{ width: px, height: px, backgroundColor: "var(--logo-color)" }}
      className={`inline-block align-middle cb-mask [mask-image:url('/assets/cbLogo.svg')] [-webkit-mask-image:url('/assets/cbLogo.svg')] ${className}`}
    />
  );
}
