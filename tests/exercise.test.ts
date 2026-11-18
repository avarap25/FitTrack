import { describe, expect, it } from "vitest";
import { estimateBurn, estimateStrengthMinutes, netKcal } from "../src/lib/exercise";
import { generalTips, progressionTip } from "../src/lib/coach";
import { tdeeForDay } from "../src/lib/nutrition";
import type { Profile, Workout } from "../src/lib/types";

describe("calorías quemadas (METs netos)", () => {
  it("caminata moderada 30 min a 68 kg ≈ 95 kcal", () => {
    // (3.8 − 1) × 68 × 0.5 = 95.2
    expect(estimateBurn({ activity: "caminata", intensity: "moderada", minutes: 30, weightKg: 68 })).toBe(95);
  });
  it("pesas moderadas 60 min a 68 kg = 272 kcal", () => {
    expect(estimateBurn({ activity: "pesas", intensity: "moderada", minutes: 60, weightKg: 68 })).toBe(272);
  });
  it("más intensidad, más gasto; 0 minutos = 0", () => {
    const l = estimateBurn({ activity: "trote", intensity: "ligera", minutes: 30, weightKg: 68 });
    const i = estimateBurn({ activity: "trote", intensity: "intensa", minutes: 30, weightKg: 68 });
    expect(i).toBeGreaterThan(l);
    expect(netKcal(5, 68, 0)).toBe(0);
  });
  it("minutos estimados por serie", () => {
    expect(estimateStrengthMinutes(16)).toBe(40);
  });
  it("el gasto del día suma lo quemado entrenando", () => {
    const p = { age: 25, sex: "female", height_cm: 157, current_weight_kg: 68, daily_activity_factor: 1.3, training_days_per_week: 4, kcal_per_session: 280 } as Profile;
    expect(tdeeForDay(p, 300) - tdeeForDay(p, 0)).toBeCloseTo(300, 5);
  });
});

const sess = (date: string, weight: number, reps: number[]) => ({ date, sets: reps.map((r) => ({ reps: r, weight_kg: weight })) });

describe("consejos de progresión", () => {
  it("sugiere subir peso cuando completa todas las repeticiones", () => {
    const t = progressionTip("Hip thrust", [sess("2026-11-10", 40, [12, 12, 12, 12])], 12)!;
    expect(t.tone).toBe("ok");
    expect(t.text).toMatch(/2.5 kg/);
  });
  it("en ejercicios pequeños sugiere 1–2 kg", () => {
    expect(progressionTip("Elevaciones laterales", [sess("2026-11-10", 5, [15, 15, 15])], 15)!.text).toMatch(/1–2 kg/);
  });
  it("si bajan mucho las repeticiones, mantener peso", () => {
    const t = progressionTip("Sentadilla", [sess("2026-11-03", 30, [10, 10, 10, 10]), sess("2026-11-10", 30, [8, 7, 6, 6])], 10)!;
    expect(t.tone).toBe("warn");
    expect(t.text).toMatch(/Mantén el peso/);
  });
  it("estancado 3 sesiones → sumar repeticiones", () => {
    const t = progressionTip("Press militar con mancuernas", [sess("2026-10-27", 10, [8, 8, 8]), sess("2026-11-03", 10, [8, 8, 8]), sess("2026-11-10", 10, [8, 8, 8])], 10)!;
    expect(t.text).toMatch(/\+1 repetición/);
  });
});

describe("consejos generales", () => {
  const w = (date: string, kind: "fuerza" | "cardio", mg: string, min = 0) => ({ id: date + mg, date, routine_id: null, muscle_group: mg, notes: null, duration_min: min, kind, activity: kind === "cardio" ? "caminata" : "pesas", intensity: "moderada", kcal_burned: 200, workout_exercises: [] }) as Workout;
  const routines = [
    { id: "r1", name: "Día 1", muscle_groups: "Glúteos y femorales", day_order: 1, exercises: [] },
    { id: "r2", name: "Día 2", muscle_groups: "Espalda y bíceps", day_order: 2, exercises: [] },
  ];
  it("detecta días sin entrenar, grupos olvidados y poco cardio", () => {
    const tips = generalTips({ workouts: [w("2026-11-12", "fuerza", "Glúteos y femorales")], routines, trainingDaysGoal: 4, goal: "perder_grasa", today: "2026-11-18" });
    const all = tips.map((t) => t.title + " " + t.text).join(" | ");
    expect(all).toMatch(/6 días sin entrenar/);
    expect(all).toMatch(/espalda y bíceps/);
    expect(all).toMatch(/caminatas/);
  });
  it("semana cumplida", () => {
    const ws = ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19"].map((d) => w(d, "fuerza", "Glúteos y femorales"));
    expect(generalTips({ workouts: ws.reverse(), routines, trainingDaysGoal: 4, goal: "perder_grasa", today: "2026-11-19" })[0].title).toBe("Semana cumplida");
  });
});
