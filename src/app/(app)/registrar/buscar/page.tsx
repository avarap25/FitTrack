"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Database, Globe, Plus, Search } from "lucide-react";
import { ErrorBox, Field, Loading, MacroPills, Notice, PageHeader, Segmented, Sheet, Spinner } from "@/components/ui";
import { addItems, searchFoods, uid } from "@/lib/data";
import { macrosFor } from "@/lib/nutrition";
import { isoDate } from "@/lib/stats";
import { foodEmoji } from "@/lib/food-emoji";
import { supabaseBrowser } from "@/lib/supabase/client";
import { defaultMealType, MEAL_TYPES, type FoodItem, type MealType } from "@/lib/types";

interface UsdaFood { fdcId: number; description: string; dataType: string; kcal_100g: number; protein_100g: number; carbs_100g: number; fat_100g: number }

const CATS = [
  { key: "", label: "Todo" },
  { key: "frutas", label: "🍓 Frutas" },
  { key: "proteinas", label: "🍗 Proteínas" },
  { key: "platos_peruanos", label: "🍽️ Platos peruanos" },
  { key: "verduras", label: "🥦 Verduras" },
  { key: "cereales", label: "🍚 Cereales" },
  { key: "menestras", label: "🫘 Menestras" },
  { key: "tuberculos", label: "🥔 Tubérculos" },
  { key: "lacteos", label: "🥛 Lácteos" },
  { key: "grasas", label: "🥑 Grasas y frutos secos" },
];

const STATE_LABEL: Record<string, string> = { crudo: "Crudo", cocido: "Cocido", preparado: "Preparación", envasado: "Envasado" };

