"use client";
import { useEffect, useState } from "react";
import { Calculator, LogOut } from "lucide-react";
import { useApp } from "@/components/AppProvider";
import { ErrorBox, Field, Notice, PageHeader, Spinner, Stat, cn } from "@/components/ui";
import { fetchGoals, uid } from "@/lib/data";
import { ACTIVITY_LEVELS, bmrMifflin, calorieFloor, energyBreakdown, suggestGoal } from "@/lib/nutrition";
import { fmtDate } from "@/lib/stats";
import { supabaseBrowser } from "@/lib/supabase/client";
import { ALLERGEN_OPTIONS, PREFERENCE_OPTIONS, type NutritionGoal, type Profile } from "@/lib/types";

export default function PerfilPage() {
  const { profile, goal, prefs, reload } = useApp();
  const [p, setP] = useState<Profile>(profile);
  const [g, setG] = useState({ calories: goal.calories, protein_g: goal.protein_g, carbs_g: goal.carbs_g, fat_g: goal.fat_g });
  const [allergies, setAllergies] = useState<string[]>(prefs.allergies);
  const [diet, setDiet] = useState<string[]>(prefs.dietary_preferences);
  const [disliked, setDisliked] = useState(prefs.disliked_foods.join(", "));
  const [history, setHistory] = useState<NutritionGoal[]>([]);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    fetchGoals().then(setHistory).catch(() => {});
  }, [goal]);

  const num = (k: keyof Profile) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setP({ ...p, [k]: e.target.value === "" ? ("" as never) : Number(e.target.value) });
  const e = energyBreakdown(p);
  const floor = calorieFloor(p);
  const sug = suggestGoal(p);
  const macroKcal = g.protein_g * 4 + g.carbs_g * 4 + g.fat_g * 9;

  async function saveProfile() {
    setMsg(null);
    if (!(p.age >= 14 && p.age <= 100) || !(p.height_cm >= 120 && p.height_cm <= 230) || !(p.current_weight_kg >= 30 && p.current_weight_kg <= 300) || !(p.target_weight_kg >= 30 && p.target_weight_kg <= 300)) {
      return setMsg({ tone: "err", text: "Revisa edad, estatura y pesos." });
    }
    setBusy("perfil");
    const sb = supabaseBrowser();
    const { id: _id, ...fields } = p;
    const r1 = await sb.from("profiles").update(fields).eq("id", profile.id);
    const r2 = await sb.from("user_preferences").upsert({ user_id: profile.id, allergies, dietary_preferences: diet, disliked_foods: disliked.split(",").map((s) => s.trim()).filter(Boolean) });
    setBusy(null);
    if (r1.error || r2.error) return setMsg({ tone: "err", text: (r1.error ?? r2.error)!.message });
    setMsg({ tone: "ok", text: "Perfil guardado." });
    reload();
  }

  async function saveGoal(origin: "manual" | "calculado") {
    setMsg(null);
    if (g.calories < floor) return setMsg({ tone: "err", text: `Por seguridad, el objetivo no puede ser menor a ${Math.round(floor)} kcal (tu metabolismo basal estimado o el mínimo recomendado).` });
    if (g.calories > 6000 || g.protein_g < 0 || g.carbs_g < 0 || g.fat_g < 0) return setMsg({ tone: "err", text: "Valores fuera de rango." });
    setBusy("meta");
    const r = await supabaseBrowser().from("nutrition_goals").insert({ user_id: await uid(), ...g, origin, note: origin === "calculado" ? "Calculado con Mifflin-St Jeor" : "Editado manualmente" });
    setBusy(null);
    if (r.error) return setMsg({ tone: "err", text: r.error.message });
    setMsg({ tone: "ok", text: "Objetivo nutricional actualizado." });
    reload();
  }

  async function logout() {
    await supabaseBrowser().auth.signOut();
    window.location.href = "/login";
  }

  const toggle = (arr: string[], set: (v: string[]) => void, k: string) => set(arr.includes(k) ? arr.filter((x) => x !== k) : [...arr, k]);

  return (
    <div className="space-y-4">
      <PageHeader kicker="Configuración" title="Perfil" right={<button className="btn-ghost py-1.5 text-xs" onClick={logout}><LogOut className="h-3.5 w-3.5" /> Salir</button>} />
      {msg && (msg.tone === "ok" ? <Notice tone="ok">{msg.text}</Notice> : <ErrorBox message={msg.text} />)}

      <section className="card space-y-3">
        <p className="label">Datos personales</p>
        <Field label="Nombre"><input className="input" value={p.display_name ?? ""} onChange={(ev) => setP({ ...p, display_name: ev.target.value })} /></Field>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Edad"><input className="input" type="number" value={p.age} onChange={num("age")} /></Field>
          <Field label="Sexo">
            <select className="input" value={p.sex} onChange={(ev) => setP({ ...p, sex: ev.target.value as Profile["sex"] })}>
              <option value="female">Femenino</option>
              <option value="male">Masculino</option>
            </select>
          </Field>
          <Field label="Estatura cm"><input className="input" type="number" value={p.height_cm} onChange={num("height_cm")} /></Field>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Peso inicial"><input className="input" type="number" step="0.1" value={p.start_weight_kg} onChange={num("start_weight_kg")} /></Field>
          <Field label="Peso actual"><input className="input" type="number" step="0.1" value={p.current_weight_kg} onChange={num("current_weight_kg")} /></Field>
          <Field label="Peso meta"><input className="input" type="number" step="0.1" value={p.target_weight_kg} onChange={num("target_weight_kg")} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Fecha de inicio"><input className="input" type="date" value={p.start_date} onChange={(ev) => setP({ ...p, start_date: ev.target.value })} /></Field>
          <Field label="Fecha deseada"><input className="input" type="date" value={p.target_date ?? ""} onChange={(ev) => setP({ ...p, target_date: ev.target.value || null })} /></Field>
        </div>
        <Field label="Objetivo">
          <select className="input" value={p.nutrition_objective} onChange={(ev) => setP({ ...p, nutrition_objective: ev.target.value as Profile["nutrition_objective"] })}>
            <option value="perder_grasa">Perder grasa conservando músculo</option>
            <option value="mantener">Mantener peso</option>
            <option value="ganar_musculo">Ganar músculo</option>
          </select>
        </Field>
        <Field label="Actividad fuera del gimnasio">
          <select className="input" value={p.daily_activity_factor} onChange={num("daily_activity_factor")}>
            {ACTIVITY_LEVELS.map((a) => <option key={a.value} value={a.value}>{a.label} ({a.value}) — {a.hint}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Entrenos / semana"><input className="input" type="number" min={0} max={7} value={p.training_days_per_week} onChange={num("training_days_per_week")} /></Field>
          <Field label="kcal por sesión" hint="Estimación editable (pesas ~200–350)"><input className="input" type="number" value={p.kcal_per_session} onChange={num("kcal_per_session")} /></Field>
        </div>
        <Field label="Unidades"><select className="input" value="metric" disabled><option value="metric">Métrico (kg, cm, g)</option></select></Field>
      </section>

      <section className="card space-y-3">
        <p className="label">Preferencias y restricciones</p>
        <div className="flex flex-wrap gap-2">
          {PREFERENCE_OPTIONS.map((o) => <button key={o.key} className={cn("chip", diet.includes(o.key) && "chip-on")} onClick={() => toggle(diet, setDiet, o.key)}>{o.label}</button>)}
        </div>
        <p className="text-[11px] text-ink-400">Alergias / intolerancias (se excluyen de las recomendaciones):</p>
        <div className="flex flex-wrap gap-2">
          {ALLERGEN_OPTIONS.map((o) => <button key={o.key} className={cn("chip", allergies.includes(o.key) && "chip-on")} onClick={() => toggle(allergies, setAllergies, o.key)}>{o.label}</button>)}
        </div>
        <Field label="Alimentos que no te gustan" hint="Separados por comas"><input className="input" value={disliked} onChange={(ev) => setDisliked(ev.target.value)} placeholder="atún, brócoli" /></Field>
        <button className="btn-primary w-full" onClick={saveProfile} disabled={busy === "perfil"}>{busy === "perfil" ? <Spinner className="text-ink-950" /> : "Guardar perfil"}</button>
      </section>

      <section className="card space-y-3">
        <p className="label flex items-center gap-1.5"><Calculator className="h-3.5 w-3.5" /> Gasto energético estimado</p>
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Metabolismo basal" value={Math.round(bmrMifflin(p))} unit="kcal" sub="Mifflin-St Jeor" />
          <Stat label="Actividad cotidiana" value={Math.round(e.daily_activity)} unit="kcal" sub={`factor ${p.daily_activity_factor}`} />
          <Stat label="Ejercicio (prom.)" value={Math.round(e.exercise_avg)} unit="kcal/día" sub={`${p.training_days_per_week} × ${p.kcal_per_session} / 7`} />
          <Stat label="Gasto total (TDEE)" value={Math.round(e.tdee_avg)} unit="kcal" accent />
        </div>
        <Notice tone="info">
          Sugerencia: <b>{sug.calories} kcal</b> · P {sug.protein_g} g · C {sug.carbs_g} g · G {sug.fat_g} g (déficit ~{Math.round(sug.deficit)} kcal/día ≈ {(sug.deficit * 7 / 7700).toFixed(2)} kg/semana). {sug.notes.join(" ")}
        </Notice>
        <button className="btn-ghost w-full" onClick={() => setG({ calories: sug.calories, protein_g: sug.protein_g, carbs_g: sug.carbs_g, fat_g: sug.fat_g })}>Usar sugerencia en el formulario</button>
      </section>

      <section className="card space-y-3">
        <p className="label">Objetivo nutricional diario</p>
        <div className="grid grid-cols-4 gap-2">
          <Field label="kcal"><input className="input" type="number" value={g.calories} onChange={(ev) => setG({ ...g, calories: Number(ev.target.value) })} /></Field>
          <Field label="Prot g"><input className="input" type="number" value={g.protein_g} onChange={(ev) => setG({ ...g, protein_g: Number(ev.target.value) })} /></Field>
          <Field label="Carb g"><input className="input" type="number" value={g.carbs_g} onChange={(ev) => setG({ ...g, carbs_g: Number(ev.target.value) })} /></Field>
          <Field label="Grasa g"><input className="input" type="number" value={g.fat_g} onChange={(ev) => setG({ ...g, fat_g: Number(ev.target.value) })} /></Field>
        </div>
        <p className={cn("text-[11px]", Math.abs(macroKcal - g.calories) > g.calories * 0.08 ? "text-carb" : "text-ink-400")}>
          Los macros suman {Math.round(macroKcal)} kcal ({macroKcal > g.calories ? "+" : ""}{Math.round(macroKcal - g.calories)} vs. objetivo). Proteína: {(g.protein_g / p.current_weight_kg).toFixed(1)} g/kg.
        </p>
        <button className="btn-primary w-full" onClick={() => saveGoal(g.calories === sug.calories ? "calculado" : "manual")} disabled={busy === "meta"}>{busy === "meta" ? <Spinner className="text-ink-950" /> : "Guardar objetivo"}</button>
        {history.length > 1 && (
          <details className="text-xs text-ink-300">
            <summary className="cursor-pointer">Historial de objetivos</summary>
            <ul className="mt-2 space-y-1">
              {history.map((h) => <li key={h.id}>{fmtDate(h.effective_from, { day: "numeric", month: "short", year: "2-digit" })}: {h.calories} kcal · P{h.protein_g} C{h.carbs_g} G{h.fat_g} <span className="text-ink-400">({h.origin})</span></li>)}
            </ul>
          </details>
        )}
      </section>
    </div>
  );
}
