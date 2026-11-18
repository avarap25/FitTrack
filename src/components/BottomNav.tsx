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

export function BottomNav() {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-700/80 bg-ink-950/90 backdrop-blur-xl safe-bottom md:left-1/2 md:max-w-xl md:-translate-x-1/2 md:rounded-t-3xl md:border-x">
      <ul className="mx-auto grid max-w-xl grid-cols-5 items-end px-2 pt-2">
        {items.map(({ href, label, icon: Icon, center }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          if (center)
            return (
              <li key={href} className="flex justify-center">
                <Link href={href} aria-label="Registrar" className={cn("-mt-7 flex h-16 w-16 items-center justify-center rounded-2xl bg-lime-400 text-ink-950 shadow-glow transition active:scale-95", active && "ring-4 ring-lime-400/30")}>
                  <Plus className="h-8 w-8" strokeWidth={2.75} />
                </Link>
              </li>
            );
          return (
            <li key={href}>
              <Link href={href} className={cn("flex flex-col items-center gap-1 py-1 text-[10px] font-semibold uppercase tracking-wider transition", active ? "text-lime-400" : "text-ink-400")}>
                <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 2} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
