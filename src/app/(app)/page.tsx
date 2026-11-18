"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, HelpCircle, User } from "lucide-react";
import { useApp } from "@/components/AppProvider";
import { Guide, type GuideMessage } from "@/components/Pets";
import { Recommendations } from "@/components/Recommendations";
import { CountUp, ErrorBox, Loading, MacroBar, ProgressRing, cn } from "@/components/ui";
import { fetchDay, fetchWeights, fetchWorkouts } from "@/lib/data";
import { workoutKcal } from "@/lib/exercise";
import { calorieFloor, energyBreakdown, sumMacros, tdeeForDay } from "@/lib/nutrition";
import { isoDate, weightTrendPerWeek } from "@/lib/stats";
import { daySummary } from "@/lib/summary";
import type { MealItem, WeightLog, Workout } from "@/lib/types";

const QUICK = [
  { href: "/registrar/foto", emoji: "📸", label: "Foto", sub: "de tu plato" },
  { href: "/registrar/buscar", emoji: "🔎", label: "Buscar", sub: "alimento" },
  { href: "/progreso?add=peso", emoji: "⚖️", label: "Peso", sub: "de hoy" },
  { href: "/entrenamiento?nuevo=1", emoji: "🏋️", label: "Entreno", sub: "o cardio" },
];

function greeting(h: number) {
  return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
}

