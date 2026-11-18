"use client";
import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { addItems, fetchFoods } from "@/lib/data";
import { foodEmoji } from "@/lib/food-emoji";
import { recommend, type RecFilter } from "@/lib/recommendations";
import { defaultMealType, MEAL_TYPES, type FoodItem, type Macros, type MealType } from "@/lib/types";
import { useApp } from "./AppProvider";
import { PetAvatar, usePetNames } from "./Pets";
import { ErrorBox, MacroPills, Notice, Sheet, Spinner, cn } from "./ui";

const FILTERS: { value: RecFilter; label: string }[] = [
  { value: "auto", label: "Para ahora" },
  { value: "frutas", label: "🍓 Con fruta" },
  { value: "desayuno", label: "Desayuno" },
  { value: "snack", label: "Snack" },
  { value: "comida", label: "Almuerzo / cena" },
];

export function Recommendations({ remaining, eaten, date, onAdded }: { remaining: Macros; eaten: string[]; date: string; onAdded: () => void }) {
  const { prefs } = useApp();
  const names = usePetNames();
  const [foods, setFoods] = useState<FoodItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<RecFilter>("auto");
  const [limit, setLimit] = useState(3);
  const [picked, setPicked] = useState<number | null>(null);
  const [mealType, setMealType] = useState<MealType>(defaultMealType());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchFoods().then(setFoods).catch((e) => setError(e.message));
  }, []);

  const rec = useMemo(() => (foods ? recommend({ remaining, foods, prefs, eatenToday: eaten, limit: 12, filter }) : null), [foods, remaining, prefs, eaten, filter]);
  const shown = rec?.items.slice(0, limit) ?? [];
  const current = picked !== null ? shown[picked] : null;

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
      <div className="flex items-center gap-3">
        <PetAvatar kind="yorkie1" size={44} />
        <div>
          <h2 className="serif text-[19px] leading-tight">¿Qué puedo comer?</h2>
          <p className="text-[12px] text-muted">
            {names.yorkie1} sugiere según lo que te falta: ~{Math.max(0, Math.round(remaining.kcal))} kcal y {Math.max(0, Math.round(remaining.protein_g))} g de proteína
          </p>
        </div>
      </div>
      <div className="no-scrollbar -mx-5 mt-4 flex gap-2 overflow-x-auto px-5">
        {FILTERS.map((f) => (
          <button key={f.value} onClick={() => { setFilter(f.value); setLimit(3); }} className={cn("chip shrink-0", filter === f.value && "chip-on")}>{f.label}</button>
        ))}
      </div>
      <div className="mt-3 space-y-2">
        {error && <ErrorBox message={error} />}
        {!rec && !error && <Spinner />}
        {rec?.message && <Notice tone="info">{rec.message}</Notice>}
        {shown.map((r, i) => (
          <button key={r.title} onClick={() => setPicked(i)} className="animate-pop flex w-full items-center gap-3 rounded-2xl bg-surface-2/70 p-3 text-left transition hover:bg-surface-2 active:scale-[0.99]" style={{ animationDelay: `${i * 50}ms` }}>
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-surface text-[26px] shadow-soft">
              {foodEmoji(r.parts[0].name, r.parts[0].food.category)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-medium leading-snug">{r.title}</span>
              <MacroPills className="mt-0.5" kcal={r.totals.kcal} p={r.totals.protein_g} c={r.totals.carbs_g} f={r.totals.fat_g} />
            </span>
            <Plus className="h-4 w-4 shrink-0 text-accent" />
          </button>
        ))}
        {rec && rec.items.length > limit && (
          <button className="w-full rounded-2xl py-2.5 text-[13px] font-medium text-accent transition hover:bg-surface-2" onClick={() => setLimit((l) => l + 4)}>
            Ver más opciones ({rec.items.length - limit})
          </button>
        )}
      </div>
      <p className="mt-2 text-[11px] text-faint">Son ideas, no una obligación de completar el número.</p>

      <Sheet open={!!current} onClose={() => setPicked(null)} title={current?.title ?? ""}>
        {current && (
          <div className="space-y-4">
            <p className="text-sm text-muted">{current.why}</p>
            <ul className="divide-y divide-line rounded-2xl bg-surface-2/60">
              {current.parts.map((p) => (
                <li key={p.name} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <span className="flex items-center gap-2.5"><span className="text-lg">{foodEmoji(p.name, p.food.category)}</span>{p.name}</span>
                  <span className="num text-muted">{p.grams} g</span>
                </li>
              ))}
            </ul>
            <MacroPills kcal={current.totals.kcal} p={current.totals.protein_g} c={current.totals.carbs_g} f={current.totals.fat_g} />
            <p className="text-[11px] text-faint">{current.fitNote}. Calculado con la base nutricional de FitTrack.</p>
            <select className="input" value={mealType} onChange={(e) => setMealType(e.target.value as MealType)}>
              {MEAL_TYPES.map((m) => (
                <option key={m.key} value={m.key}>{m.label}</option>
              ))}
            </select>
            <button className="btn-primary w-full" disabled={busy} onClick={add}>
              {busy ? <Spinner className="text-on-accent" /> : "Registrar esta comida"}
            </button>
          </div>
        )}
      </Sheet>
    </section>
  );
}