function SearchFoods() {
  const sp = useSearchParams();
  const router = useRouter();
  const date = sp.get("d") ?? isoDate();
  const [mealType, setMealType] = useState<MealType>((sp.get("meal") as MealType) || defaultMealType());
  const [tab, setTab] = useState<"base" | "usda">("base");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<FoodItem[] | null>(null);
  const [usda, setUsda] = useState<UsdaFood[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<FoodItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [usdaBusy, setUsdaBusy] = useState(false);
  const [cat, setCat] = useState("");

  useEffect(() => {
    if (tab !== "base") return;
    const t = setTimeout(() => {
      searchFoods(q).then(setResults).catch((e) => setError(e.message));
    }, 200);
    return () => clearTimeout(t);
  }, [q, tab]);

  async function searchUsda() {
    if (q.trim().length < 2) return;
    setUsdaBusy(true);
    setError(null);
    const res = await fetch(`/api/foods/usda?q=${encodeURIComponent(q)}`);
    const body = await res.json();
    if (!res.ok) setError(body.error);
    else setUsda(body.foods);
    setUsdaBusy(false);
  }

  async function saveUsda(f: UsdaFood) {
    try {
      const user_id = await uid();
      const { data, error } = await supabaseBrowser()
        .from("food_items")
        .insert({ user_id, name: f.description, category: "usda", state: "cocido", kcal_100g: f.kcal_100g, protein_100g: f.protein_100g, carbs_100g: f.carbs_100g, fat_100g: f.fat_100g, source: `USDA FoodData Central (${f.dataType})`, source_ref: `fdcId ${f.fdcId}` })
        .select("*")
        .single();
      if (error) throw error;
      setSelected({ ...data, kcal_100g: Number(data.kcal_100g), protein_100g: Number(data.protein_100g), carbs_100g: Number(data.carbs_100g), fat_100g: Number(data.fat_100g) } as FoodItem);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="stagger space-y-4">
      <PageHeader kicker="Agregar alimento" title="Buscador" />
      <div className="grid grid-cols-2 gap-2">
        <select className="input" value={mealType} onChange={(e) => setMealType(e.target.value as MealType)} aria-label="Comida">
          {MEAL_TYPES.map((m) => (
            <option key={m.key} value={m.key}>{m.label}</option>
          ))}
        </select>
        <div className="input flex items-center text-muted">{date === isoDate() ? "Hoy" : date}</div>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-faint" />
        <input className="input pl-9" placeholder={tab === "base" ? "Ej. pollo, papa, ceviche…" : "En inglés: chicken breast, quinoa…"} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && tab === "usda" && searchUsda()} autoFocus />
      </div>
      <div className="flex items-center justify-between">
        <Segmented value={tab} onChange={setTab} options={[{ value: "base", label: "Base FitTrack" }, { value: "usda", label: "USDA" }]} />
        <button className="btn-ghost py-1.5 text-xs" onClick={() => setCreating(true)}>
          <Plus className="h-3.5 w-3.5" /> Crear alimento
        </button>
      </div>
      {error && <ErrorBox message={error} />}

      {tab === "base" && (
        <>
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
            {CATS.map((c) => (
              <button key={c.key} className={`chip shrink-0 ${cat === c.key ? "chip-on" : ""}`} onClick={() => setCat(c.key)}>{c.label}</button>
            ))}
          </div>
          {!results && <Loading />}
          {results?.length === 0 && <Notice tone="info">No hay resultados en la base. Prueba en la pestaña USDA o crea el alimento.</Notice>}
          <ul className="space-y-2">
            {results?.filter((f) => !cat || f.category === cat || (cat === "proteinas" && f.category === "usda")).map((f) => (
              <li key={f.id}>
                <button className="card-tight w-full text-left transition hover:bg-surface-2" onClick={() => setSelected(f)}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="flex items-center gap-2.5 text-sm font-semibold"><span className="text-[22px]">{foodEmoji(f.name, f.category)}</span>{f.name}</p>
                    <span className="chip shrink-0 py-0.5 text-[10px]">{STATE_LABEL[f.state]}</span>
                  </div>
                  <MacroPills className="mt-1" kcal={f.kcal_100g} p={f.protein_100g} c={f.carbs_100g} f={f.fat_100g} />
                  <p className="mt-1 text-[10px] text-faint">por 100 g · {f.is_estimate ? "estimación por receta" : f.user_id ? "personalizado" : "USDA"}</p>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {tab === "usda" && (
        <>
          <button className="btn-primary w-full" onClick={searchUsda} disabled={usdaBusy || q.trim().length < 2}>
            {usdaBusy ? <Spinner className="text-on-accent" /> : <><Globe className="h-4 w-4" /> Buscar en USDA FoodData Central</>}
          </button>
          <p className="text-[11px] text-faint">Base oficial del Departamento de Agricultura de EE. UU. Busca en inglés. Al elegir un resultado se guarda en tu base personal con su fdcId.</p>
          <ul className="space-y-2">
            {usda?.map((f) => (
              <li key={f.fdcId}>
                <button className="card-tight w-full text-left hover:bg-surface-2" onClick={() => saveUsda(f)}>
                  <p className="text-sm font-semibold">{f.description}</p>
                  <MacroPills className="mt-1" kcal={f.kcal_100g} p={f.protein_100g} c={f.carbs_100g} f={f.fat_100g} />
                  <p className="mt-1 text-[10px] text-faint">por 100 g · {f.dataType} · fdcId {f.fdcId}</p>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <AddSheet food={selected} onClose={() => setSelected(null)} onAdd={async (grams) => {
        await addItems(date, mealType, [{ name: selected!.name, preparation: selected!.preparation, grams, food_item_id: selected!.id, per100: selected!, origin: selected!.category === "usda" ? "usda" : "manual", is_estimate: selected!.is_estimate }]);
        router.push(`/alimentacion?d=${date}`);
      }} />
      <CreateFoodSheet open={creating} onClose={() => setCreating(false)} onCreated={(f) => { setCreating(false); setSelected(f); }} initialName={q} />
    </div>
  );
}

function AddSheet({ food, onClose, onAdd }: { food: FoodItem | null; onClose: () => void; onAdd: (grams: number) => Promise<void> }) {
  const [grams, setGrams] = useState("100");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (food) {
      setGrams(String(food.servings?.[0]?.grams ?? 100));
      setError(null);
    }
  }, [food]);
  if (!food) return null;
  const g = Number(grams) || 0;
  const m = macrosFor(food, g);
  return (
    <Sheet open onClose={onClose} title={food.name}>
      <div className="space-y-4">
        {food.preparation && <p className="text-xs text-muted">{food.preparation}</p>}
        <Field label="Cantidad (g)">
          <input className="input" type="number" inputMode="decimal" value={grams} onChange={(e) => setGrams(e.target.value)} />
        </Field>
        {food.servings?.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {food.servings.map((s) => (
              <button key={s.label} className={`chip ${Number(grams) === s.grams ? "chip-on" : ""}`} onClick={() => setGrams(String(s.grams))}>
                {s.label} · {s.grams} g
              </button>
            ))}
          </div>
        )}
        <div className="card-tight">
          <MacroPills kcal={m.kcal} p={m.protein_g} c={m.carbs_g} f={m.fat_g} />
        </div>
        <p className="flex items-start gap-1.5 text-[11px] text-faint">
          <Database className="mt-0.5 h-3 w-3 shrink-0" />
          <span>Fuente: {food.source}{food.source_ref ? ` — ${food.source_ref}` : ""}{food.is_estimate ? ". Es una estimación: la receta real puede variar." : ""}</span>
        </p>
        {error && <ErrorBox message={error} />}
        <button className="btn-primary w-full" disabled={busy || !(g > 0 && g <= 5000)} onClick={async () => {
          setBusy(true);
          try { await onAdd(g); } catch (e) { setError((e as Error).message); setBusy(false); }
        }}>
          {busy ? <Spinner className="text-on-accent" /> : "Agregar a la comida"}
        </button>
      </div>
    </Sheet>
  );
}

function CreateFoodSheet({ open, onClose, onCreated, initialName }: { open: boolean; onClose: () => void; onCreated: (f: FoodItem) => void; initialName: string }) {
  const [form, setForm] = useState({ name: "", state: "cocido", kcal: "", p: "", c: "", f: "", source: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setForm((x) => ({ ...x, name: initialName }));
  }, [open, initialName]);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  async function save() {
    const kcal = Number(form.kcal), p = Number(form.p), c = Number(form.c), f = Number(form.f);
    if (!form.name.trim()) return setError("Escribe un nombre");
    if ([kcal, p, c, f].some((n) => !Number.isFinite(n) || n < 0) || kcal > 950 || p > 100 || c > 100 || f > 100) return setError("Revisa los valores por 100 g");
    if (p + c + f > 100.5) return setError("Proteína + carbohidratos + grasa no pueden superar 100 g por cada 100 g");
    if (!form.source.trim()) return setError("Indica la fuente (p. ej. etiqueta nutricional del producto)");
    setBusy(true);
    try {
      const user_id = await uid();
      const { data, error } = await supabaseBrowser().from("food_items").insert({ user_id, name: form.name.trim(), category: "personalizado", state: form.state, kcal_100g: kcal, protein_100g: p, carbs_100g: c, fat_100g: f, source: form.source.trim() }).select("*").single();
      if (error) throw error;
      onCreated({ ...data, kcal_100g: kcal, protein_100g: p, carbs_100g: c, fat_100g: f } as FoodItem);
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  return (
    <Sheet open={open} onClose={onClose} title="Crear alimento">
      <div className="space-y-3">
        <Field label="Nombre"><input className="input" value={form.name} onChange={set("name")} /></Field>
        <Field label="Estado">
          <select className="input" value={form.state} onChange={set("state")}>
            <option value="crudo">Crudo</option>
            <option value="cocido">Cocido</option>
            <option value="preparado">Preparación</option>
            <option value="envasado">Envasado</option>
          </select>
        </Field>
        <p className="label">Valores por 100 g</p>
        <div className="grid grid-cols-4 gap-2">
          <input className="input" placeholder="kcal" inputMode="decimal" value={form.kcal} onChange={set("kcal")} />
          <input className="input" placeholder="Prot" inputMode="decimal" value={form.p} onChange={set("p")} />
          <input className="input" placeholder="Carb" inputMode="decimal" value={form.c} onChange={set("c")} />
          <input className="input" placeholder="Grasa" inputMode="decimal" value={form.f} onChange={set("f")} />
        </div>
        <Field label="Fuente" hint="Etiqueta del producto, tabla nutricional, etc."><input className="input" value={form.source} onChange={set("source")} /></Field>
        {error && <ErrorBox message={error} />}
        <button className="btn-primary w-full" onClick={save} disabled={busy}>{busy ? <Spinner className="text-on-accent" /> : "Guardar alimento"}</button>
      </div>
    </Sheet>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <SearchFoods />
    </Suspense>
  );
}