export default function Home() {
  const { profile, goal } = useApp();
  const today = isoDate();
  const [items, setItems] = useState<MealItem[] | null>(null);
  const [workoutsToday, setWorkoutsToday] = useState<Workout[]>([]);
  const [weights, setWeights] = useState<WeightLog[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState(new Date().getHours() >= 19);
  const [explain, setExplain] = useState(false);

  const load = useCallback(async () => {
    try {
      const [d, w, wk] = await Promise.all([fetchDay(today), fetchWeights(), fetchWorkouts(today)]);
      setItems(d.items);
      setWeights(w);
      setWorkoutsToday(wk.filter((x) => x.date === today));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [today]);
  useEffect(() => {
    load();
  }, [load]);

  const totals = useMemo(() => sumMacros(items ?? []), [items]);
  const remaining = { kcal: goal.calories - totals.kcal, protein_g: goal.protein_g - totals.protein_g, carbs_g: goal.carbs_g - totals.carbs_g, fat_g: goal.fat_g - totals.fat_g };
  const energy = energyBreakdown(profile);
  const burned = workoutsToday.reduce((a, w) => a + workoutKcal(w, profile.kcal_per_session), 0);
  const tdeeToday = tdeeForDay(profile, burned);
  const balance = tdeeToday - totals.kcal;
  const trend = weightTrendPerWeek(weights);
  const lastW = weights.at(-1);
  const hour = new Date().getHours();
  const summary = daySummary(totals, goal, tdeeToday, items?.length ?? 0, calorieFloor(profile), hour >= 20);

  const messages: GuideMessage[] = useMemo(() => {
    const m: GuideMessage[] = [];
    if (!items?.length) m.push({ text: "Aún no registras nada hoy. Empieza con una foto de tu próxima comida: yo te ayudo a calcular.", tone: "info" });
    else if (remaining.protein_g > 20) m.push({ text: `Te faltan ${Math.round(remaining.protein_g)} g de proteína. Abajo tienes ideas para completarla sin pasarte de calorías.`, tone: "info" });
    else m.push({ text: "¡Proteína cubierta! Lo que queda del día puede ser más ligero: verduras o fruta.", tone: "ok" });
    if (burned > 0) m.push({ text: `Hoy quemaste ~${Math.round(burned)} kcal entrenando. ¡Bien ahí!`, tone: "ok" });
    else if (hour >= 10) m.push({ text: "¿Entrenaste hoy? Regístralo y sumo las calorías que quemaste a tu balance.", tone: "info" });
    if (trend !== null && trend < -0.1) m.push({ text: `Vas bajando ~${Math.abs(trend)} kg por semana. Paso a paso, así se llega.`, tone: "ok" });
    if (remaining.kcal < -150) m.push({ text: "Hoy te pasaste un poco del objetivo. No pasa nada: mañana retoma normal, sin compensar comiendo de menos.", tone: "warn" });
    return m;
  }, [items, remaining.protein_g, remaining.kcal, burned, hour, trend]);

  if (error) return <ErrorBox message={error} onRetry={load} />;
  if (!items) return <Loading />;

  const dateLabel = new Date().toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="stagger space-y-4">
      <header className="flex items-center justify-between pt-4">
        <div>
          <p className="text-[13px] text-muted first-letter:uppercase">{dateLabel}</p>
          <h1 className="h-display text-[32px] leading-tight">
            {greeting(hour)}
            {profile.display_name ? <span className="italic text-accent">, {profile.display_name}</span> : ""}
          </h1>
        </div>
        <Link href="/perfil" aria-label="Perfil" className="flex h-11 w-11 items-center justify-center rounded-full bg-surface shadow-soft transition active:scale-95">
          <User className="h-[18px] w-[18px] text-muted" />
        </Link>
      </header>

      <Guide kind="yorkie2" title="Tu resumen de hoy" messages={messages} compact />

      {/* 1. Calorías del día */}
      <section className="card relative overflow-hidden pb-6 pt-5">
        <div aria-hidden className="aura pointer-events-none absolute left-1/2 top-10 h-56 w-56 -translate-x-1/2 rounded-full blur-3xl" style={{ background: remaining.kcal < 0 ? "rgb(var(--fat) / .25)" : "radial-gradient(circle, rgb(var(--glow) / .45), rgb(var(--glow) / 0) 70%)" }} />
        <p className="relative text-[13px] font-medium text-muted">Calorías de hoy</p>
        <div className="relative mt-2 flex justify-center">
          <ProgressRing value={totals.kcal} max={goal.calories} size={204} stroke={9}>
            <span className="text-[12px] text-muted">{remaining.kcal < 0 ? "Por encima" : "Te quedan"}</span>
            <CountUp value={Math.abs(Math.round(remaining.kcal))} className={cn("num text-[54px] leading-none", remaining.kcal < 0 && "text-fat")} />
            <span className="mt-1 text-[12px] text-faint">
              comiste <CountUp value={Math.round(totals.kcal)} /> de {goal.calories.toLocaleString("es-PE")}
            </span>
          </ProgressRing>
        </div>
        <div className="relative mt-6 grid grid-cols-3 gap-4">
          <MacroBar compact label="Proteína" value={totals.protein_g} goal={goal.protein_g} color="rgb(var(--prot))" />
          <MacroBar compact label="Carbos" value={totals.carbs_g} goal={goal.carbs_g} color="rgb(var(--carb))" />
          <MacroBar compact label="Grasas" value={totals.fat_g} goal={goal.fat_g} color="rgb(var(--fat))" />
        </div>
      </section>

      {/* 2. Accesos rápidos */}
      <nav aria-label="Registrar" className="grid grid-cols-4 gap-2">
        {QUICK.map((q, i) => (
          <Link key={q.href} href={q.href} className={cn("flex flex-col items-center gap-1 rounded-3xl py-3.5 text-center shadow-soft transition active:scale-95", i === 0 ? "bg-accent text-on-accent" : "bg-surface")}>
            <span className="text-[24px] leading-none">{q.emoji}</span>
            <span className="text-[13px] font-medium leading-tight">{q.label}</span>
            <span className={cn("text-[10px] leading-none", i === 0 ? "text-on-accent/70" : "text-faint")}>{q.sub}</span>
          </Link>
        ))}
      </nav>

      {/* 3. Balance: comido vs gastado */}
      <section className="card">
        <div className="flex items-center justify-between">
          <h2 className="serif text-[19px]">Balance de hoy</h2>
          <button onClick={() => setExplain(!explain)} className="flex items-center gap-1 text-[12px] text-muted" aria-expanded={explain}>
            <HelpCircle className="h-3.5 w-3.5" /> ¿Qué es?
          </button>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl bg-surface-2/70 px-1 py-3">
            <p className="text-[18px]">🍽️</p>
            <p className="num text-[24px] leading-tight"><CountUp value={Math.round(totals.kcal)} /></p>
            <p className="text-[11px] text-muted">comiste</p>
          </div>
          <div className="rounded-2xl bg-surface-2/70 px-1 py-3">
            <p className="text-[18px]">🔥</p>
            <p className="num text-[24px] leading-tight"><CountUp value={Math.round(burned)} /></p>
            <p className="text-[11px] text-muted">quemaste entrenando</p>
          </div>
          <div className="rounded-2xl bg-surface-2/70 px-1 py-3">
            <p className="text-[18px]">⚡</p>
            <p className="num text-[24px] leading-tight"><CountUp value={Math.round(tdeeToday)} /></p>
            <p className="text-[11px] text-muted">gasto total</p>
          </div>
        </div>
        <div className={cn("mt-3 flex items-center justify-between rounded-2xl px-4 py-3", balance >= 0 ? "bg-pos/10" : "bg-fat/10")}>
          <span className="text-[13px]">{balance >= 0 ? "Déficit estimado" : "Superávit estimado"}</span>
          <span className={cn("num text-[22px]", balance >= 0 ? "text-pos" : "text-fat")}>
            {balance >= 0 ? "−" : "+"}<CountUp value={Math.round(Math.abs(balance))} /> kcal
          </span>
        </div>
        {explain && (
          <p className="animate-fade mt-3 text-[12.5px] leading-relaxed text-muted">
            <b className="text-fg">Gasto total</b> = metabolismo basal ({Math.round(energy.bmr)}) + actividad del día ({Math.round(energy.daily_activity)}) + lo que quemaste entrenando ({Math.round(burned)}).
            Si comes menos que tu gasto, hay déficit y tu cuerpo usa reservas (grasa). Son estimaciones: tu peso real a lo largo de las semanas es el mejor indicador.
          </p>
        )}
      </section>

      <Recommendations remaining={remaining} eaten={items.map((i) => i.name)} date={today} onAdded={load} />

      <section className="card">
        <button className="flex w-full items-center justify-between" onClick={() => setShowSummary(!showSummary)} aria-expanded={showSummary}>
          <h2 className="text-left">
            <span className="serif block text-[19px]">Resumen del día</span>
            <span className="block text-[13px] text-muted">{summary.headline}</span>
          </h2>
          <ChevronRight className={cn("h-4 w-4 text-faint transition duration-300", showSummary && "rotate-90")} />
        </button>
        {showSummary && (
          <div className="animate-fade mt-4 space-y-2.5 text-[14px] leading-relaxed">
            {summary.points.map((p, i) => (
              <p key={i} className="flex gap-2.5">
                <i className={cn("mt-2 h-1.5 w-1.5 shrink-0 rounded-full", p.tone === "ok" ? "bg-pos" : p.tone === "warn" ? "bg-carb" : "bg-faint")} />
                <span>{p.text}</span>
              </p>
            ))}
            {summary.tomorrow.length > 0 && <p className="rounded-2xl bg-surface-2/70 p-3.5 text-[13px] text-muted"><b className="text-fg">Para mañana:</b> {summary.tomorrow.join(" ")}</p>}
          </div>
        )}
      </section>

      <Link href="/progreso" className="card flex items-center justify-between transition active:scale-[0.99]">
        <div>
          <p className="serif text-[19px]">Tu peso</p>
          <p className="mt-1 flex items-baseline gap-2">
            <span className="num text-[34px] leading-none">{lastW ? lastW.weight_kg : "—"}</span>
            <span className="text-sm text-faint">kg · meta {profile.target_weight_kg}</span>
          </p>
          <p className="mt-1.5 text-[12px] text-faint">{trend === null ? "La tendencia aparece con 4+ pesajes en 10+ días" : `${trend > 0 ? "+" : ""}${trend} kg por semana`}</p>
        </div>
        <span className="text-[28px]">⚖️</span>
      </Link>
    </div>
  );
}
