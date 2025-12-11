# Axis Orb – vizual, canonic, device-agnostic

Referință rapidă pentru orb/spikes + avatar orchestrator. Folosește rigla Fibonacci și axele CB (cbA, cbB, cbD, cbP). Niciun UI nu își inventează altă structură.

## Gramatică vizuală
- Element primordial: orb (cerc), glow/scală dictate de Fibonacci.
- Axe: 4 segmente/spikes (cbA, cbB, cbD, cbP).
- `+N` = procese/agenți în run.
- `Fibonacci` = adâncime → glow/grosime ring.
- `pressure` = lungime/opacity spike.
- State: idle (orb abia vizibil, +0); few runs (1–4) glow mic + spike scurt pe axa activă; deep (8–13–21…) glow mare, ring gros, spikes lungi.

## HTML semnătură (reutilizabilă chat/console/mobile)
```html
<button
  class="axis-orb"
  data-orb-tier="standard"        <!-- shallow | standard | deep | max -->
  data-orb-level="8"              <!-- fib.level_total -->
  data-orb-total-ready="5"        <!-- suma readyByAxis -->
  data-orb-running="3"            <!-- procese active -->
>
  <span class="axis-orb-core" data-orb-core></span>

  <span class="axis-orb-axes" data-orb-axes>
    <span data-axis="cbA" data-ready="3" data-pressure="1"></span>
    <span data-axis="cbB" data-ready="1" data-pressure="0"></span>
    <span data-axis="cbD" data-ready="1" data-pressure="2"></span>
    <span data-axis="cbP" data-ready="0" data-pressure="0" data-soon="true"></span>
  </span>

  <span class="axis-orb-label">
    <span class="axis-orb-title">Council</span>
    <span class="axis-orb-count">+3</span>
  </span>
</button>
```

## React component (Console/Chat ready)
```tsx
// src/components/axis/AxisOrb.tsx
import React from 'react';

type AxisKey = 'cbA' | 'cbB' | 'cbD' | 'cbP';
type CouncilTier = 'shallow' | 'standard' | 'deep' | 'max';

export interface AxisState {
  readyByAxis: Record<AxisKey, number>;
  pressureByAxis?: Record<AxisKey, number>;
  levelTotal: number;        // fib.level_total
  tier: CouncilTier;         // decideCouncilTier(levelTotal)
  runningCount: number;      // procese active
}

interface Props {
  state: AxisState;
  label?: string;
  onClick?: () => void;
}

const axisOrder: AxisKey[] = ['cbA', 'cbB', 'cbD', 'cbP'];

export function AxisOrb({ state, label = 'Council', onClick }: Props) {
  const { readyByAxis, pressureByAxis = {} as Record<AxisKey, number>, levelTotal, tier, runningCount } = state;
  const totalReady = axisOrder.reduce((acc, key) => acc + (readyByAxis[key] || 0), 0);
  const showCount = runningCount > 0;

  const tierRing = (() => {
    switch (tier) {
      case 'shallow': return 'ring-1 ring-sky-500/40';
      case 'standard': return 'ring-2 ring-sky-400/60';
      case 'deep': return 'ring-2 ring-cyan-400/80 shadow-[0_0_25px_rgba(34,211,238,0.35)]';
      case 'max':
      default: return 'ring-4 ring-cyan-300 shadow-[0_0_40px_rgba(34,211,238,0.55)]';
    }
  })();

  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 text-slate-100"
      data-orb-tier={tier}
      data-orb-level={levelTotal}
      data-orb-total-ready={totalReady}
      data-orb-running={runningCount}
    >
      <span
        className={[
          'relative flex h-9 w-9 items-center justify-center rounded-full border border-slate-600/70 bg-slate-900/80 transition-colors',
          totalReady === 0 ? 'opacity-60' : 'opacity-100',
          tierRing,
        ].join(' ')}
        data-orb-core
      >
        <span className="pointer-events-none absolute inset-0" data-orb-axes>
          {axisOrder.map((axis, idx) => {
            const ready = readyByAxis[axis] || 0;
            const pressure = pressureByAxis[axis] || 0;
            const isPersonal = axis === 'cbP';
            const strength = Math.min(ready + pressure, 8);
            const scale = strength === 0 ? 0 : 0.3 + strength * 0.07;
            const angle = (idx / axisOrder.length) * 360;
            return (
              <span
                key={axis}
                data-axis={axis}
                data-ready={ready}
                data-pressure={pressure}
                data-soon={isPersonal ? 'true' : 'false'}
                className="absolute left-1/2 top-1/2 h-1 w-[38%] origin-left rounded-full"
                style={{
                  transform: `rotate(${angle}deg) scaleX(${scale})`,
                  backgroundColor: ready > 0
                    ? (isPersonal ? 'rgba(148,163,184,0.9)' : 'rgba(56,189,248,0.95)')
                    : 'rgba(51,65,85,0.7)',
                  opacity: isPersonal ? 0.6 : 1,
                }}
              />
            );
          })}
        </span>
        <span className="h-4 w-4 rounded-full bg-slate-800/90" />
      </span>

      <span className="flex flex-col items-start">
        <span className="text-xs font-semibold leading-tight text-slate-100">{label}</span>
        <span className="flex items-center gap-1 text-[11px] text-slate-400">
          {totalReady === 0 ? 'idle' : `${totalReady} ready`}
          {showCount && (
            <span className="rounded-full bg-sky-500/20 px-1.5 text-[10px] text-sky-200">
              +{runningCount}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}
```

## Alimentare (exemplu)
```ts
const fib = billing.council.fib;
const byAxis = billing.council.by_axis;

const axisState: AxisState = {
  readyByAxis: {
    cbA: byAxis.cbA.ready,
    cbB: byAxis.cbB.ready,
    cbD: byAxis.cbD.ready,
    cbP: byAxis.cbP.ready,
  },
  pressureByAxis: {
    cbA: byAxis.cbA.pressure,
    cbB: byAxis.cbB.pressure,
    cbD: byAxis.cbD.pressure,
    cbP: byAxis.cbP.pressure,
  },
  levelTotal: fib.level_total,
  tier: fib.tier || decideCouncilTier(fib.level_total),
  runningCount: runningCountFromOrchestrator,
};
```

## Avatar fallback – “Orchestrator”
```tsx
// src/components/OrchestratorAvatar.tsx
export function OrchestratorAvatar() {
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 text-slate-100">
      <svg viewBox="0 0 32 32" className="h-5 w-5" aria-hidden="true">
        <circle cx="16" cy="10" r="4" fill="currentColor" />
        <path d="M10 24c0-3.5 2.7-6 6-6s6 2.5 6 6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M16 14l4 4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M21 17l3-4" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    </div>
  );
}
```

## Invariant
- Vizualul citește numai `by_axis + fib + tier` (din `councilFib` + billing/integrations summary).
- Aceeași semnătură DOM/props peste toate dispozitivele; skin-ul se schimbă doar prin CSS/canvas/SVG.
