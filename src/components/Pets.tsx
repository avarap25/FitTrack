"use client";
import { useEffect, useMemo, useState } from "react";
import { useApp } from "./AppProvider";
import { cn } from "./ui";
import type { PetNames } from "@/lib/types";

export type PetKind = "scottie" | "yorkie1" | "yorkie2";

export const DEFAULT_PET_NAMES: PetNames = { scottie: "Scottie", yorkie1: "Yorki", yorkie2: "Mini" };
export const PET_ROLES: Record<PetKind, string> = {
  scottie: "Entrenador · Scottish terrier",
  yorkie1: "Nutrición · Yorkshire toy",
  yorkie2: "Progreso · Yorkshire toy",
};

export function usePetNames(): PetNames {
  const { prefs } = useApp();
  return useMemo(() => ({ ...DEFAULT_PET_NAMES, ...Object.fromEntries(Object.entries(prefs.pet_names ?? {}).filter(([, v]) => typeof v === "string" && v.trim())) }), [prefs.pet_names]);
}

/* ---------------- Ilustraciones (SVG originales) ---------------- */

function Eyes({ y, dx, r = 3.4 }: { y: number; dx: number; r?: number }) {
  return (
    <g className="pet-blink">
      {[60 - dx, 60 + dx].map((x) => (
        <g key={x}>
          <circle cx={x} cy={y} r={r} fill="#160F0C" />
          <circle cx={x + r * 0.35} cy={y - r * 0.4} r={r * 0.33} fill="#FFF" />
        </g>
      ))}
    </g>
  );
}

function Scottie() {
  const fur = "#3A302C";
  const furLight = "#5A4A42";
  return (
    <>
      {/* cola en zanahoria */}
      <path className="pet-wag" d="M82 92 C90 84 92 74 90 66 C95 72 96 84 88 96 Z" fill={fur} />
      {/* cuerpo sentado */}
      <path d="M36 112 C33 92 40 76 60 76 C80 76 87 92 84 112 Z" fill={fur} />
      {/* falda de pelo */}
      <path d="M36 108 l4 6 l4 -6 l4 6 l4 -6 l4 6 l4 -6 l4 6 l4 -6 l4 6 l4 -6 l4 6 l2 -6 V100 H36 Z" fill={fur} />
      <ellipse cx="49" cy="113" rx="7" ry="4" fill={furLight} />
      <ellipse cx="71" cy="113" rx="7" ry="4" fill={furLight} />
      {/* collar borgoña con placa */}
      <path d="M41 78 Q60 88 79 78 L79 83 Q60 93 41 83 Z" fill="#6E1F2E" />
      <circle cx="60" cy="89" r="3.6" fill="#D69E66" />
      {/* orejas */}
      <g className="pet-ear">
        <path d="M37 34 L40 8 L54 28 Z" fill={fur} />
        <path d="M41 30 L42 15 L50 27 Z" fill="#8E5A55" />
      </g>
      <path d="M83 34 L80 8 L66 28 Z" fill={fur} />
      <path d="M79 30 L78 15 L70 27 Z" fill="#8E5A55" />
      {/* cabeza alargada */}
      <rect x="33" y="22" width="54" height="46" rx="20" fill={fur} />
      {/* barba */}
      <path d="M40 56 Q60 50 80 56 L80 66 l-4 8 l-4 -6 l-4 9 l-4 -7 l-4 9 l-4 -9 l-4 7 l-4 -9 l-4 6 l-4 -8 Z" fill={furLight} />
      {/* cejas pobladas */}
      <path d="M42 41 Q48 34 56 39 L54 42 Q48 39 43 44 Z" fill="#8C7B70" />
      <path d="M78 41 Q72 34 64 39 L66 42 Q72 39 77 44 Z" fill="#8C7B70" />
      <Eyes y={46} dx={10} r={3.1} />
      <ellipse cx="60" cy="57" rx="5.5" ry="4.2" fill="#120C0A" />
      <ellipse cx="58.6" cy="55.6" rx="1.6" ry="1" fill="#6B5B55" />
    </>
  );
}

