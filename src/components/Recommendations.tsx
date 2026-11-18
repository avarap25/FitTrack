"use client";
import { useEffect, useMemo, useState } from "react";
import { Plus, Sparkles } from "lucide-react";
import { addItems, fetchFoods } from "@/lib/data";
import { recommend } from "@/lib/recommendations";
import { defaultMealType, MEAL_TYPES, type FoodItem, type Macros, type MealType } from "@/lib/types";
import { useApp } from "./AppProvider";
import { ErrorBox, MacroPills, Notice, Sheet, Spinner } from "./ui";

export function Recommendations({ remaining, eaten, date, onAdded, limit = 3 }: { remaining: Macros; eaten: string[]; date: string; onAdded: () => void; limit?: number }) {
  const { prefs } = useApp();
  const [foods, setFoods] = useState<FoodItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [mealType, setMealType] = useState<MealType>(defaultMealType());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchFoods().then(setFoods).catch((e) => setError(e.message));
  }, []);

  const rec = useMemo(() => (foods ? recommend({ remaining, foods, prefs, eatenToday: eaten, limit }) : null), [foods, remaining, prefs, eaten, limit]);
  const current = picked !== null && rec ? rec.items[picked] : null;

  async function add() {
    if (!current) return;
    setBusy(true);
    try {
      await addItems(date, mealType, current.parts.map((p) => ({ name: p.name, grams: p.grams, food_item_id: p.food.id, preparation: p.food.preparation, per100: p.food, origin: "recomendacion", is_estimate: p.food.is_estimate })));
      setPicked(null);
      onAdded();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  return (
    <section className="card">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-lime-400" />
        <h2 className="label text-ink-100">¿Qué puedo comer?</h2>
      </div>
      <p className="mb-3 text-xs text-ink-400">
        Te quedan ~{Math.max(0, Math.round(remaining.kcal))} kcal y {Math.max(0, Math.round(remaining.protein_g))} g de proteína. Son sugerencias, no una obligación de completar el número.
      </p>
      {error && <ErrorBox message={error} />}
      {!rec && !error && <Spinner />}
      {rec?.message && <Notice tone="info">{rec.message}</Notice>}
      <div className="space-y-2">
        {rec?.items.map((r, i) => (
          <button key={r.title} onClick={() => setPicked(i)} className="w-full rounded-xl border border-ink-700 bg-ink-850 p-3 text-left transition hover:border-lime-400/50">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold">{r.title}</p>
              <Plus className="h-4 w-4 shrink-0 text-lime-400" />
            </div>
            <MacroPills className="mt-1" kcal={r.totals.kcal} p={r.totals.protein_g} c={r.totals.carbs_g} f={r.totals.fat_g} />
            <p className="mt-1 text-[11px] text-ink-400">{r.fitNote}</p>
          </button>
        ))}
      </div>
      <Sheet open={!!current} onClose={() => setPicked(null)} title={current?.title ?? ""}>
        {current && (
          <div className="space-y-4">
            <p className="text-sm text-ink-300">{current.why}</p>
            <ul className="divide-y divide-ink-700 rounded-xl border border-ink-700">
              {current.parts.map((p) => (
                <li key={p.name} className="flex justify-between px-3 py-2 text-sm">
                  <span>{p.name}</span>
                  <span className="num text-ink-300">{p.grams} g</span>
                </li>
              ))}
            </ul>
            <MacroPills kcal={current.totals.kcal} p={current.totals.protein_g} c={current.totals.carbs_g} f={current.totals.fat_g} />
            <p className="text-[11px] text-ink-400">Valores calculados con la base nutricional de FitTrack. Las cantidades son orientativas.</p>
            <select className="input" value={mealType} onChange={(e) => setMealType(e.target.value as MealType)}>
              {MEAL_TYPES.map((m) => (
                <option key={m.key} value={m.key}>{m.label}</option>
              ))}
            </select>
            <button className="btn-primary w-full" disabled={busy} onClick={add}>
              {busy ? <Spinner className="text-ink-950" /> : "Registrar esta comida"}
            </button>
          </div>
        )}
      </Sheet>
    </section>
  );
}
