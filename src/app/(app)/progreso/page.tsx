"use client";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Camera, Plus, Ruler, Scale, Target, Trash2 } from "lucide-react";
import { useApp } from "@/components/AppProvider";
import { PetAvatar, usePetNames } from "@/components/Pets";
import { useChartColors } from "@/components/theme";
import { ErrorBox, Field, Loading, Notice, PageHeader, Segmented, Sheet, Spinner, Stat } from "@/components/ui";
import { compressImage, fetchDailyTotals, fetchWeights, fetchWorkouts, signedUrl, uid } from "@/lib/data";
import { calorieFloor, energyBreakdown, goalPlan, round, trendAdjustment } from "@/lib/nutrition";
import { addDaysIso, bucketAverages, fmtDate, isoDate, movingAverage, weekStart, weightTrendPerWeek } from "@/lib/stats";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { BodyMeasurement, WeightLog, Workout } from "@/lib/types";

const tip = (c: ReturnType<typeof useChartColors>) => ({ background: c.surface, border: "none", borderRadius: 14, fontSize: 12, color: c.fg, boxShadow: "0 8px 24px -8px rgba(0,0,0,.25)" });
type Range = "week" | "month";

function Progress() {
  const cc = useChartColors();
  const { profile, goal, reload } = useApp();
  const pets = usePetNames();
  const sp = useSearchParams();
  const [range, setRange] = useState<Range>("week");
  const [weights, setWeights] = useState<WeightLog[] | null>(null);
  const [daily, setDaily] = useState<Awaited<ReturnType<typeof fetchDailyTotals>>>([]);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [measures, setMeasures] = useState<BodyMeasurement[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<null | "peso" | "medidas" | "foto">((sp.get("add") as "peso" | "medidas") || null);

  const load = useCallback(async () => {
    try {
      const from = addDaysIso(isoDate(), -180);
      const [w, d, wk, m] = await Promise.all([
        fetchWeights(),
        fetchDailyTotals(from, isoDate()),
        fetchWorkouts(from),
        supabaseBrowser().from("body_measurements").select("*").order("measured_on"),
      ]);
      if (m.error) throw m.error;
      setWeights(w);
      setDaily(d);
      setWorkouts(wk);
      setMeasures(m.data as BodyMeasurement[]);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const energy = energyBreakdown(profile);
  const floor = calorieFloor(profile);
  const current = weights?.at(-1)?.weight_kg ?? profile.current_weight_kg;
  const trend = weights ? weightTrendPerWeek(weights) : null;
  const plan = goalPlan({ currentKg: current, targetKg: profile.target_weight_kg, tdee: energy.tdee_avg, floor, targetDate: profile.target_date });
  const lostSoFar = round(profile.start_weight_kg - current, 1);
  const totalToLose = profile.start_weight_kg - profile.target_weight_kg;
  const pct = totalToLose > 0 ? Math.max(0, Math.min(100, (lostSoFar / totalToLose) * 100)) : 0;

  const weightBuckets = useMemo(() => bucketAverages(weights ?? [], (w) => w.logged_on, (w) => Number(w.weight_kg), range), [weights, range]);
  const kcalBuckets = useMemo(() => bucketAverages(daily, (d) => d.date, (d) => d.kcal, range), [daily, range]);
  const protBuckets = useMemo(() => bucketAverages(daily, (d) => d.date, (d) => d.protein_g, range), [daily, range]);
  const nutritionChart = kcalBuckets.slice(-8).map((b, i) => ({ label: range === "week" ? fmtDate(b.key) : b.key, kcal: Math.round(b.avg), prot: Math.round(protBuckets.find((p) => p.key === b.key)?.avg ?? 0), dias: b.count, i }));
  const sessions = useMemo(() => bucketAverages(workouts, (w) => w.date, () => 1, range).map((b) => ({ label: range === "week" ? fmtDate(b.key) : b.key, n: b.count })).slice(-8), [workouts, range]);
  const chart = useMemo(() => movingAverage(weights ?? []).map((p) => ({ ...p, label: fmtDate(p.date) })), [weights]);

  // cumplimiento últimos 28 días con registro
  const last28 = daily.filter((d) => d.date >= addDaysIso(isoDate(), -28));
  const kcalOk = last28.filter((d) => Math.abs(d.kcal - goal.calories) <= goal.calories * 0.1).length;
  const protOk = last28.filter((d) => d.protein_g >= goal.protein_g * 0.9).length;
  const avgKcal28 = last28.length ? last28.reduce((a, d) => a + d.kcal, 0) / last28.length : 0;
  const avgProt28 = last28.length ? last28.reduce((a, d) => a + d.protein_g, 0) / last28.length : 0;

  const weeksOfData = new Set((weights ?? []).filter((w) => w.logged_on >= addDaysIso(isoDate(), -42)).map((w) => weekStart(w.logged_on))).size;
  const adjust = trend !== null && last28.length >= 14 ? trendAdjustment({ avgIntake: avgKcal28, weeklyChangeKg: trend, weeksOfData, currentGoal: goal.calories, floor }) : null;

  const insights: string[] = [];
  if (trend !== null) {
    if (trend < -0.75) insights.push(`Estás bajando ~${Math.abs(trend)} kg/semana: más rápido de lo recomendado. Revisa que estés comiendo suficiente para cuidar tu músculo.`);
    else if (trend < -0.1) insights.push(`Tendencia de ${trend} kg/semana: un ritmo gradual y sostenible.`);
    else if (trend <= 0.1) insights.push("Tu peso está estable en las últimas semanas. Si llevas 3+ semanas así, revisa el registro (aceites, bebidas) o ajusta un poco el objetivo.");
    else insights.push(`Tu peso subió ~${trend} kg/semana. Puede ser agua, ciclo o sal; mira la tendencia de 2–3 semanas antes de sacar conclusiones.`);
  } else insights.push("Registra tu peso 3–4 veces por semana (en ayunas, misma hora) para ver una tendencia confiable.");
  if (last28.length >= 7) {
    insights.push(`Proteína promedio: ${Math.round(avgProt28)} g/día (objetivo ${goal.protein_g} g). Alcanzada en ${protOk} de ${last28.length} días registrados.`);
    if (last28.length < 20) insights.push(`Registraste ${last28.length} de los últimos 28 días. Cuantos más días registres, más precisos serán los cálculos.`);
  }
  const wkCount = workouts.filter((w) => w.date >= addDaysIso(isoDate(), -28)).length;
  insights.push(`Entrenaste ${wkCount} veces en 4 semanas (meta: ${profile.training_days_per_week * 4}).`);
  if (measures.length >= 2 && measures[0].waist_cm && measures.at(-1)!.waist_cm) {
    const dw = round(Number(measures.at(-1)!.waist_cm) - Number(measures[0].waist_cm), 1);
    insights.push(`Cintura: ${dw > 0 ? "+" : ""}${dw} cm desde la primera medición.${dw < 0 && Math.abs(lostSoFar) < 1 ? " Aunque la balanza se mueva poco, estás perdiendo medidas." : ""}`);
  }

  async function applyAdjust() {
    if (!adjust) return;
    const ratio = adjust.suggestedGoal / goal.calories;
    const carbs = Math.max(0, Math.round(goal.carbs_g + (adjust.suggestedGoal - goal.calories) / 4));
    await supabaseBrowser().from("nutrition_goals").insert({ user_id: await uid(), calories: adjust.suggestedGoal, protein_g: goal.protein_g, carbs_g: carbs, fat_g: goal.fat_g, origin: "ajuste_tendencia", note: `Ajuste por tendencia (${ratio > 1 ? "+" : ""}${adjust.change} kcal)` });
    await reload();
  }

  if (error) return <ErrorBox message={error} onRetry={load} />;
  if (!weights) return <Loading />;

  return (
    <div className="stagger space-y-4">
      <PageHeader kicker="Tu evolución" title="Progreso" right={<Segmented value={range} onChange={setRange} options={[{ value: "week", label: "Semana" }, { value: "month", label: "Mes" }]} />} />

      <section className="card">
        <div className="mb-3 flex items-center justify-between">
          <p className="label flex items-center gap-1.5"><Target className="h-3.5 w-3.5" /> Objetivo de peso</p>
          <button className="btn-primary py-1.5 text-xs" onClick={() => setSheet("peso")}><Plus className="h-3.5 w-3.5" /> Peso</button>
        </div>
        <div className="flex items-end justify-between">
          <div><p className="text-[11px] text-faint">Inicio</p><p className="num text-xl">{profile.start_weight_kg}</p></div>
          <div className="text-center"><p className="text-[11px] text-faint">Actual</p><p className="num text-5xl text-accent">{current}</p></div>
          <div className="text-right"><p className="text-[11px] text-faint">Meta</p><p className="num text-xl">{profile.target_weight_kg}</p></div>
        </div>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-track"><div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} /></div>
        <p className="mt-2 text-xs text-muted">
          {lostSoFar >= 0 ? `-${lostSoFar}` : `+${Math.abs(lostSoFar)}`} kg desde el inicio · faltan {Math.max(0, round(current - profile.target_weight_kg, 1))} kg · {Math.round(pct)}%
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Stat label="Tendencia" value={trend === null ? "—" : `${trend > 0 ? "+" : ""}${trend}`} unit={trend === null ? "" : "kg/sem"} sub="regresión de todos los pesajes" />
          <Stat label="Plazo saludable" value={`${plan.weeks_range[0]}–${plan.weeks_range[1]}`} unit="sem" sub="a 0.25–0.5 kg/semana" />
        </div>
        {profile.target_date && plan.required_kg_per_week !== null && (
          <p className="mt-3 text-xs text-muted">
            Para el {fmtDate(profile.target_date, { day: "numeric", month: "long", year: "numeric" })} necesitarías {plan.required_kg_per_week} kg/semana (déficit ~{plan.required_daily_deficit} kcal/día).
          </p>
        )}
        <div className="mt-2">
          <Notice tone={plan.pace === "agresivo" ? "warn" : plan.pace === "saludable" ? "ok" : "info"}>
            {plan.messages.join(" ")}
            {!profile.target_date && " Puedes fijar una fecha deseada en tu perfil."}
          </Notice>
        </div>
      </section>

      <section className="card">
        <p className="label mb-2 flex items-center gap-1.5"><Scale className="h-3.5 w-3.5" /> Peso diario y media de 7 días</p>
        {chart.length < 2 ? (
          <Notice tone="info">Registra al menos dos pesajes para ver el gráfico.</Notice>
        ) : (
          <div className="h-56">
            <ResponsiveContainer>
              <LineChart data={chart} margin={{ left: -20, right: 8, top: 8 }}>
                <CartesianGrid stroke={cc.grid} vertical={false} />
                <XAxis dataKey="label" stroke={cc.axis} tickLine={false} axisLine={false} fontSize={11} minTickGap={20} />
                <YAxis stroke={cc.axis} tickLine={false} axisLine={false} fontSize={11} domain={["dataMin - 1", "dataMax + 1"]} />
                <Tooltip contentStyle={tip(cc)} />
                <ReferenceLine y={profile.target_weight_kg} stroke={cc.pos} strokeDasharray="4 4" />
                <Line isAnimationActive={false} type="monotone" dataKey="weight" name="Pesaje" stroke={cc.axis} strokeWidth={0} dot={{ r: 2.5, fill: cc.axis }} />
                <Line isAnimationActive={false} type="monotone" dataKey="avg" name="Media 7 días" stroke={cc.accent} strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="mt-3 flex gap-2 overflow-x-auto no-scrollbar">
          {weightBuckets.slice(-8).map((b, i, arr) => {
            const d = i > 0 ? round(b.avg - arr[i - 1].avg, 2) : null;
            return (
              <div key={b.key} className="min-w-[84px] rounded-2xl bg-surface-2 p-2 text-center">
                <p className="text-[10px] text-faint">{range === "week" ? `Sem ${fmtDate(b.key)}` : b.key}</p>
                <p className="num text-lg">{b.avg}</p>
                <p className={`text-[10px] ${d === null ? "text-faint" : d < 0 ? "text-pos" : d > 0 ? "text-fat" : "text-faint"}`}>{d === null ? `${b.count} pesajes` : `${d > 0 ? "+" : ""}${d} kg`}</p>
              </div>
            );
          })}
        </div>
        <WeightList weights={weights} onChange={load} />
      </section>

      <section className="card">
        <div className="mb-3 flex items-center gap-3">
          <PetAvatar kind="yorkie2" size={52} />
          <div>
            <p className="serif text-[19px] leading-tight">Lo que muestran tus datos</p>
            <p className="text-[12px] text-muted">{pets.yorkie2} revisó tus últimas semanas</p>
          </div>
        </div>
        <ul className="space-y-2 text-[14px] leading-relaxed">
          {insights.map((t, i) => <li key={i} className="flex gap-2.5"><i className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" /><span>{t}</span></li>)}
        </ul>
        {adjust && (
          <div className="mt-3 rounded-2xl bg-surface-2/70 p-3.5 text-xs">
            <p className="text-fg">Gasto real estimado con tus datos: <b className="num">{adjust.observedTdee}</b> kcal/día (modelo: {Math.round(energy.tdee_avg)}).</p>
            <p className="mt-1 text-muted">{adjust.message}</p>
            {Math.abs(adjust.change) >= 30 && (
              <button className="btn-primary mt-2 py-1.5 text-xs" onClick={applyAdjust}>Aplicar {adjust.suggestedGoal} kcal</button>
            )}
          </div>
        )}
      </section>

      <section className="card">
        <p className="label mb-2">Calorías promedio por día ({range === "week" ? "por semana" : "por mes"})</p>
        {nutritionChart.length === 0 ? (
          <Notice tone="info">Aún no hay comidas registradas.</Notice>
        ) : (
          <div className="space-y-3">
            <div className="h-44">
              <ResponsiveContainer>
                <BarChart data={nutritionChart} margin={{ left: -16, right: 8, top: 8 }}>
                  <CartesianGrid stroke={cc.grid} vertical={false} />
                  <XAxis dataKey="label" stroke={cc.axis} tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis stroke={cc.axis} tickLine={false} axisLine={false} fontSize={11} domain={[0, (max: number) => Math.round(Math.max(max, goal.calories) * 1.1)]} />
                  <Tooltip contentStyle={tip(cc)} />
                  <ReferenceLine y={goal.calories} stroke={cc.accent} strokeDasharray="4 4" />
                  <Bar isAnimationActive={false} dataKey="kcal" name="kcal/día" fill={cc.accent} radius={[8, 8, 8, 8]} barSize={14} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="label">Proteína g/día</p>
            <div className="h-36">
              <ResponsiveContainer>
                <BarChart data={nutritionChart} margin={{ left: -16, right: 8, top: 8 }}>
                  <CartesianGrid stroke={cc.grid} vertical={false} />
                  <XAxis dataKey="label" stroke={cc.axis} tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis stroke={cc.axis} tickLine={false} axisLine={false} fontSize={11} domain={[0, (max: number) => Math.round(Math.max(max, goal.protein_g) * 1.1)]} />
                  <Tooltip contentStyle={tip(cc)} />
                  <ReferenceLine y={goal.protein_g} stroke={cc.prot} strokeDasharray="4 4" />
                  <Bar isAnimationActive={false} dataKey="prot" name="proteína g/día" fill={cc.prot} radius={[8, 8, 8, 8]} barSize={14} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Stat label="kcal prom." value={Math.round(avgKcal28) || "—"} sub="últimos 28 días" />
          <Stat label="kcal en rango" value={last28.length ? `${kcalOk}/${last28.length}` : "—"} sub="±10% del objetivo" />
          <Stat label="Proteína ok" value={last28.length ? `${protOk}/${last28.length}` : "—"} sub="≥90% del objetivo" />
        </div>
      </section>

      <section className="card">
        <p className="label mb-2">Entrenamientos por {range === "week" ? "semana" : "mes"}</p>
        {sessions.length === 0 ? <Notice tone="info">Sin entrenamientos registrados.</Notice> : (
          <div className="h-40">
            <ResponsiveContainer>
              <BarChart data={sessions} margin={{ left: -28, right: 8, top: 8 }}>
                <XAxis dataKey="label" stroke={cc.axis} tickLine={false} axisLine={false} fontSize={11} />
                <YAxis stroke={cc.axis} tickLine={false} axisLine={false} fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={tip(cc)} />
                {range === "week" && <ReferenceLine y={profile.training_days_per_week} stroke={cc.accent} strokeDasharray="4 4" />}
                <Bar isAnimationActive={false} dataKey="n" name="sesiones" fill={cc.pos} radius={[8, 8, 8, 8]} barSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <Measurements measures={measures} onAdd={() => setSheet("medidas")} />
      <ProgressPhotos open={sheet === "foto"} onOpen={() => setSheet("foto")} onClose={() => setSheet(null)} />

      <WeightSheet open={sheet === "peso"} onClose={() => setSheet(null)} onSaved={() => { setSheet(null); load(); reload(); }} />
      <MeasureSheet open={sheet === "medidas"} onClose={() => setSheet(null)} onSaved={() => { setSheet(null); load(); }} />
    </div>
  );
}

function WeightList({ weights, onChange }: { weights: WeightLog[]; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3">
      <button className="text-xs text-muted underline" onClick={() => setOpen(!open)}>{open ? "Ocultar" : "Ver"} pesajes ({weights.length})</button>
      {open && (
        <ul className="mt-2 max-h-60 divide-y divide-line overflow-y-auto">
          {[...weights].reverse().map((w) => (
            <li key={w.id} className="flex items-center justify-between py-1.5 text-sm">
              <span className="text-muted">{fmtDate(w.logged_on, { weekday: "short", day: "numeric", month: "short", year: "2-digit" })}</span>
              <span className="flex items-center gap-3">
                <span className="num">{w.weight_kg} kg</span>
                <button aria-label="Eliminar pesaje" className="text-faint hover:text-fat" onClick={async () => { await supabaseBrowser().from("weight_logs").delete().eq("id", w.id); onChange(); }}><Trash2 className="h-3.5 w-3.5" /></button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function WeightSheet({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [kg, setKg] = useState("");
  const [date, setDate] = useState(isoDate());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    const v = Number(kg.replace(",", "."));
    if (!(v >= 30 && v <= 300)) return setError("Ingresa un peso válido (30–300 kg).");
    setBusy(true);
    const user_id = await uid();
    const sb = supabaseBrowser();
    const r = await sb.from("weight_logs").insert({ user_id, logged_on: date, weight_kg: v });
    if (!r.error) {
      // el peso actual del perfil = último pesaje por fecha
      const last = await sb.from("weight_logs").select("weight_kg").order("logged_on", { ascending: false }).order("created_at", { ascending: false }).limit(1).single();
      if (last.data) await sb.from("profiles").update({ current_weight_kg: last.data.weight_kg }).eq("id", user_id);
    }
    setBusy(false);
    if (r.error) return setError(r.error.message);
    setKg("");
    onSaved();
  }
  return (
    <Sheet open={open} onClose={onClose} title="Registrar peso">
      <div className="space-y-3">
        <Field label="Peso (kg)"><input className="input text-2xl" inputMode="decimal" autoFocus value={kg} onChange={(e) => setKg(e.target.value)} placeholder="68.0" /></Field>
        <Field label="Fecha"><input className="input" type="date" value={date} max={isoDate()} onChange={(e) => setDate(e.target.value)} /></Field>
        <p className="text-[11px] text-faint">Consejo: pésate en ayunas, después de ir al baño y con poca ropa. Las variaciones de 0.5–1.5 kg de un día a otro son normales.</p>
        {error && <ErrorBox message={error} />}
        <button className="btn-primary w-full" onClick={save} disabled={busy}>{busy ? <Spinner className="text-on-accent" /> : "Guardar"}</button>
      </div>
    </Sheet>
  );
}

const MEASURE_FIELDS = [
  { k: "waist_cm", l: "Cintura" },
  { k: "hip_cm", l: "Cadera" },
  { k: "thigh_cm", l: "Muslo" },
  { k: "arm_cm", l: "Brazo" },
  { k: "chest_cm", l: "Pecho" },
] as const;

function Measurements({ measures, onAdd }: { measures: BodyMeasurement[]; onAdd: () => void }) {
  const cc = useChartColors();
  const first = measures[0];
  const last = measures.at(-1);
  return (
    <section className="card">
      <div className="mb-2 flex items-center justify-between">
        <p className="label flex items-center gap-1.5"><Ruler className="h-3.5 w-3.5" /> Medidas corporales</p>
        <button className="btn-ghost py-1.5 text-xs" onClick={onAdd}><Plus className="h-3.5 w-3.5" /> Medidas</button>
      </div>
      {!last ? <Notice tone="info">Registra tus medidas cada 2–4 semanas. Muchas veces cambian aunque la balanza no.</Notice> : (
        <>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {MEASURE_FIELDS.map(({ k, l }) => {
              const v = last[k];
              if (v === null || v === undefined) return null;
              const d = first && first !== last && first[k] ? round(Number(v) - Number(first[k]), 1) : null;
              return <Stat key={k} label={l} value={Number(v)} unit="cm" sub={d === null ? fmtDate(last.measured_on) : `${d > 0 ? "+" : ""}${d} cm desde inicio`} />;
            })}
          </div>
          {measures.length >= 2 && (
            <div className="mt-3 h-40">
              <ResponsiveContainer>
                <LineChart data={measures.map((m) => ({ label: fmtDate(m.measured_on), cintura: m.waist_cm ? Number(m.waist_cm) : null, cadera: m.hip_cm ? Number(m.hip_cm) : null, muslo: m.thigh_cm ? Number(m.thigh_cm) : null }))} margin={{ left: -20, right: 8, top: 8 }}>
                  <XAxis dataKey="label" stroke={cc.axis} tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis stroke={cc.axis} tickLine={false} axisLine={false} fontSize={11} domain={["dataMin - 2", "dataMax + 2"]} />
                  <Tooltip contentStyle={tip(cc)} />
                  <Line isAnimationActive={false} dataKey="cintura" stroke={cc.accent} strokeWidth={2} connectNulls />
                  <Line isAnimationActive={false} dataKey="cadera" stroke={cc.prot} strokeWidth={2} connectNulls />
                  <Line isAnimationActive={false} dataKey="muslo" stroke={cc.carb} strokeWidth={2} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function MeasureSheet({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [vals, setVals] = useState<Record<string, string>>({});
  const [date, setDate] = useState(isoDate());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    const row: Record<string, number | null> = {};
    for (const { k } of MEASURE_FIELDS) {
      const s = vals[k]?.replace(",", ".");
      row[k] = s ? Number(s) : null;
      if (row[k] !== null && !(row[k]! > 5 && row[k]! < 250)) return setError("Revisa los valores (en cm).");
    }
    if (Object.values(row).every((v) => v === null)) return setError("Ingresa al menos una medida.");
    setBusy(true);
    const r = await supabaseBrowser().from("body_measurements").insert({ user_id: await uid(), measured_on: date, note: note || null, ...row });
    setBusy(false);
    if (r.error) return setError(r.error.message);
    setVals({});
    onSaved();
  }
  return (
    <Sheet open={open} onClose={onClose} title="Medidas corporales">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {MEASURE_FIELDS.map(({ k, l }) => (
            <Field key={k} label={`${l} (cm)`}><input className="input" inputMode="decimal" value={vals[k] ?? ""} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} /></Field>
          ))}
          <Field label="Fecha"><input className="input" type="date" value={date} max={isoDate()} onChange={(e) => setDate(e.target.value)} /></Field>
        </div>
        <input className="input" placeholder="Nota (opcional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <p className="text-[11px] text-faint">Mide siempre en el mismo punto y a la misma hora. Cintura: a la altura del ombligo, sin apretar.</p>
        {error && <ErrorBox message={error} />}
        <button className="btn-primary w-full" onClick={save} disabled={busy}>{busy ? <Spinner className="text-on-accent" /> : "Guardar medidas"}</button>
      </div>
    </Sheet>
  );
}

function ProgressPhotos({ open, onOpen, onClose }: { open: boolean; onOpen: () => void; onClose: () => void }) {
  const [photos, setPhotos] = useState<{ id: string; taken_on: string; url: string | null; storage_path: string }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabaseBrowser().from("progress_photos").select("*").order("taken_on", { ascending: false }).limit(30);
    const rows = data ?? [];
    setPhotos(await Promise.all(rows.map(async (p) => ({ id: p.id, taken_on: p.taken_on, storage_path: p.storage_path, url: await signedUrl("progress-photos", p.storage_path) }))));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function upload(f: File | undefined) {
    if (!f) return;
    setBusy(true);
    setError(null);
    try {
      const img = await compressImage(f, 1600, 0.85);
      const user_id = await uid();
      const path = `${user_id}/${crypto.randomUUID()}.jpg`;
      const up = await supabaseBrowser().storage.from("progress-photos").upload(path, img, { contentType: "image/jpeg" });
      if (up.error) throw up.error;
      const ins = await supabaseBrowser().from("progress_photos").insert({ user_id, storage_path: path });
      if (ins.error) throw ins.error;
      await load();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  async function remove(p: { id: string; storage_path: string }) {
    if (!confirm("¿Eliminar esta foto?")) return;
    await supabaseBrowser().storage.from("progress-photos").remove([p.storage_path]);
    await supabaseBrowser().from("progress_photos").delete().eq("id", p.id);
    load();
  }

  return (
    <section className="card">
      <div className="mb-2 flex items-center justify-between">
        <p className="label flex items-center gap-1.5"><Camera className="h-3.5 w-3.5" /> Fotos de progreso · privadas</p>
        <button className="btn-ghost py-1.5 text-xs" onClick={onOpen}><Plus className="h-3.5 w-3.5" /> Foto</button>
      </div>
      {!photos ? <Spinner /> : photos.length === 0 ? <p className="text-xs text-faint">Solo tú puedes verlas: se guardan en un almacenamiento privado de tu cuenta y se muestran con enlaces temporales.</p> : (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((p) => (
            <div key={p.id} className="group relative aspect-[3/4] overflow-hidden rounded-2xl bg-surface-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {p.url && <img src={p.url} alt={`Progreso ${p.taken_on}`} className="h-full w-full object-cover" />}
              <span className="absolute bottom-1 left-1 rounded bg-bg/80 px-1.5 text-[10px]">{fmtDate(p.taken_on)}</span>
              <button aria-label="Eliminar foto" className="absolute right-1 top-1 rounded bg-bg/80 p-1 text-fat" onClick={() => remove(p)}><Trash2 className="h-3 w-3" /></button>
            </div>
          ))}
        </div>
      )}
      <Sheet open={open} onClose={onClose} title="Foto de progreso">
        <div className="space-y-3">
          <p className="text-sm text-muted">Usa la misma luz, pose y distancia cada vez para poder comparar.</p>
          <label className="btn-primary w-full cursor-pointer">
            {busy ? <Spinner className="text-on-accent" /> : <><Camera className="h-4 w-4" /> Tomar o elegir foto</>}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => upload(e.target.files?.[0])} disabled={busy} />
          </label>
          {error && <ErrorBox message={error} />}
        </div>
      </Sheet>
    </section>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <Progress />
    </Suspense>
  );
}