function Yorkie({ bow, tan, small }: { bow: string; tan: string; small?: boolean }) {
  const steel = "#6F7A86";
  const tanLight = "#EBCB93";
  const t = small ? "translate(6 8) scale(0.9)" : undefined;
  return (
    <g transform={t}>
      {/* cola */}
      <path className="pet-wag" d="M80 96 C88 90 90 80 86 74 C93 79 94 90 86 100 Z" fill={steel} />
      {/* cuerpo gris acero con patitas doradas */}
      <path d="M38 112 C36 94 44 80 60 80 C76 80 84 94 82 112 Z" fill={steel} />
      <path d="M50 84 Q60 80 70 84 Q68 104 60 108 Q52 104 50 84 Z" fill={tanLight} opacity=".9" />
      <ellipse cx="50" cy="112" rx="7" ry="4.2" fill={tan} />
      <ellipse cx="70" cy="112" rx="7" ry="4.2" fill={tan} />
      {/* pelo largo a los lados */}
      <path d="M36 44 C30 62 34 78 44 86 L48 64 Z" fill={tan} />
      <path d="M84 44 C90 62 86 78 76 86 L72 64 Z" fill={tan} />
      {/* orejas en V */}
      <g className="pet-ear">
        <path d="M40 34 L36 12 L52 26 Z" fill={tan} />
        <path d="M41 30 L39 17 L49 26 Z" fill="#B07A4A" />
      </g>
      <path d="M80 34 L84 12 L68 26 Z" fill={tan} />
      <path d="M79 30 L81 17 L71 26 Z" fill="#B07A4A" />
      {/* cabeza redonda */}
      <circle cx="60" cy="48" r="23" fill={tan} />
      <ellipse cx="60" cy="58" rx="15" ry="11" fill={tanLight} />
      {/* moño (top knot) */}
      <path d="M54 22 Q60 14 66 22 Q60 26 54 22 Z" fill={tan} />
      <path d="M60 20 L50 14 L51 25 Z" fill={bow} />
      <path d="M60 20 L70 14 L69 25 Z" fill={bow} />
      <circle cx="60" cy="20" r="2.6" fill={bow} />
      <Eyes y={47} dx={9} r={3.8} />
      <ellipse cx="60" cy="57" rx="4" ry="3.1" fill="#160F0C" />
      <path d="M57 61.5 Q60 64 63 61.5" stroke="#8A5B3C" strokeWidth="1.3" fill="none" strokeLinecap="round" />
    </g>
  );
}

export function PetAvatar({ kind, size = 72, className, ring = true }: { kind: PetKind; size?: number; className?: string; ring?: boolean }) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} className={cn("pet-bob shrink-0", className)} role="img" aria-label={PET_ROLES[kind]}>
      {ring && <circle cx="60" cy="64" r="56" style={{ fill: "rgb(var(--glow) / .22)" }} />}
      {kind === "scottie" && <g className="pet-scottie"><Scottie /></g>}
      {kind === "yorkie1" && <Yorkie bow="#6E1F2E" tan="#C99A5B" />}
      {kind === "yorkie2" && <Yorkie bow="#B85C6E" tan="#D3A86A" small />}
    </svg>
  );
}

/* ---------------- Guía con globo de diálogo ---------------- */

export interface GuideMessage {
  text: string;
  tone?: "ok" | "info" | "warn";
}

/** Un perrito con su consejo. Al tocarlo pasa al siguiente mensaje. */
export function Guide({ kind, messages, title, compact, className }: { kind: PetKind; messages: GuideMessage[]; title?: string; compact?: boolean; className?: string }) {
  const names = usePetNames();
  const [i, setI] = useState(0);
  const list = messages.length ? messages : [{ text: "¡Aquí estoy para ayudarte!" }];
  useEffect(() => setI(0), [messages.length]);
  const m = list[i % list.length];
  const dot = m.tone === "ok" ? "bg-pos" : m.tone === "warn" ? "bg-carb" : "bg-accent";
  return (
    <section className={cn("card flex items-start gap-3", compact ? "p-4" : "", className)}>
      <button aria-label={`Siguiente consejo de ${names[kind]}`} onClick={() => setI((x) => x + 1)} className="transition active:scale-90">
        <PetAvatar kind={kind} size={compact ? 56 : 68} />
      </button>
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline gap-2">
          <span className="serif text-[17px]">{names[kind]}</span>
          <span className="truncate text-[11px] text-faint">{title ?? PET_ROLES[kind]}</span>
        </p>
        <div key={i} className="animate-pop relative mt-1.5 rounded-2xl rounded-tl-md bg-surface-2/80 px-3.5 py-2.5 text-[13.5px] leading-relaxed">
          <span className={cn("mr-2 inline-block h-1.5 w-1.5 -translate-y-0.5 rounded-full", dot)} />
          {m.text}
        </div>
        {list.length > 1 && (
          <div className="mt-2 flex items-center gap-1.5">
            {list.map((_, k) => (
              <span key={k} className={cn("h-1 rounded-full transition-all duration-500", k === i % list.length ? "w-4 bg-accent" : "w-1 bg-line")} />
            ))}
            <span className="ml-1 text-[11px] text-faint">toca a {names[kind]} para otro consejo</span>
          </div>
        )}
      </div>
    </section>
  );
}

/** Los tres juntos (para pantallas vacías, login, etc.). */
export function PetTrio({ size = 64 }: { size?: number }) {
  return (
    <div className="relative flex items-end justify-center">
      <span aria-hidden className="absolute bottom-0 h-1/2 w-[85%] rounded-full blur-2xl" style={{ background: "rgb(var(--glow) / .3)" }} />
      <PetAvatar kind="yorkie1" size={size * 0.85} ring={false} className="-mr-4" />
      <PetAvatar kind="scottie" size={size * 1.1} ring={false} className="relative z-10" />
      <PetAvatar kind="yorkie2" size={size * 0.8} ring={false} className="-ml-4" />
    </div>
  );
}
