"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dumbbell, Home, LineChart, Plus, Utensils } from "lucide-react";
import { cn } from "./ui";

const items = [
  { href: "/", label: "Inicio", icon: Home },
  { href: "/alimentacion", label: "Comidas", icon: Utensils },
  { href: "/registrar", label: "Registrar", icon: Plus, center: true },
  { href: "/entrenamiento", label: "Entreno", icon: Dumbbell },
  { href: "/progreso", label: "Progreso", icon: LineChart },
];

/** Barra flotante tipo "píldora" con indicador que se desliza a la sección activa. */
export function BottomNav() {
  const path = usePathname();
  const activeIdx = items.findIndex((i) => (i.href === "/" ? path === "/" : path.startsWith(i.href)));
  const showDot = activeIdx >= 0 && !items[activeIdx].center;
  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 safe-bottom">
      <ul className="pointer-events-auto relative mb-2 grid w-full max-w-[380px] grid-cols-5 items-center rounded-full border border-line/60 bg-surface/80 p-1.5 shadow-lift backdrop-blur-xl">
        {showDot && (
          <span
            aria-hidden
            className="absolute top-1.5 h-[calc(100%-12px)] rounded-full bg-surface-2 transition-transform duration-500 ease-out"
            style={{ width: "calc((100% - 12px) / 5)", left: 6, transform: `translateX(${activeIdx * 100}%)` }}
          />
        )}
        {items.map(({ href, label, icon: Icon, center }, i) => {
          const active = i === activeIdx;
          if (center)
            return (
              <li key={href} className="relative z-10 flex justify-center">
                <Link href={href} aria-label="Registrar" className={cn("flex h-12 w-12 items-center justify-center rounded-full bg-accent text-on-accent transition duration-300 ease-out active:scale-90", active && "ring-4 ring-accent/15")}>
                  <Plus className="h-6 w-6" strokeWidth={2.25} />
                </Link>
              </li>
            );
          return (
            <li key={href} className="relative z-10">
              <Link href={href} aria-label={label} className={cn("flex flex-col items-center gap-0.5 py-1.5 text-[10px] font-medium transition-colors duration-300", active ? "text-fg" : "text-faint")}>
                <Icon className="h-[19px] w-[19px]" strokeWidth={active ? 2.2 : 1.7} />
                <span className={cn("transition-all duration-300", active ? "opacity-100" : "opacity-0 -mb-3 h-0")}>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
