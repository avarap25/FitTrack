"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Camera, ChevronRight, Flame, Scale, User } from "lucide-react";
import { useApp } from "@/components/AppProvider";
import { Recommendations } from "@/components/Recommendations";
import { ErrorBox, Loading, MacroBar, Notice, ProgressRing } from "@/components/ui";
import { fetchDay, fetchWeights, fetchWorkouts } from "@/lib/data";
import { calorieFloor, energyBreakdown, sumMacros, tdeeForDay } from "@/lib/nutrition";
import { isoDate, weightTrendPerWeek } from "@/lib/stats";
import { daySummary } from "@/lib/summary";
import type { MealItem, WeightLog } from "@/lib/types";

export default function Home() {
  const { profile, goal } = useApp();
  const today = isoDate();
  const [items, setItems] = useState<MealItem[] | null>(null);
  const [trained, setTrained] = useState(false);
  const [weights, setWeights] = useState<WeightLog[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState(new Date().getHours() >= 19);

  const load = useCallback(async () => {
    try {
      const [d, w, wk] = await Promise.all([fetchDay(today), fetchWeights(), fetchWorkouts(today)]);
      setItems(d.items);
      setWeights(w);
      setTrained(wk.some((x) => x.date === today));
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
  const tdeeToday = tdeeForDay(profile, trained);
  const balance = tdeeToday - totals.kcal;
  const trend = weightTrendPerWeek(weights);
  const lastW = weights.at(-1);
  const summary = daySummary(totals, goal, tdeeToday, items?.length ?? 0, calorieFloor(profile), new Date().getHours() >= 20);

  if (error) return <ErrorBox message={error} onRetry={load} />;
  if (!items) return <Loading />;

  const dateLabel = new Date().toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between pt-2">
        <div>
          <p className="label text-lime-400">{dateLabel}</p>
          <h1 className="h-display text-3xl">Hola{profile.display_name ? `, ${profile.display_name}` : ""}</h1>
        </div>
        <Link href="/perfil" aria-label="Perfil" className="flex h-11 w-11 items-center justify-center rounded-full border border-ink-700 bg-ink-850">
          <User className="h-5 w-5 text-ink-200" />
        </Link>
      </header>

      {/* Marcador principal */}
      <section className="card relative overflow-hidden">
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-lime-400/10 blur-2xl" />
        <div className="flex items-center gap-5">
          <ProgressRing value={totals.kcal} max={goal.calories} size={156}>
            <span className="num text-4xl leading-none">{Math.round(totals.kcal)}</span>
            <span className="text-[11px] text-ink-400">de {goal.calories} kcal</span>
          </ProgressRing>
          <div className="flex-1 space-y-3">
            <div>
              <p className="label">Restantes</p>
              <p className={`num text-3xl ${remaining.kcal < 0 ? "text-fat" : "text-lime-400"}`}>{Math.round(remaining.kcal)}</p>
              <p className="text-[11px] text-ink-400">kcal del objetivo de hoy</p>
            </div>
            <Link href="/registrar/foto" className="btn-primary w-full">
              <Camera className="h-4 w-4" /> Foto de comida
            </Link>
          </div>
        </div>
        <div className="mt-5 space-y-3">
          <MacroBar label="Proteínas" value={totals.protein_g} goal={goal.protein_g} color="#4FC3F7" />
          <MacroBar label="Carbohidratos" value={totals.carbs_g} goal={goal.carbs_g} color="#F5B83D" />
          <MacroBar label="Grasas" value={totals.fat_g} goal={goal.fat_g} color="#FF7A59" />
        </div>
      </section>

      {/* Balance energético */}
      <section className="card">
        <div className="mb-3 flex items-center gap-2">
          <Flame className="h-4 w-4 text-fat" />
          <h2 className="label text-ink-100">Balance energético estimado</h2>
        </div>
        <div className="grid grid-cols-4 gap-2 text-center">
          {[
            { l: "Basal", v: energy.bmr },
            { l: "Cotidiana", v: energy.daily_activity },
            { l: "Ejercicio", v: trained ? profile.kcal_per_session : 0 },
            { l: "Comido", v: totals.kcal },
          ].map((x) => (
            <div key={x.l} className="rounded-xl bg-ink-850 py-2">
              <p className="num text-lg">{Math.round(x.v)}</p>
              <p className="text-[10px] uppercase tracking-wider text-ink-400">{x.l}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-sm">
          Gasto estimado hoy <b className="num">{Math.round(tdeeToday)}</b> kcal ·{" "}
          {balance >= 0 ? <span className="text-mint-400">déficit ~{Math.round(balance)} kcal</span> : <span className="text-fat">superávit ~{Math.round(-balance)} kcal</span>}
        </p>
        <p className="mt-1 text-[11px] text-ink-400">
          Es distinto de las &quot;calorías restantes&quot;: compara lo que comiste con lo que probablemente gastaste. El gasto es una estimación (Mifflin-St Jeor + actividad) y los registros pueden tener errores.
          {!trained && " Si entrenaste hoy, regístralo para sumar ese gasto."}
        </p>
      </section>

      <Recommendations remaining={remaining} eaten={items.map((i) => i.name)} date={today} onAdded={load} />

      {/* Resumen del día */}
      <section className="card">
        <button className="flex w-full items-center justify-between" onClick={() => setShowSummary(!showSummary)}>
          <h2 className="label text-ink-100">Resumen del día · {summary.headline}</h2>
          <ChevronRight className={`h-4 w-4 transition ${showSummary ? "rotate-90" : ""}`} />
        </button>
        {showSummary && (
          <div className="mt-3 space-y-2 text-sm">
            {summary.points.map((p, i) => (
              <p key={i} className={p.tone === "ok" ? "text-mint-400" : p.tone === "warn" ? "text-carb" : "text-ink-200"}>
                • {p.text}
              </p>
            ))}
            {summary.tomorrow.length > 0 && (
              <Notice tone="info">
                <b>Para mañana:</b> {summary.tomorrow.join(" ")}
              </Notice>
            )}
          </div>
        )}
      </section>

      <Link href="/progreso" className="card flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Scale className="h-5 w-5 text-lime-400" />
          <div>
            <p className="label">Peso</p>
            <p className="num text-xl">
              {lastW ? `${lastW.weight_kg} kg` : "Sin registros"}
              <span className="ml-2 text-sm text-ink-400">→ {profile.target_weight_kg} kg</span>
            </p>
            <p className="text-[11px] text-ink-400">{trend === null ? "La tendencia aparece con 4+ pesajes en 10+ días" : `Tendencia: ${trend > 0 ? "+" : ""}${trend} kg/semana`}</p>
          </div>
        </div>
        <ChevronRight className="h-5 w-5 text-ink-400" />
      </Link>
    </div>
  );
}
