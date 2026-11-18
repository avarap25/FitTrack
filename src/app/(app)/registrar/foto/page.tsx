"use client";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Camera, ImageIcon, MessageSquareText, Plus, RefreshCw, Replace, Send, Trash2 } from "lucide-react";
import { ErrorBox, Loading, MacroPills, Notice, PageHeader, Sheet, Spinner, cn } from "@/components/ui";
import { addItems, compressImage, searchFoods } from "@/lib/data";
import { macrosFor, sumMacros } from "@/lib/nutrition";
import { isoDate } from "@/lib/stats";
import { supabaseBrowser } from "@/lib/supabase/client";
import { defaultMealType, MEAL_TYPES, type FoodItem, type MealType } from "@/lib/types";
import type { ReviewItem } from "@/lib/ai/schema";

type Stage = "capture" | "analyzing" | "review";

interface Analysis {
  photo_id: string;
  items: ReviewItem[];
  hidden_ingredients_note: string;
  general_note: string;
  is_food: boolean;
}

const CONF = { alta: "text-pos border-pos/40", media: "text-carb border-carb/40", baja: "text-fat border-fat/40" };

function PhotoFlow() {
  const sp = useSearchParams();
  const router = useRouter();
  const date = sp.get("d") ?? isoDate();
  const [mealType, setMealType] = useState<MealType>((sp.get("meal") as MealType) || defaultMealType());
  const [stage, setStage] = useState<Stage>("capture");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [hint, setHint] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [instruction, setInstruction] = useState("");
  const [refining, setRefining] = useState(false);
  const [saving, setSaving] = useState(false);
  const [picker, setPicker] = useState<{ mode: "add" } | { mode: "swap"; index: number } | null>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function onPick(f: File | undefined) {
    if (!f) return;
    setError(null);
    if (!f.type.startsWith("image/")) return setError("Selecciona una imagen.");
    if (f.size > 25 * 1024 * 1024) return setError("La imagen es demasiado grande (máx. 25 MB antes de comprimir).");
    try {
      const c = await compressImage(f);
      if (c.size > 5 * 1024 * 1024) return setError("No se pudo reducir la imagen por debajo de 5 MB.");
      setFile(c);
      setPreview(URL.createObjectURL(c));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function analyze(reuse = false) {
    if (!file) return;
    setStage("analyzing");
    setError(null);
    const fd = new FormData();
    fd.append("image", file);
    if (hint.trim()) fd.append("hint", hint.trim());
    if (reuse && analysis?.photo_id) fd.append("photo_id", analysis.photo_id);
    try {
      const res = await fetch("/api/analyze", { method: "POST", body: fd });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Error al analizar");
      setAnalysis(body);
      setItems(body.items);
      setStage("review");
    } catch (e) {
      setError((e as Error).message);
      setStage(analysis ? "review" : "capture");
    }
  }

  async function refine() {
    if (instruction.trim().length < 2) return;
    setRefining(true);
    setError(null);
    try {
      const res = await fetch("/api/refine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ instruction, items }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Error al corregir");
      setItems(body.items);
      setInstruction("");
    } catch (e) {
      setError((e as Error).message);
    }
    setRefining(false);
  }

  const update = (i: number, patch: Partial<ReviewItem>) => setItems((arr) => arr.map((it, k) => (k === i ? { ...it, ...patch } : it)));
  const remove = (i: number) => setItems((arr) => arr.filter((_, k) => k !== i));
  const fromFood = (f: FoodItem, grams: number, prev?: ReviewItem): ReviewItem => ({
    name: f.name,
    preparation: f.preparation ?? "",
    grams,
    confidence: prev?.confidence ?? "alta",
    food_id: f.id,
    kcal_100g: f.kcal_100g,
    protein_100g: f.protein_100g,
    carbs_100g: f.carbs_100g,
    fat_100g: f.fat_100g,
    uncertainty: prev ? "Cambiado manualmente" : "Agregado manualmente",
    nutrition_source: "base",
  });

  const perItem = items.map((it) => macrosFor(it, it.grams));
  const totals = useMemo(() => sumMacros(items.map((it) => macrosFor(it, it.grams))), [items]);
  const invalid = items.some((it) => !(it.grams > 0 && it.grams <= 2000) || !it.name.trim());

  async function confirm() {
    if (!analysis || invalid || !items.length) return;
    setSaving(true);
    setError(null);
    try {
      await addItems(date, mealType, items.map((it) => ({
        name: it.name.trim(),
        preparation: it.preparation || null,
        grams: it.grams,
        food_item_id: it.food_id,
        per100: it,
        origin: "foto_ia",
        is_estimate: true,
        photo_id: analysis.photo_id,
      })));
      await supabaseBrowser().from("food_photos").update({ status: "confirmada" }).eq("id", analysis.photo_id);
      router.push(`/alimentacion?d=${date}`);
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  async function discard() {
    if (analysis) await supabaseBrowser().from("food_photos").update({ status: "descartada" }).eq("id", analysis.photo_id);
    setAnalysis(null);
    setItems([]);
    setFile(null);
    setPreview(null);
    setStage("capture");
  }

  return (
    <div className="stagger space-y-4">
      <PageHeader kicker="Reconocimiento con IA" title="Foto de comida" />
      <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onPick(e.target.files?.[0])} />
      <input ref={galRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => onPick(e.target.files?.[0])} />

      {preview && (
        <div className="relative overflow-hidden rounded-2xl border border-line">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Foto del plato" className="max-h-72 w-full object-cover" />
          {stage === "analyzing" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-bg/70 backdrop-blur-sm">
              <Spinner className="h-8 w-8" />
              <p className="text-sm">Analizando el plato…</p>
            </div>
          )}
        </div>
      )}

      {stage === "capture" && (
        <>
          {!preview ? (
            <button onClick={() => camRef.current?.click()} className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-accent/40 bg-accent/5 text-accent">
              <Camera className="h-14 w-14" strokeWidth={1.5} />
              <span className="h-display text-2xl">Tomar foto</span>
              <span className="text-xs text-muted">Encuadra todo el plato desde arriba, con buena luz</span>
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button className="btn-ghost" onClick={() => camRef.current?.click()}><Camera className="h-4 w-4" /> Otra foto</button>
              <button className="btn-ghost" onClick={() => galRef.current?.click()}><ImageIcon className="h-4 w-4" /> Galería</button>
            </div>
          )}
          {!preview && (
            <button className="btn-ghost w-full" onClick={() => galRef.current?.click()}><ImageIcon className="h-4 w-4" /> Elegir de la galería</button>
          )}
          <textarea className="input min-h-[70px]" maxLength={300} placeholder="Opcional: contexto para la IA (p. ej. 'el arroz lleva aceite', 'es medio plato')" value={hint} onChange={(e) => setHint(e.target.value)} />
          {error && <ErrorBox message={error} />}
          <button className="btn-primary w-full py-3" disabled={!file} onClick={() => analyze(false)}>Analizar plato</button>
          <p className="text-center text-[11px] text-faint">La foto se guarda de forma privada en tu cuenta. Nada se registra hasta que confirmes.</p>
        </>
      )}

      {stage === "review" && analysis && (
        <>
          {!analysis.is_food && <Notice tone="warn">La IA no reconoció comida en la imagen. Puedes agregar alimentos manualmente o tomar otra foto.</Notice>}
          <Notice tone="warn">
            <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
            Valores <b>estimados</b>. Una foto no permite conocer el peso exacto ni aceites o salsas ocultas. Revisa y corrige antes de guardar.
            {analysis.hidden_ingredients_note && <span className="mt-1 block">{analysis.hidden_ingredients_note}</span>}
          </Notice>

          <ul className="space-y-2">
            {items.map((it, i) => (
              <li key={i} className="card-tight space-y-2">
                <div className="flex items-start gap-2">
                  <input className="input flex-1 py-1.5 font-semibold" value={it.name} onChange={(e) => update(i, { name: e.target.value })} aria-label="Nombre" />
                  <span className={cn("chip shrink-0 border py-0.5 text-[10px]", CONF[it.confidence])}>{it.confidence}</span>
                </div>
                <div className="grid grid-cols-[1fr_110px] gap-2">
                  <input className="input py-1.5 text-xs" placeholder="Preparación" value={it.preparation} onChange={(e) => update(i, { preparation: e.target.value })} aria-label="Preparación" />
                  <div className="relative">
                    <input className="input py-1.5 pr-7" type="number" inputMode="decimal" value={it.grams || ""} onChange={(e) => update(i, { grams: Number(e.target.value) })} aria-label="Gramos" />
                    <span className="absolute right-2.5 top-2 text-xs text-faint">g</span>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <MacroPills kcal={perItem[i].kcal} p={perItem[i].protein_g} c={perItem[i].carbs_g} f={perItem[i].fat_g} />
                  <div className="flex gap-1">
                    <button className="rounded-lg p-1.5 text-muted hover:bg-surface-2" aria-label="Cambiar alimento" onClick={() => setPicker({ mode: "swap", index: i })}><Replace className="h-4 w-4" /></button>
                    <button className="rounded-lg p-1.5 text-fat hover:bg-fat/10" aria-label="Eliminar" onClick={() => remove(i)}><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
                <p className="text-[10px] text-faint">
                  {it.nutrition_source === "base" ? "Nutrientes: base FitTrack" : "Nutrientes: estimación de la IA (no está en la base)"}
                  {it.uncertainty ? ` · ${it.uncertainty}` : ""}
                </p>
              </li>
            ))}
          </ul>
          <button className="btn-ghost w-full" onClick={() => setPicker({ mode: "add" })}><Plus className="h-4 w-4" /> Agregar alimento que no detectó</button>

          <section className="card space-y-2">
            <p className="label flex items-center gap-1.5"><MessageSquareText className="h-3.5 w-3.5" /> Corregir con tus palabras</p>
            <div className="flex gap-2">
              <input className="input" placeholder='"El pollo era 150 g", "también hay papa sancochada"' value={instruction} maxLength={500} onChange={(e) => setInstruction(e.target.value)} onKeyDown={(e) => e.key === "Enter" && refine()} />
              <button className="btn-primary px-3" onClick={refine} disabled={refining || instruction.trim().length < 2} aria-label="Aplicar corrección">
                {refining ? <Spinner className="text-on-accent" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
          </section>

          <section className="card space-y-3">
            <div className="flex items-center justify-between">
              <p className="label">Total del plato</p>
              <p className="num text-2xl text-accent">{Math.round(totals.kcal)} kcal</p>
            </div>
            <MacroPills kcal={totals.kcal} p={totals.protein_g} c={totals.carbs_g} f={totals.fat_g} />
            <select className="input" value={mealType} onChange={(e) => setMealType(e.target.value as MealType)} aria-label="Comida">
              {MEAL_TYPES.map((m) => (
                <option key={m.key} value={m.key}>{m.label}</option>
              ))}
            </select>
            {error && <ErrorBox message={error} />}
            <button className="btn-primary w-full py-3" disabled={saving || invalid || !items.length} onClick={confirm}>
              {saving ? <Spinner className="text-on-accent" /> : "Confirmar y guardar"}
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button className="btn-ghost text-xs" onClick={() => analyze(true)}><RefreshCw className="h-3.5 w-3.5" /> Volver a analizar</button>
              <button className="btn-ghost text-xs" onClick={discard}>Descartar</button>
            </div>
          </section>
        </>
      )}

      <FoodPicker
        open={!!picker}
        onClose={() => setPicker(null)}
        onPick={(f) => {
          if (!picker) return;
          if (picker.mode === "add") setItems((arr) => [...arr, fromFood(f, f.servings?.[0]?.grams ?? 100)]);
          else setItems((arr) => arr.map((it, k) => (k === picker.index ? fromFood(f, it.grams, it) : it)));
          setPicker(null);
        }}
      />
    </div>
  );
}

function FoodPicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (f: FoodItem) => void }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<FoodItem[] | null>(null);
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => searchFoods(q).then(setRes).catch(() => setRes([])), 200);
    return () => clearTimeout(t);
  }, [q, open]);
  return (
    <Sheet open={open} onClose={onClose} title="Elegir alimento">
      <input className="input mb-3" placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      {!res && <Spinner />}
      <ul className="max-h-[50dvh] space-y-1.5 overflow-y-auto">
        {res?.map((f) => (
          <li key={f.id}>
            <button className="w-full rounded-2xl bg-surface-2/70 p-3 text-left text-sm hover:bg-surface-2" onClick={() => onPick(f)}>
              {f.name}
              <span className="block text-[10px] text-faint">{Math.round(f.kcal_100g)} kcal / 100 g · {f.state}</span>
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <PhotoFlow />
    </Suspense>
  );
}
