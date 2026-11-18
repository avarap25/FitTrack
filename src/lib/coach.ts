import { addDaysIso, isoDate, weekStart } from "./stats";
import type { Routine, Workout } from "./types";

export interface Tip {
  tone: "ok" | "info" | "warn";
  title: string;
  text: string;
  exercise?: string;
}

interface Session {
  date: string;
  sets: { reps: number; weight_kg: number }[];
}

/** Historial de un ejercicio, de la sesión más antigua a la más reciente. */
export function sessionsFor(workouts: Workout[], name: string): Session[] {
  const key = name.trim().toLowerCase();
  return workouts
    .flatMap((w) => w.workout_exercises.filter((e) => e.name.trim().toLowerCase() === key).map((e) => ({ date: w.date, sets: e.exercise_sets })))
    .filter((s) => s.sets.length > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

const topWeight = (s: Session) => Math.max(...s.sets.map((x) => Number(x.weight_kg)));
const repsAt = (s: Session, w: number) => s.sets.filter((x) => Number(x.weight_kg) === w).map((x) => x.reps);

/**
 * Sobrecarga progresiva (doble progresión): primero completar todas las
 * repeticiones objetivo en todas las series; luego subir el peso.
 */
export function progressionTip(name: string, sessions: Session[], targetReps: number | null): Tip | null {
  const last = sessions.at(-1);
  if (!last) return null;
  const w = topWeight(last);
  const reps = repsAt(last, w);
  const target = targetReps ?? 12;
  const small = /lateral|curl|tr[ií]ceps|patada|elevaci|face|aperturas|gemelo|pantorrilla/i.test(name);
  const step = small ? "1–2 kg" : "2.5 kg";

  if (w === 0) {
    return { tone: "info", exercise: name, title: name, text: `Con peso corporal: cuando hagas ${target}+ repeticiones limpias en todas las series, agrega una serie, haz la bajada más lenta (3 s) o suma una carga ligera.` };
  }
  if (reps.length && reps.every((r) => r >= target)) {
    return { tone: "ok", exercise: name, title: name, text: `Completaste ${reps.length}×${target}+ con ${w} kg. La próxima vez prueba ${step} más, aunque bajes un poco las repeticiones.` };
  }
  const prev = sessions.at(-2);
  if (prev && topWeight(prev) === w) {
    const prevReps = repsAt(prev, w).reduce((a, b) => a + b, 0);
    const nowReps = reps.reduce((a, b) => a + b, 0);
    if (prevReps > 0 && nowReps < prevReps * 0.85) {
      return { tone: "warn", exercise: name, title: name, text: `Hiciste menos repeticiones que la vez anterior con ${w} kg. Mantén el peso, descansa 2–3 min entre series y revisa sueño y proteína. En déficit es normal tener días así.` };
    }
    const same = sessions.slice(-3).every((s) => topWeight(s) === w);
    if (same && sessions.length >= 3 && nowReps <= prevReps) {
      return { tone: "info", exercise: name, title: name, text: `Llevas 3 sesiones con ${w} kg sin sumar repeticiones. Intenta +1 repetición por serie la próxima vez antes de subir peso.` };
    }
    if (nowReps > prevReps) {
      return { tone: "ok", exercise: name, title: name, text: `Subiste de ${prevReps} a ${nowReps} repeticiones totales con ${w} kg. Sigue sumando hasta llegar a ${target} en cada serie.` };
    }
  }
  return { tone: "info", exercise: name, title: name, text: `Con ${w} kg busca llegar a ${target} repeticiones en todas las series; cuando lo logres, sube ${step}.` };
}

export interface CoachInput {
  workouts: Workout[];
  routines: Routine[];
  trainingDaysGoal: number;
  goal: "perder_grasa" | "mantener" | "ganar_musculo";
  avgProtein?: number | null;
  proteinGoal?: number;
  today?: string;
}

/** Consejos generales según la frecuencia, el balance entre grupos y el cardio. */
export function generalTips(i: CoachInput): Tip[] {
  const today = i.today ?? isoDate();
  const tips: Tip[] = [];
  const thisWeek = i.workouts.filter((w) => w.date >= weekStart(today));
  const strength = thisWeek.filter((w) => w.kind !== "cardio").length;
  const last = i.workouts[0];

  if (!i.workouts.length) {
    return [{ tone: "info", title: "Empecemos", text: "Registra tu primer entrenamiento y empiezo a darte consejos según tus cargas, repeticiones y frecuencia." }];
  }

  const dow = ((new Date(today + "T12:00:00").getDay() + 6) % 7) + 1; // 1 = lunes
  const expected = Math.round((i.trainingDaysGoal * dow) / 7);
  if (strength >= i.trainingDaysGoal) tips.push({ tone: "ok", title: "Semana cumplida", text: `Ya hiciste ${strength} de ${i.trainingDaysGoal} sesiones de fuerza esta semana. El descanso también construye músculo.` });
  else if (strength < expected - 1) tips.push({ tone: "warn", title: "Vas un poco atrás", text: `Llevas ${strength} de ${i.trainingDaysGoal} sesiones esta semana. Si no llegas a todas, prioriza las de piernas y glúteos, que mueven más masa muscular.` });
  else tips.push({ tone: "info", title: "Buen ritmo", text: `Llevas ${strength} de ${i.trainingDaysGoal} sesiones de fuerza esta semana.` });

  if (last) {
    const days = Math.round((new Date(today + "T12:00:00").getTime() - new Date(last.date + "T12:00:00").getTime()) / 86400000);
    if (days >= 4) tips.push({ tone: "warn", title: `${days} días sin entrenar`, text: "Una sesión corta de 30–40 minutos hoy cuenta mucho más que esperar el día perfecto." });
  }

  // Grupos musculares olvidados (según las rutinas)
  const since = addDaysIso(today, -10);
  const recent = i.workouts.filter((w) => w.date >= since);
  const missing = i.routines.filter((r) => !recent.some((w) => w.routine_id === r.id || w.muscle_group.toLowerCase() === r.muscle_groups.toLowerCase()));
  if (missing.length && missing.length < i.routines.length) {
    tips.push({ tone: "info", title: "Te falta entrenar", text: `En los últimos 10 días no registraste: ${missing.map((m) => m.muscle_groups.toLowerCase()).join(", ")}. Inclúyelo para mantener el equilibrio.` });
  }

  // Cardio y pasos (útil para perder grasa sin recortar más comida)
  const cardioMin = thisWeek.filter((w) => w.kind === "cardio").reduce((a, w) => a + (w.duration_min ?? 0), 0);
  if (i.goal === "perder_grasa" && cardioMin < 90) {
    tips.push({ tone: "info", title: "Suma movimiento suave", text: `Llevas ${cardioMin} min de cardio esta semana. 2–3 caminatas de 30 min ayudan al déficit sin quitarte energía para las pesas.` });
  }

  if (i.avgProtein && i.proteinGoal && i.avgProtein < i.proteinGoal * 0.85) {
    tips.push({ tone: "warn", title: "Proteína baja", text: `Tu promedio es ${Math.round(i.avgProtein)} g/día (objetivo ${i.proteinGoal} g). Para conservar músculo mientras bajas grasa, la proteína importa tanto como el entrenamiento.` });
  }
  return tips;
}

export function exerciseTips(workouts: Workout[], routines: Routine[], max = 4): Tip[] {
  const target = new Map<string, number>();
  routines.forEach((r) => r.exercises.forEach((e) => target.set(e.name.trim().toLowerCase(), e.reps)));
  // ejercicios de la última sesión de fuerza primero
  const lastStrength = workouts.find((w) => w.kind !== "cardio");
  const names = [...new Set([...(lastStrength?.workout_exercises.map((e) => e.name.trim()) ?? []), ...workouts.flatMap((w) => w.workout_exercises.map((e) => e.name.trim()))])];
  const out: Tip[] = [];
  for (const n of names) {
    const t = progressionTip(n, sessionsFor(workouts, n), target.get(n.toLowerCase()) ?? null);
    if (t) out.push(t);
    if (out.length >= max) break;
  }
  return out;
}
