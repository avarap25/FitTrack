import { round } from "./nutrition";
import type { Workout } from "./types";

/**
 * Gasto calórico por actividad con METs del Compendium of Physical Activities
 * (Ainsworth et al., 2011; actualización 2024). Se calcula el gasto NETO:
 * (MET − 1) × kg × horas, para no contar dos veces el metabolismo basal,
 * que ya está incluido en el gasto diario.
 */
export type Intensity = "ligera" | "moderada" | "intensa";
export type WorkoutKind = "fuerza" | "cardio";

export interface Activity {
  key: string;
  label: string;
  emoji: string;
  kind: WorkoutKind;
  met: Record<Intensity, number>;
  hint: Record<Intensity, string>;
}

export const ACTIVITIES: Activity[] = [
  { key: "pesas", label: "Pesas / gimnasio", emoji: "🏋️", kind: "fuerza", met: { ligera: 3.5, moderada: 5.0, intensa: 6.0 }, hint: { ligera: "descansos largos, cargas cómodas", moderada: "8–15 reps, esfuerzo sostenido", intensa: "cargas altas, poco descanso" } },
  { key: "caminata", label: "Caminata", emoji: "🚶", kind: "cardio", met: { ligera: 3.0, moderada: 3.8, intensa: 5.0 }, hint: { ligera: "≈ 4 km/h", moderada: "≈ 5.5 km/h", intensa: "≈ 6.5 km/h o en subida" } },
  { key: "trote", label: "Trote / carrera", emoji: "🏃", kind: "cardio", met: { ligera: 6.0, moderada: 8.3, intensa: 9.8 }, hint: { ligera: "trote suave", moderada: "≈ 8 km/h", intensa: "≈ 10 km/h" } },
  { key: "bici", label: "Bicicleta estática", emoji: "🚴", kind: "cardio", met: { ligera: 3.5, moderada: 6.8, intensa: 8.8 }, hint: { ligera: "pedaleo suave", moderada: "esfuerzo moderado", intensa: "esfuerzo fuerte" } },
  { key: "eliptica", label: "Elíptica", emoji: "⛷️", kind: "cardio", met: { ligera: 4.0, moderada: 5.0, intensa: 6.5 }, hint: { ligera: "ritmo suave", moderada: "ritmo moderado", intensa: "ritmo fuerte" } },
  { key: "escaladora", label: "Escaladora / stairmaster", emoji: "🪜", kind: "cardio", met: { ligera: 6.0, moderada: 8.0, intensa: 9.0 }, hint: { ligera: "nivel bajo", moderada: "nivel medio", intensa: "nivel alto" } },
  { key: "spinning", label: "Spinning / clase de ciclismo", emoji: "🚲", kind: "cardio", met: { ligera: 6.8, moderada: 8.5, intensa: 10.0 }, hint: { ligera: "clase suave", moderada: "clase normal", intensa: "clase exigente" } },
  { key: "baile", label: "Baile / zumba", emoji: "💃", kind: "cardio", met: { ligera: 4.5, moderada: 5.5, intensa: 7.3 }, hint: { ligera: "ritmo suave", moderada: "clase normal", intensa: "alto impacto" } },
  { key: "hiit", label: "HIIT / funcional", emoji: "⚡", kind: "cardio", met: { ligera: 5.0, moderada: 8.0, intensa: 9.0 }, hint: { ligera: "circuito suave", moderada: "circuito con poco descanso", intensa: "intervalos máximos" } },
  { key: "natacion", label: "Natación", emoji: "🏊", kind: "cardio", met: { ligera: 6.0, moderada: 8.3, intensa: 9.8 }, hint: { ligera: "ritmo suave", moderada: "crol moderado", intensa: "crol rápido" } },
  { key: "yoga", label: "Yoga / pilates", emoji: "🧘", kind: "cardio", met: { ligera: 2.5, moderada: 3.0, intensa: 4.0 }, hint: { ligera: "estiramiento", moderada: "flujo (vinyasa)", intensa: "power yoga / pilates intenso" } },
];

export const activityByKey = (k: string | null | undefined) => ACTIVITIES.find((a) => a.key === k) ?? ACTIVITIES[0];

export function netKcal(met: number, weightKg: number, minutes: number): number {
  if (!(minutes > 0) || !(weightKg > 0)) return 0;
  return round(Math.max(0, met - 1) * weightKg * (minutes / 60));
}

export function estimateBurn(opts: { activity: string; intensity: Intensity; minutes: number; weightKg: number }) {
  const a = activityByKey(opts.activity);
  return netKcal(a.met[opts.intensity], opts.weightKg, opts.minutes);
}

/** Si no se registraron minutos en pesas, se estiman ~2.5 min por serie (incluye descanso). */
export function estimateStrengthMinutes(totalSets: number) {
  return Math.round(totalSets * 2.5);
}

/** kcal de un entrenamiento guardado; si es antiguo y no tiene cálculo, usa el valor por sesión del perfil. */
export function workoutKcal(w: Pick<Workout, "kcal_burned">, fallback: number) {
  return w.kcal_burned !== null && w.kcal_burned !== undefined ? Number(w.kcal_burned) : fallback;
}
