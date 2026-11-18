"use client";
import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Camera, ChevronLeft, ChevronRight, Plus, Sparkles } from "lucide-react";
import { useApp } from "@/components/AppProvider";
import { ErrorBox, Field, Loading, MacroBar, MacroPills, PageHeader, Sheet, Spinner } from "@/components/ui";
import { deleteItem, fetchDay, moveItem, updateItemGrams } from "@/lib/data";
import { sumMacros } from "@/lib/nutrition";
import { addDaysIso, fmtDate, isoDate } from "@/lib/stats";
import { MEAL_TYPES, type MealItem, type MealType } from "@/lib/types";

function FoodLog() {
  const { goal } = useApp();
  const router = useRouter();
  const sp = useSearchParams();
  const date = sp.get("d") ?? isoDate();
  const [items, setItems] = useState<(MealItem & { meal_type: MealType })[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [edit, setEdit] = useState<(MealItem & { meal_type: MealType }) | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { meals, items } = await fetchDay(date);
      const typeOf = new Map(meals.map((m) => [m.id, m.meal_type]));
      setItems(items.map((i) => ({ ...i, meal_type: typeOf.get(i.meal_id)! })));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [date]);
  useEffect(() => {
    setItems(null);
    load();
  }, [load]);

  const totals = useMemo(() => sumMacros(items ?? []), [items]);
  const go = (d: string) => router.replace(`/alimentacion?d=${d}`);
  const isToday = date === isoDate();

  return (
    <div className="space-y-4">
      <PageHeader kicker="Registro diario" title="Alimentación" />
      <div className="flex items-center justify-between rounded-2xl border border-ink-700 bg-ink-900 p-1.5">
        <button className="rounded-xl p-2 hover:bg-ink-800" aria-label="Día anterior" onClick={() => go(addDaysIso(date, -1))}>
          <ChevronLeft className="h-5 w-5" />
        </button>
        <label className="relative flex flex-col items-center">
          <span className="num text-lg capitalize">{isToday ? "Hoy" : fmtDate(date, { weekday: "long", day: "numeric", month: "short" })}</span>
          <input type="date" className="absolute inset-0 opacity-0" value={date} max={isoDate()} onChange={(e) => e.target.value && go(e.target.value)} aria-label="Elegir fecha" />
        </label>
        <button className="rounded-xl p-2 hover:bg-ink-800 disabled:opacity-30" aria-label="Día siguiente" disabled={isToday} onClick={() => go(addDaysIso(date, 1))}>
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {error && <ErrorBox message={error} onRetry={load} />}
      {!items && !error && <Loading />}
      {items && (
        <>
          <section className="card space-y-3">
            <MacroBar label="Calorías" value={totals.kcal} goal={goal.calories} color="#B6F23C" unit="kcal" />
            <div className="grid grid-cols-3 gap-3">
              <MacroBar label="Prot." value={totals.protein_g} goal={goal.protein_g} color="#4FC3F7" />
              <MacroBar label="Carb." value={totals.carbs_g} goal={goal.carbs_g} color="#F5B83D" />
              <MacroBar label="Grasa" value={totals.fat_g} goal={goal.fat_g} color="#FF7A59" />
            </div>
          </section>

          {MEAL_TYPES.map((m) => {
            const list = items.filter((i) => i.meal_type === m.key);
            const t = sumMacros(list);
            return (
              <section key={m.key} className="card">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="h-display text-lg">{m.label}</h2>
                    {list.length > 0 && <MacroPills kcal={t.kcal} p={t.protein_g} c={t.carbs_g} f={t.fat_g} />}
                  </div>
                  <div className="flex gap-1.5">
                    <Link href={`/registrar/foto?meal=${m.key}&d=${date}`} aria-label={`Foto para ${m.label}`} className="rounded-xl border border-ink-700 p-2 text-ink-200 hover:border-lime-400/50">
                      <Camera className="h-4 w-4" />
                    </Link>
                    <Link href={`/registrar/buscar?meal=${m.key}&d=${date}`} aria-label={`Agregar a ${m.label}`} className="rounded-xl bg-lime-400 p-2 text-ink-950">
                      <Plus className="h-4 w-4" />
                    </Link>
                  </div>
                </div>
                {list.length > 0 && (
                  <ul className="mt-3 divide-y divide-ink-700/70">
                    {list.map((i) => (
                      <li key={i.id}>
                        <button className="flex w-full items-center justify-between gap-3 py-2.5 text-left" onClick={() => setEdit(i)}>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">
                              {i.name}
                              {i.origin === "foto_ia" && <Sparkles className="ml-1 inline h-3 w-3 text-lime-400" aria-label="Detectado por IA" />}
                            </p>
                            <p className="text-[11px] text-ink-400">
                              {i.grams} g{i.preparation ? ` · ${i.preparation}` : ""}{i.is_estimate ? " · estimado" : ""}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="num text-base">{Math.round(i.kcal)}</p>
                            <p className="text-[10px] text-ink-400">P{Math.round(i.protein_g)} C{Math.round(i.carbs_g)} G{Math.round(i.fat_g)}</p>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </>
      )}
      <EditItemSheet item={edit} date={date} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />
    </div>
  );
}

function EditItemSheet({ item, date, onClose, onSaved }: { item: (MealItem & { meal_type: MealType }) | null; date: string; onClose: () => void; onSaved: () => void }) {
  const [grams, setGrams] = useState("");
  const [mealType, setMealType] = useState<MealType>("almuerzo");
  const [targetDate, setTargetDate] = useState(date);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (item) {
      setGrams(String(item.grams));
      setMealType(item.meal_type);
      setTargetDate(date);
      setError(null);
    }
  }, [item, date]);

  if (!item) return null;
  const g = Number(grams);
  const f = g > 0 ? g / item.grams : 0;

  async function save() {
    if (!item) return;
    if (!(g > 0 && g <= 5000)) return setError("Ingresa gramos válidos (1–5000).");
    setBusy(true);
    try {
      if (g !== item.grams) await updateItemGrams(item, g);
      if (mealType !== item.meal_type || targetDate !== date) await moveItem(item, targetDate, mealType);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  async function remove() {
    if (!item) return;
    setBusy(true);
    try {
      await deleteItem(item.id);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  return (
    <Sheet open onClose={onClose} title={item.name}>
      <div className="space-y-4">
        <Field label="Cantidad (g)">
          <input className="input" type="number" inputMode="decimal" value={grams} onChange={(e) => setGrams(e.target.value)} />
        </Field>
        <MacroPills kcal={item.kcal * f} p={item.protein_g * f} c={item.carbs_g * f} f={item.fat_g * f} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Comida">
            <select className="input" value={mealType} onChange={(e) => setMealType(e.target.value as MealType)}>
              {MEAL_TYPES.map((m) => (
                <option key={m.key} value={m.key}>{m.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Fecha">
            <input className="input" type="date" value={targetDate} max={isoDate()} onChange={(e) => setTargetDate(e.target.value)} />
          </Field>
        </div>
        {item.is_estimate && <p className="text-[11px] text-ink-400">Valores estimados ({item.origin === "foto_ia" ? "análisis de foto" : "receta estándar"}).</p>}
        {error && <ErrorBox message={error} />}
        <div className="flex gap-2">
          <button className="btn-danger" onClick={remove} disabled={busy}>Eliminar</button>
          <button className="btn-primary flex-1" onClick={save} disabled={busy}>{busy ? <Spinner className="text-ink-950" /> : "Guardar cambios"}</button>
        </div>
      </div>
    </Sheet>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <FoodLog />
    </Suspense>
  );
}
