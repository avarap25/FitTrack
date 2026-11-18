"use client";
import clsx from "clsx";
import { Loader2, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

export function cn(...a: Parameters<typeof clsx>) {
  return clsx(...a);
}

const useIso = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/** Número que sube suavemente hasta su valor (respeta "reducir movimiento"). */
export function CountUp({ value, decimals = 0, duration = 900, className }: { value: number; decimals?: number; duration?: number; className?: string }) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = from.current;
    if (reduce || !Number.isFinite(value)) {
      setShown(value);
      from.current = value;
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const e = 1 - Math.pow(1 - p, 4);
      setShown(start + (value - start) * e);
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <span className={className}>{shown.toLocaleString("es-PE", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}</span>;
}

/** Hook: vale false en el primer pintado y true después → permite animar desde 0. */
function useMounted() {
  const [m, setM] = useState(false);
  useIso(() => {
    const id = requestAnimationFrame(() => setM(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return m;
}

export function PageHeader({ title, kicker, right }: { title: string; kicker?: string; right?: React.ReactNode }) {
  return (
    <header className="mb-6 flex items-end justify-between gap-3 pt-4">
      <div>
        {kicker && <p className="mb-1 text-[13px] text-muted">{kicker}</p>}
        <h1 className="h-display text-[34px] leading-none">{title}</h1>
      </div>
      {right}
    </header>
  );
}

export function ProgressRing({ value, max, size = 200, stroke = 10, children }: { value: number; max: number; size?: number; stroke?: number; children?: React.ReactNode }) {
  const mounted = useMounted();
  const r = (size - stroke) / 2 - 6;
  const c = 2 * Math.PI * r;
  const pct = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const over = max > 0 && value > max;
  const shown = mounted ? pct : 0;
  const color = over ? "rgb(var(--fat))" : "rgb(var(--accent))";
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="overflow-visible">
        <defs>
          <filter id="ring-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" />
          </filter>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} style={{ stroke: "rgb(var(--track))" }} strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          style={{ stroke: color, transition: "stroke-dashoffset 1.4s cubic-bezier(.22,1,.36,1)" }}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - shown)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        {/* destello que viaja con la punta del anillo */}
        <g style={{ transform: `rotate(${shown * 360}deg)`, transformOrigin: "50% 50%", transformBox: "view-box", transition: "transform 1.4s cubic-bezier(.22,1,.36,1)", opacity: shown > 0.01 ? 1 : 0 }}>
          <circle cx={size / 2} cy={size / 2 - r} r={stroke * 0.9} style={{ fill: "rgb(var(--glow))" }} filter="url(#ring-glow)" opacity={0.85} />
          <circle cx={size / 2} cy={size / 2 - r} r={stroke / 2 - 1.5} style={{ fill: "rgb(var(--glow))" }} />
        </g>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}

export function MacroBar({ label, value, goal, color, unit = "g", compact }: { label: string; value: number; goal: number; color: string; unit?: string; compact?: boolean }) {
  const mounted = useMounted();
  const pct = goal > 0 ? Math.min(100, (value / goal) * 100) : 0;
  const bar = (
    <div className="h-1.5 overflow-hidden rounded-full bg-track">
      <div className="h-full rounded-full" style={{ width: `${mounted ? pct : 0}%`, background: color, transition: "width 1.2s cubic-bezier(.22,1,.36,1)" }} />
    </div>
  );
  if (compact)
    return (
      <div>
        <span className="flex items-center gap-1.5 text-[12px] text-muted">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
          {label}
        </span>
        <p className="num mb-2 mt-0.5 whitespace-nowrap text-[22px] leading-tight">
          <CountUp value={Math.round(value)} />
          <span className="text-[12px] text-faint"> /{Math.round(goal)}{unit}</span>
        </p>
        {bar}
      </div>
    );
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="flex items-center gap-2 text-[13px] text-muted">
          <span className="h-2 w-2 rounded-full" style={{ background: color }} />
          {label}
        </span>
        <span className="num whitespace-nowrap text-base">
          {Math.round(value)}
          <span className="text-faint"> / {Math.round(goal)} {unit}</span>
        </span>
      </div>
      {bar}
    </div>
  );
}

export function MacroPills({ kcal, p, c, f, className }: { kcal: number; p: number; c: number; f: number; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted", className)}>
      <span className="num text-sm font-normal text-fg">{Math.round(kcal)} kcal</span>
      <span className="flex items-center gap-1"><i className="h-1.5 w-1.5 rounded-full bg-prot" />{Math.round(p)} P</span>
      <span className="flex items-center gap-1"><i className="h-1.5 w-1.5 rounded-full bg-carb" />{Math.round(c)} C</span>
      <span className="flex items-center gap-1"><i className="h-1.5 w-1.5 rounded-full bg-fat" />{Math.round(f)} G</span>
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-5 w-5 animate-spin text-accent", className)} />;
}

export function Loading({ text = "Cargando…" }: { text?: string }) {
  return (
    <div className="animate-fade flex items-center justify-center gap-2 py-24 text-sm text-muted">
      <Spinner /> {text}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-2xl bg-fat/10 p-3.5 text-sm text-fat">
      {message}
      {onRetry && (
        <button className="ml-2 font-medium underline underline-offset-2" onClick={onRetry}>
          Reintentar
        </button>
      )}
    </div>
  );
}

export function Notice({ children, tone = "info" }: { children: React.ReactNode; tone?: "info" | "warn" | "ok" }) {
  const t = { info: "bg-surface-2 text-muted", warn: "bg-carb/10 text-fg", ok: "bg-pos/10 text-fg" }[tone];
  const dot = { info: "bg-faint", warn: "bg-carb", ok: "bg-pos" }[tone];
  return (
    <div className={cn("flex gap-2.5 rounded-2xl p-3.5 text-[13px] leading-relaxed", t)}>
      <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", dot)} />
      <div>{children}</div>
    </div>
  );
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", k);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", k);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="animate-fade absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="animate-sheet relative max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-4xl bg-surface p-6 pt-3 shadow-lift safe-bottom sm:rounded-4xl">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line sm:hidden" />
        <div className="mb-5 flex items-center justify-between">
          <h2 className="h-display text-xl">{title}</h2>
          <button onClick={onClose} aria-label="Cerrar" className="rounded-full bg-surface-2 p-2 text-muted transition hover:text-fg">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-faint">{hint}</span>}
    </label>
  );
}

export function Stat({ label, value, unit, sub, accent }: { label: string; value: string | number; unit?: string; sub?: string; accent?: boolean }) {
  return (
    <div className="card-tight">
      <p className="text-[12px] text-muted">{label}</p>
      <p className={cn("num mt-1 text-[26px] leading-tight", accent && "text-accent")}>
        {typeof value === "number" ? <CountUp value={value} decimals={Number.isInteger(value) ? 0 : 1} /> : value}
        {unit && <span className="ml-1 text-sm text-faint">{unit}</span>}
      </p>
      {sub && <p className="mt-0.5 text-[11px] text-faint">{sub}</p>}
    </div>
  );
}

/** Selector con "píldora" que se desliza entre opciones. */
export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div className="relative inline-grid rounded-full bg-surface-2 p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      <span
        className="absolute bottom-1 top-1 rounded-full bg-surface shadow-soft transition-transform duration-500 ease-out"
        style={{ width: `calc((100% - 8px) / ${options.length})`, transform: `translateX(${idx * 100}%)`, left: 4 }}
      />
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)} className={cn("relative z-10 whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-medium transition-colors", value === o.value ? "text-fg" : "text-faint")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
