"use client";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChevronDown, Plus, Trash2, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { ErrorBox, Field, Loading, Notice, PageHeader, Segmented, Sheet, Spinner, Stat } from "@/components/ui";
import { fetchWorkouts, uid } from "@/lib/data";
import { fmtDate, isoDate } from "@/lib/stats";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Routine, RoutineExercise, Workout } from "@/lib/types";

type Tab = "historial" | "progreso" | "rutinas";

interface DraftSet { reps: string; weight: string }
interface DraftExercise { name: string; comment: string; sets: DraftSet[] }

function Training() {
  const sp = useSearchParams();
  const [tab, setTab] = useState<Tab>("historial");
  const [workouts, setWorkouts] = useState<Workout[] | null>(null);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(sp.get("nuevo") === "1");

  const load = useCallback(async () => {
    try {
      const [w, r] = await Promise.all([fetchWorkouts(), supabaseBrowser().from("routines").select("*").order("day_order")]);
      if (r.error) throw r.error;
      setWorkouts(w);
      setRoutines(r.data as Routine[]);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const thisWeek = useMemo(() => {
    const d = new Date();
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const m = isoDate(monday);
    return (workouts ?? []).filter((w) => w.date >= m).length;
  }, [workouts]);

  // sugerir el siguiente día de la rutina según el último entrenamiento
  const nextRoutine = useMemo(() => {
    if (!routines.length) return null;
    const last = workouts?.find((w) => w.routine_id);
    const idx = last ? routines.findIndex((r) => r.id === last.routine_id) : -1;
    return routines[(idx + 1) % routines.length];
  }, [routines, workouts]);

  async function removeWorkout(id: string) {
    if (!confirm("¿Eliminar este entrenamiento?")) return;
    await supabaseBrowser().from("workouts").delete().eq("id", id);
    load();
  }

  return (
    <div className="space-y-4">
      <PageHeader kicker="Gimnasio" title="Entrenamiento" right={<button className="btn-primary" onClick={() => setEditorOpen(true)}><Plus className="h-4 w-4" /> Nuevo</button>} />
      {error && <ErrorBox message={error} onRetry={load} />}
      {!workouts && !error && <Loading />}
      {workouts && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Esta semana" value={thisWeek} unit="ses." accent />
            <Stat label="Total" value={workouts.length} unit="ses." />
            <Stat label="Toca hoy" value={nextRoutine?.name ?? "—"} sub={nextRoutine?.muscle_groups} />
          </div>
          <Segmented value={tab} onChange={setTab} options={[{ value: "historial", label: "Historial" }, { value: "progreso", label: "Cargas" }, { value: "rutinas", label: "Rutinas" }]} />
          {tab === "historial" && <History workouts={workouts} onDelete={removeWorkout} />}
          {tab === "progreso" && <ExerciseProgress workouts={workouts} />}
          {tab === "rutinas" && <Routines routines={routines} onChange={load} />}
        </>
      )}
      <WorkoutEditor open={editorOpen} routines={routines} suggested={nextRoutine} workouts={workouts ?? []} onClose={() => setEditorOpen(false)} onSaved={() => { setEditorOpen(false); load(); }} />
    </div>
  );
}

function History({ workouts, onDelete }: { workouts: Workout[]; onDelete: (id: string) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!workouts.length) return <Notice tone="info">Aún no registras entrenamientos. Toca &quot;Nuevo&quot; para empezar.</Notice>;
  return (
    <ul className="space-y-2">
      {workouts.map((w) => {
        const vol = w.workout_exercises.reduce((a, e) => a + e.exercise_sets.reduce((b, s) => b + s.reps * s.weight_kg, 0), 0);
        const isOpen = open === w.id;
        return (
          <li key={w.id} className="card">
            <button className="flex w-full items-center justify-between text-left" onClick={() => setOpen(isOpen ? null : w.id)}>
              <div>
                <p className="label text-lime-400">{fmtDate(w.date, { weekday: "short", day: "numeric", month: "short" })}</p>
                <p className="h-display text-lg">{w.muscle_group}</p>
                <p className="text-[11px] text-ink-400">{w.workout_exercises.length} ejercicios · volumen {Math.round(vol).toLocaleString("es-PE")} kg</p>
              </div>
              <ChevronDown className={`h-5 w-5 transition ${isOpen ? "rotate-180" : ""}`} />
            </button>
            {isOpen && (
              <div className="mt-3 space-y-3 border-t border-ink-700 pt-3">
                {w.workout_exercises.map((e) => (
                  <div key={e.id}>
                    <p className="text-sm font-semibold">{e.name}</p>
                    <p className="text-xs text-ink-300">{e.exercise_sets.map((s) => `${s.reps}×${s.weight_kg}kg`).join(" · ")}</p>
                    {e.comment && <p className="text-[11px] italic text-ink-400">{e.comment}</p>}
                  </div>
                ))}
                {w.notes && <p className="text-xs text-ink-300">Notas: {w.notes}</p>}
                <button className="btn-danger py-1.5 text-xs" onClick={() => onDelete(w.id)}><Trash2 className="h-3.5 w-3.5" /> Eliminar</button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Historial por ejercicio: carga máxima, volumen y comparación con la sesión anterior. */
function exerciseHistory(workouts: Workout[], name: string) {
  const key = name.trim().toLowerCase();
  return workouts
    .flatMap((w) => w.workout_exercises.filter((e) => e.name.trim().toLowerCase() === key).map((e) => ({ date: w.date, sets: e.exercise_sets })))
    .filter((x) => x.sets.length)
    .map((x) => ({
      date: x.date,
      maxKg: Math.max(...x.sets.map((s) => s.weight_kg)),
      totalReps: x.sets.reduce((a, s) => a + s.reps, 0),
      volume: x.sets.reduce((a, s) => a + s.reps * s.weight_kg, 0),
      // 1RM estimado (Epley) del mejor set, como indicador de rendimiento
      e1rm: Math.max(...x.sets.map((s) => (s.reps > 0 ? s.weight_kg * (1 + s.reps / 30) : 0))),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function ExerciseProgress({ workouts }: { workouts: Workout[] }) {
  const names = useMemo(() => [...new Set(workouts.flatMap((w) => w.workout_exercises.map((e) => e.name.trim())))].sort(), [workouts]);
  const [name, setName] = useState(names[0] ?? "");
  useEffect(() => {
    if (!name && names[0]) setName(names[0]);
  }, [names, name]);
  const hist = useMemo(() => exerciseHistory(workouts, name), [workouts, name]);
  if (!names.length) return <Notice tone="info">Registra entrenamientos para ver la evolución de tus cargas.</Notice>;
  const last = hist.at(-1);
  const prev = hist.at(-2);
  const delta = last && prev ? last.volume - prev.volume : null;
  return (
    <div className="space-y-3">
      <select className="input" value={name} onChange={(e) => setName(e.target.value)}>
        {names.map((n) => <option key={n}>{n}</option>)}
      </select>
      {last && (
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Carga máx." value={last.maxKg} unit="kg" accent />
          <Stat label="Reps totales" value={last.totalReps} />
          <Stat label="vs. anterior" value={delta === null ? "—" : `${delta > 0 ? "+" : ""}${Math.round(delta)}`} unit={delta === null ? "" : "kg vol."} />
        </div>
      )}
      {delta !== null && (
        <p className="flex items-center gap-1.5 text-xs text-ink-300">
          {delta > 0 ? <TrendingUp className="h-4 w-4 text-mint-400" /> : delta < 0 ? <TrendingDown className="h-4 w-4 text-fat" /> : <Minus className="h-4 w-4" />}
          {delta > 0 ? "Subiste el volumen respecto a la sesión anterior." : delta < 0 ? "Volumen menor que la sesión anterior: normal en días de descanso activo o si estás en déficit." : "Mismo volumen que la sesión anterior."}
        </p>
      )}
      <div className="card h-56">
        <ResponsiveContainer>
          <LineChart data={hist.map((h) => ({ ...h, label: fmtDate(h.date) }))} margin={{ left: -20, right: 8, top: 8 }}>
            <CartesianGrid stroke="#232A31" vertical={false} />
            <XAxis dataKey="label" stroke="#6B7783" fontSize={11} />
            <YAxis stroke="#6B7783" fontSize={11} />
            <Tooltip contentStyle={{ background: "#12161A", border: "1px solid #2F3841", borderRadius: 12 }} />
            <Line isAnimationActive={false} type="monotone" dataKey="maxKg" name="Carga máx. (kg)" stroke="#B6F23C" strokeWidth={2.5} dot={{ r: 3 }} />
            <Line isAnimationActive={false} type="monotone" dataKey="e1rm" name="1RM estimado (kg)" stroke="#4FC3F7" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[11px] text-ink-400">1RM estimado con la fórmula de Epley; es solo un indicador para comparar sesiones.</p>
    </div>
  );
}

function WorkoutEditor({ open, routines, suggested, workouts, onClose, onSaved }: { open: boolean; routines: Routine[]; suggested: Routine | null; workouts: Workout[]; onClose: () => void; onSaved: () => void }) {
  const [date, setDate] = useState(isoDate());
  const [routineId, setRoutineId] = useState<string>("");
  const [group, setGroup] = useState("");
  const [notes, setNotes] = useState("");
  const [duration, setDuration] = useState("");
  const [exercises, setExercises] = useState<DraftExercise[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // última carga usada en cada ejercicio, para precargar
  const lastFor = useCallback((name: string) => {
    for (const w of workouts) {
      const e = w.workout_exercises.find((x) => x.name.toLowerCase() === name.toLowerCase());
      if (e?.exercise_sets.length) return e.exercise_sets;
    }
    return null;
  }, [workouts]);

  const applyRoutine = useCallback((r: Routine | undefined) => {
    if (!r) {
      setRoutineId("");
      setGroup("");
      setExercises([{ name: "", comment: "", sets: [{ reps: "", weight: "" }] }]);
      return;
    }
    setRoutineId(r.id);
    setGroup(r.muscle_groups);
    setExercises(r.exercises.map((ex: RoutineExercise) => {
      const prev = lastFor(ex.name);
      return { name: ex.name, comment: "", sets: Array.from({ length: ex.sets }, (_, i) => ({ reps: String(prev?.[i]?.reps ?? ex.reps), weight: prev?.[i] ? String(prev[i].weight_kg) : "" })) };
    }));
  }, [lastFor]);

  useEffect(() => {
    if (open) {
      setDate(isoDate());
      setNotes("");
      setDuration("");
      setError(null);
      applyRoutine(suggested ?? undefined);
    }
  }, [open, suggested, applyRoutine]);

  const upd = (i: number, patch: Partial<DraftExercise>) => setExercises((a) => a.map((e, k) => (k === i ? { ...e, ...patch } : e)));
  const updSet = (i: number, j: number, patch: Partial<DraftSet>) => upd(i, { sets: exercises[i].sets.map((s, k) => (k === j ? { ...s, ...patch } : s)) });

  async function save() {
    setError(null);
    if (!group.trim()) return setError("Indica el grupo muscular.");
    const valid = exercises
      .filter((e) => e.name.trim())
      .map((e) => ({ ...e, sets: e.sets.filter((s) => s.reps !== "").map((s) => ({ reps: Number(s.reps), weight: Number(s.weight || 0) })) }))
      .filter((e) => e.sets.length);
    if (!valid.length) return setError("Agrega al menos un ejercicio con una serie.");
    if (valid.some((e) => e.sets.some((s) => !(s.reps >= 0 && s.reps <= 500) || !(s.weight >= 0 && s.weight <= 1000)))) return setError("Revisa repeticiones (0–500) y peso (0–1000 kg).");
    setBusy(true);
    const sb = supabaseBrowser();
    try {
      const user_id = await uid();
      const w = await sb.from("workouts").insert({ user_id, date, routine_id: routineId || null, muscle_group: group.trim(), notes: notes.trim() || null, duration_min: duration ? Number(duration) : null }).select("id").single();
      if (w.error) throw w.error;
      for (const [pos, e] of valid.entries()) {
        const ex = await sb.from("workout_exercises").insert({ user_id, workout_id: w.data.id, name: e.name.trim(), position: pos, comment: e.comment.trim() || null }).select("id").single();
        if (ex.error) throw ex.error;
        const sets = await sb.from("exercise_sets").insert(e.sets.map((s, k) => ({ user_id, workout_exercise_id: ex.data.id, set_number: k + 1, reps: s.reps, weight_kg: s.weight })));
        if (sets.error) throw sets.error;
      }
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  return (
    <Sheet open={open} onClose={onClose} title="Registrar entrenamiento">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Fecha"><input type="date" className="input" value={date} max={isoDate()} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Rutina">
            <select className="input" value={routineId} onChange={(e) => applyRoutine(routines.find((r) => r.id === e.target.value))}>
              <option value="">Libre</option>
              {routines.map((r) => <option key={r.id} value={r.id}>{r.name} · {r.muscle_groups}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Grupo muscular"><input className="input" value={group} onChange={(e) => setGroup(e.target.value)} placeholder="Ej. Glúteos y femorales" /></Field>

        {exercises.map((e, i) => (
          <div key={i} className="card-tight space-y-2">
            <div className="flex gap-2">
              <input className="input py-1.5 font-semibold" placeholder="Ejercicio" value={e.name} onChange={(ev) => upd(i, { name: ev.target.value })} />
              <button className="rounded-lg p-2 text-fat" aria-label="Quitar ejercicio" onClick={() => setExercises((a) => a.filter((_, k) => k !== i))}><Trash2 className="h-4 w-4" /></button>
            </div>
            <div className="grid grid-cols-[28px_1fr_1fr_28px] items-center gap-1.5 text-[10px] uppercase tracking-wider text-ink-400">
              <span>#</span><span>Reps</span><span>Peso kg</span><span />
            </div>
            {e.sets.map((s, j) => (
              <div key={j} className="grid grid-cols-[28px_1fr_1fr_28px] items-center gap-1.5">
                <span className="num text-ink-400">{j + 1}</span>
                <input className="input py-1.5" type="number" inputMode="numeric" value={s.reps} onChange={(ev) => updSet(i, j, { reps: ev.target.value })} aria-label="Repeticiones" />
                <input className="input py-1.5" type="number" inputMode="decimal" value={s.weight} placeholder="0" onChange={(ev) => updSet(i, j, { weight: ev.target.value })} aria-label="Peso" />
                <button className="text-ink-400" aria-label="Quitar serie" onClick={() => upd(i, { sets: e.sets.filter((_, k) => k !== j) })}>×</button>
              </div>
            ))}
            <div className="flex gap-2">
              <button className="chip" onClick={() => upd(i, { sets: [...e.sets, { ...(e.sets.at(-1) ?? { reps: "", weight: "" }) }] })}>+ Serie</button>
              <input className="input py-1 text-xs" placeholder="Comentario" value={e.comment} onChange={(ev) => upd(i, { comment: ev.target.value })} />
            </div>
          </div>
        ))}
        <button className="btn-ghost w-full" onClick={() => setExercises((a) => [...a, { name: "", comment: "", sets: [{ reps: "", weight: "" }] }])}><Plus className="h-4 w-4" /> Ejercicio</button>
        <div className="grid grid-cols-[1fr_110px] gap-2">
          <input className="input" placeholder="Notas de la sesión" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <input className="input" type="number" placeholder="Minutos" value={duration} onChange={(e) => setDuration(e.target.value)} />
        </div>
        {error && <ErrorBox message={error} />}
        <button className="btn-primary w-full py-3" onClick={save} disabled={busy}>{busy ? <Spinner className="text-ink-950" /> : "Guardar entrenamiento"}</button>
      </div>
    </Sheet>
  );
}

function Routines({ routines, onChange }: { routines: Routine[]; onChange: () => void }) {
  const [edit, setEdit] = useState<Routine | null>(null);
  const [form, setForm] = useState<{ name: string; muscle_groups: string; day_order: string; exercises: { name: string; sets: string; reps: string }[] }>({ name: "", muscle_groups: "", day_order: "1", exercises: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openEdit(r: Routine | null) {
    setError(null);
    const base = r ?? { id: "", name: `Día ${routines.length + 1}`, muscle_groups: "", day_order: routines.length + 1, exercises: [] };
    setEdit(base as Routine);
    setForm({ name: base.name, muscle_groups: base.muscle_groups, day_order: String(base.day_order), exercises: base.exercises.map((e) => ({ name: e.name, sets: String(e.sets), reps: String(e.reps) })) });
  }

  async function save() {
    if (!form.name.trim() || !form.muscle_groups.trim()) return setError("Completa nombre y grupos musculares.");
    setBusy(true);
    const payload = {
      name: form.name.trim(),
      muscle_groups: form.muscle_groups.trim(),
      day_order: Number(form.day_order) || 1,
      exercises: form.exercises.filter((e) => e.name.trim()).map((e) => ({ name: e.name.trim(), sets: Math.max(1, Number(e.sets) || 3), reps: Math.max(1, Number(e.reps) || 10) })),
    };
    const sb = supabaseBrowser();
    const res = edit?.id ? await sb.from("routines").update(payload).eq("id", edit.id) : await sb.from("routines").insert({ ...payload, user_id: await uid() });
    setBusy(false);
    if (res.error) return setError(res.error.message);
    setEdit(null);
    onChange();
  }

  async function remove() {
    if (!edit?.id || !confirm("¿Eliminar esta rutina? Los entrenamientos registrados se conservan.")) return;
    await supabaseBrowser().from("routines").delete().eq("id", edit.id);
    setEdit(null);
    onChange();
  }

  return (
    <div className="space-y-2">
      {routines.map((r) => (
        <button key={r.id} className="card w-full text-left" onClick={() => openEdit(r)}>
          <p className="label text-lime-400">{r.name}</p>
          <p className="h-display text-lg">{r.muscle_groups}</p>
          <p className="text-[11px] text-ink-400">{r.exercises.map((e) => e.name).join(" · ")}</p>
        </button>
      ))}
      <button className="btn-ghost w-full" onClick={() => openEdit(null)}><Plus className="h-4 w-4" /> Nueva rutina</button>
      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? "Editar rutina" : "Nueva rutina"}>
        <div className="space-y-3">
          <div className="grid grid-cols-[1fr_80px] gap-2">
            <Field label="Nombre"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Orden"><input className="input" type="number" value={form.day_order} onChange={(e) => setForm({ ...form, day_order: e.target.value })} /></Field>
          </div>
          <Field label="Grupos musculares"><input className="input" value={form.muscle_groups} onChange={(e) => setForm({ ...form, muscle_groups: e.target.value })} /></Field>
          <p className="label">Ejercicios (series × reps)</p>
          {form.exercises.map((e, i) => (
            <div key={i} className="grid grid-cols-[1fr_52px_52px_24px] gap-1.5">
              <input className="input py-1.5" value={e.name} placeholder="Ejercicio" onChange={(ev) => setForm({ ...form, exercises: form.exercises.map((x, k) => (k === i ? { ...x, name: ev.target.value } : x)) })} />
              <input className="input py-1.5" type="number" value={e.sets} onChange={(ev) => setForm({ ...form, exercises: form.exercises.map((x, k) => (k === i ? { ...x, sets: ev.target.value } : x)) })} aria-label="Series" />
              <input className="input py-1.5" type="number" value={e.reps} onChange={(ev) => setForm({ ...form, exercises: form.exercises.map((x, k) => (k === i ? { ...x, reps: ev.target.value } : x)) })} aria-label="Repeticiones" />
              <button className="text-ink-400" onClick={() => setForm({ ...form, exercises: form.exercises.filter((_, k) => k !== i) })}>×</button>
            </div>
          ))}
          <button className="chip" onClick={() => setForm({ ...form, exercises: [...form.exercises, { name: "", sets: "3", reps: "12" }] })}>+ Ejercicio</button>
          {error && <ErrorBox message={error} />}
          <div className="flex gap-2">
            {edit?.id && <button className="btn-danger" onClick={remove}>Eliminar</button>}
            <button className="btn-primary flex-1" onClick={save} disabled={busy}>{busy ? <Spinner className="text-ink-950" /> : "Guardar"}</button>
          </div>
        </div>
      </Sheet>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <Training />
    </Suspense>
  );
}
