"use client";
import clsx from "clsx";
import { Loader2, X } from "lucide-react";
import { useEffect } from "react";

export function cn(...a: Parameters<typeof clsx>) {
  return clsx(...a);
}

export function PageHeader({ title, kicker, right }: { title: string; kicker?: string; right?: React.ReactNode }) {
  return (
    <header className="mb-4 flex items-end justify-between gap-3 pt-2">
      <div>
        {kicker && <p className="label text-lime-400">{kicker}</p>}
        <h1 className="h-display text-3xl">{title}</h1>
      </div>
      {right}
    </header>
  );
}

export function ProgressRing({ value, max, size = 168, stroke = 14, children, color = "#B6F23C" }: { value: number; max: number; size?: number; stroke?: number; children?: React.ReactNode; color?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const over = max > 0 && value > max;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#232A31" strokeWidth={stroke} fill="none" />
        {/* marcas tipo marcador */}
        {Array.from({ length: 40 }).map((_, i) => {
          const a = (i / 40) * 2 * Math.PI;
          const r1 = r + stroke / 2 + 3;
          const r2 = r1 + (i % 5 === 0 ? 5 : 2.5);
          return <line key={i} x1={size / 2 + r1 * Math.cos(a)} y1={size / 2 + r1 * Math.sin(a)} x2={size / 2 + r2 * Math.cos(a)} y2={size / 2 + r2 * Math.sin(a)} stroke="#2F3841" strokeWidth={1} />;
        })}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={over ? "#FF7A59" : color}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          style={{ transition: "stroke-dashoffset .6s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}

export function MacroBar({ label, value, goal, color, unit = "g" }: { label: string; value: number; goal: number; color: string; unit?: string }) {
  const pct = goal > 0 ? Math.min(100, (value / goal) * 100) : 0;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="label">{label}</span>
        <span className="num text-base">
          {Math.round(value)}
          <span className="text-ink-400"> / {Math.round(goal)} {unit}</span>
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-ink-700">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

export function MacroPills({ kcal, p, c, f, className }: { kcal: number; p: number; c: number; f: number; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-300", className)}>
      <span className="num text-sm text-ink-100">{Math.round(kcal)} kcal</span>
      <span><b className="text-prot">P</b> {Math.round(p)}g</span>
      <span><b className="text-carb">C</b> {Math.round(c)}g</span>
      <span><b className="text-fat">G</b> {Math.round(f)}g</span>
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-5 w-5 animate-spin text-lime-400", className)} />;
}

export function Loading({ text = "Cargando…" }: { text?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-ink-300">
      <Spinner /> {text}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-xl border border-fat/40 bg-fat/10 p-3 text-sm text-fat">
      {message}
      {onRetry && (
        <button className="ml-2 underline" onClick={onRetry}>
          Reintentar
        </button>
      )}
    </div>
  );
}

export function Notice({ children, tone = "info" }: { children: React.ReactNode; tone?: "info" | "warn" | "ok" }) {
  const t = { info: "border-prot/30 bg-prot/10 text-prot", warn: "border-carb/40 bg-carb/10 text-carb", ok: "border-mint-400/40 bg-mint-400/10 text-mint-400" }[tone];
  return <div className={cn("rounded-xl border p-3 text-xs leading-relaxed", t)}>{children}</div>;
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
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-ink-700 bg-ink-900 p-5 safe-bottom sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="h-display text-xl">{title}</h2>
          <button onClick={onClose} aria-label="Cerrar" className="rounded-full p-1.5 text-ink-300 hover:bg-ink-800">
            <X className="h-5 w-5" />
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
      <span className="label mb-1.5 block">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-ink-400">{hint}</span>}
    </label>
  );
}

export function Stat({ label, value, unit, sub, accent }: { label: string; value: string | number; unit?: string; sub?: string; accent?: boolean }) {
  return (
    <div className="card-tight">
      <p className="label">{label}</p>
      <p className={cn("num mt-1 text-2xl", accent && "text-lime-400")}>
        {value}
        {unit && <span className="ml-1 text-sm text-ink-400">{unit}</span>}
      </p>
      {sub && <p className="mt-0.5 text-[11px] text-ink-400">{sub}</p>}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="inline-flex rounded-xl border border-ink-700 bg-ink-850 p-1">
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)} className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold transition", value === o.value ? "bg-lime-400 text-ink-950" : "text-ink-300")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
