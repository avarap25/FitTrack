import { describe, expect, it } from "vitest";
import foodsSeed from "../src/lib/foods-seed.json";
import { bmrMifflin, calorieFloor, energyBreakdown, goalPlan, macrosFor, suggestGoal, sumMacros, trendAdjustment } from "../src/lib/nutrition";
import { recommend } from "../src/lib/recommendations";
import { bucketAverages, movingAverage, weekStart, weightTrendPerWeek } from "../src/lib/stats";
import { daySummary } from "../src/lib/summary";
import type { FoodItem, NutritionGoal, Profile } from "../src/lib/types";
import { mergeWithDb } from "../src/lib/ai/merge";
import { aiResultSchema } from "../src/lib/ai/schema";

const profile: Profile = {
  id: "u", display_name: "Test", age: 25, sex: "female", height_cm: 157, current_weight_kg: 68, start_weight_kg: 68, target_weight_kg: 60,
  start_date: "2026-11-16", target_date: null, daily_activity_factor: 1.3, training_days_per_week: 4, kcal_per_session: 280, units: "metric", nutrition_objective: "perder_grasa",
};
const goal: NutritionGoal = { id: "g", user_id: "u", effective_from: "2026-11-16", calories: 1750, protein_g: 125, carbs_g: 190, fat_g: 55, origin: "manual", note: null };
const foods = (foodsSeed as Omit<FoodItem, "id" | "user_id">[]).map((f, i) => ({ ...f, id: `f${i}`, user_id: null })) as FoodItem[];

describe("energía", () => {
  it("Mifflin-St Jeor mujer 25a 157cm 68kg = 1375.25", () => {
    expect(bmrMifflin(profile)).toBeCloseTo(1375.25, 2);
  });
  it("hombre suma +5 en lugar de -161", () => {
    expect(bmrMifflin({ ...profile, sex: "male" }) - bmrMifflin(profile)).toBeCloseTo(166, 5);
  });
  it("TDEE separa basal, cotidiana y ejercicio", () => {
    const e = energyBreakdown(profile);
    expect(e.daily_activity).toBeCloseTo(1375.25 * 0.3, 2);
    expect(e.exercise_avg).toBeCloseTo(160, 2);
    expect(e.tdee_avg).toBeCloseTo(e.bmr + e.daily_activity + e.exercise_avg, 5);
  });
  it("la sugerencia nunca baja del piso de seguridad", () => {
    const tiny = { ...profile, current_weight_kg: 45, height_cm: 145, daily_activity_factor: 1.2, training_days_per_week: 0 };
    const s = suggestGoal(tiny);
    expect(s.calories).toBeGreaterThanOrEqual(calorieFloor(tiny) - 10);
  });
  it("déficit moderado (≤500 kcal) para la usuaria inicial", () => {
    const s = suggestGoal(profile);
    expect(s.deficit).toBeGreaterThan(0);
    expect(s.deficit).toBeLessThanOrEqual(500);
    expect(s.protein_g).toBe(122);
  });
});

describe("plazos", () => {
  const today = new Date("2026-11-16T12:00:00");
  const tdee = energyBreakdown(profile).tdee_avg;
  it("8 kg → 16 a 32 semanas a 0.25–0.5 kg/sem", () => {
    const p = goalPlan({ currentKg: 68, targetKg: 60, tdee, floor: calorieFloor(profile), today });
    expect(p.kg_to_change).toBe(8);
    expect(p.weeks_range).toEqual([16, 32]);
  });
  it("8 kg en 6 semanas es agresivo y propone otra fecha", () => {
    const p = goalPlan({ currentKg: 68, targetKg: 60, tdee, floor: calorieFloor(profile), targetDate: "2026-12-28", today });
    expect(p.pace).toBe("agresivo");
    expect(p.recommended_date.getTime()).toBeGreaterThan(new Date("2027-04-01").getTime());
  });
  it("8 kg en 24 semanas es saludable", () => {
    const p = goalPlan({ currentKg: 68, targetKg: 60, tdee: 2200, floor: 1400, targetDate: "2027-05-03", today });
    expect(p.pace).toBe("saludable");
  });
});

describe("macros", () => {
  it("120 g de pollo a la plancha", () => {
    const pollo = foods.find((f) => f.name.startsWith("Pechuga de pollo a la plancha"))!;
    expect(macrosFor(pollo, 120)).toEqual({ kcal: 198, protein_g: 37.2, carbs_g: 0, fat_g: 4.3 });
  });
  it("suma de items", () => {
    expect(sumMacros([{ kcal: 100, protein_g: 10, carbs_g: 5, fat_g: 1 }, { kcal: 50.5, protein_g: 1, carbs_g: 10, fat_g: 0.5 }])).toEqual({ kcal: 150.5, protein_g: 11, carbs_g: 15, fat_g: 1.5 });
  });
  it("todos los alimentos semilla tienen macros coherentes con sus kcal (±25%)", () => {
    for (const f of foods) {
      const calc = f.protein_100g * 4 + f.carbs_100g * 4 + f.fat_100g * 9;
      if (f.kcal_100g < 30) continue; // frutas ácidas/verduras: USDA usa factores Atwater específicos
      expect(Math.abs(calc - f.kcal_100g) / f.kcal_100g, f.name).toBeLessThan(0.25); // la fibra cuenta en carbohidratos pero aporta menos energía
    }
  });
  it("incluye los alimentos peruanos pedidos con fuente", () => {
    for (const n of ["Lomo saltado", "Ají de gallina", "Ceviche", "Arroz con pollo", "Papa a la huancaína", "Camote", "Palta"]) {
      const f = foods.find((x) => x.name.startsWith(n));
      expect(f, n).toBeTruthy();
      expect(f!.source.length).toBeGreaterThan(5);
    }
  });
});

describe("tendencias de peso", () => {
  it("semana empieza lunes", () => {
    expect(weekStart("2026-11-19")).toBe("2026-11-16");
    expect(weekStart("2026-11-16")).toBe("2026-11-16");
  });
  it("regresión sobre todos los pesajes (~-0.4 kg/sem pese a ruido)", () => {
    const logs = Array.from({ length: 28 }, (_, i) => {
      const d = new Date("2026-11-01T12:00:00");
      d.setDate(d.getDate() + i);
      const noise = [0.6, -0.4, 0.2, -0.5, 0.3, 0, -0.2][i % 7];
      return { logged_on: d.toISOString().slice(0, 10), weight_kg: 68 - (0.4 / 7) * i + noise };
    });
    const t = weightTrendPerWeek(logs)!;
    expect(t).toBeGreaterThan(-0.55);
    expect(t).toBeLessThan(-0.25);
  });
  it("no da tendencia con pocos datos", () => {
    expect(weightTrendPerWeek([{ logged_on: "2026-11-01", weight_kg: 68 }, { logged_on: "2026-11-03", weight_kg: 67 }])).toBeNull();
  });
  it("promedios semanales y media móvil", () => {
    const logs = [{ logged_on: "2026-11-16", weight_kg: 68 }, { logged_on: "2026-11-18", weight_kg: 67 }, { logged_on: "2026-11-24", weight_kg: 66 }];
    expect(bucketAverages(logs, (l) => l.logged_on, (l) => l.weight_kg)).toEqual([{ key: "2026-11-16", avg: 67.5, count: 2 }, { key: "2026-11-23", avg: 66, count: 1 }]);
    expect(movingAverage(logs)[1].avg).toBe(67.5);
  });
  it("ajuste por tendencia: cambios máx. ±100 kcal y nunca bajo el piso", () => {
    const a = trendAdjustment({ avgIntake: 1750, weeklyChangeKg: 0, weeksOfData: 4, currentGoal: 1750, floor: 1375 })!;
    expect(a.change).toBe(-100);
    const b = trendAdjustment({ avgIntake: 1400, weeklyChangeKg: 0, weeksOfData: 4, currentGoal: 1400, floor: 1375 })!;
    expect(b.suggestedGoal).toBeGreaterThanOrEqual(1370);
    const c = trendAdjustment({ avgIntake: 1600, weeklyChangeKg: -1.2, weeksOfData: 4, currentGoal: 1600, floor: 1375 })!;
    expect(c.change).toBe(100);
    expect(trendAdjustment({ avgIntake: 1700, weeklyChangeKg: -0.4, weeksOfData: 2, currentGoal: 1700, floor: 1375 })).toBeNull();
    // ya come menos que el objetivo y baja lento → no sugerir recortar
    const d = trendAdjustment({ avgIntake: 1212, weeklyChangeKg: -0.35, weeksOfData: 4, currentGoal: 1750, floor: 1375 })!;
    expect(d.change).toBe(0);
    expect(d.message).toMatch(/registr/);
  });
});

describe("recomendaciones", () => {
  const prefs = { user_id: "u", dietary_preferences: [], allergies: [], disliked_foods: [], notes: null };
  it("400 kcal y 35 g de proteína → sugerencias que no se pasan y aportan proteína", () => {
    const r = recommend({ remaining: { kcal: 400, protein_g: 35, carbs_g: 50, fat_g: 12 }, foods, prefs, eatenToday: [], hour: 17 });
    expect(r.items.length).toBeGreaterThan(0);
    for (const it of r.items) {
      expect(it.totals.kcal).toBeLessThanOrEqual(460);
      expect(it.totals.protein_g).toBeGreaterThan(15);
    }
  });
  it("respeta alergias (lácteos, pescado)", () => {
    const r = recommend({ remaining: { kcal: 500, protein_g: 40, carbs_g: 60, fat_g: 15 }, foods, prefs: { ...prefs, allergies: ["lacteos", "pescado"] }, eatenToday: [], hour: 13, limit: 20 });
    for (const it of r.items) for (const p of it.parts) {
      expect(p.food.allergens).not.toContain("lacteos");
      expect(p.food.allergens).not.toContain("pescado");
    }
  });
  it("no empuja a comer cuando casi no quedan calorías", () => {
    const r = recommend({ remaining: { kcal: 80, protein_g: 20, carbs_g: 0, fat_g: 0 }, foods, prefs, eatenToday: [] });
    expect(r.items).toHaveLength(0);
    expect(r.message).toMatch(/no es necesario/i);
  });
});

describe("resumen diario", () => {
  it("avisa si comió muy poco y no lo celebra", () => {
    const s = daySummary({ kcal: 900, protein_g: 60, carbs_g: 90, fat_g: 25 }, goal, 1900, 3, 1375);
    expect(s.points.some((p) => /bastante menos/.test(p.text))).toBe(true);
  });
  it("distingue déficit real de calorías restantes", () => {
    const s = daySummary({ kcal: 1700, protein_g: 125, carbs_g: 180, fat_g: 55 }, goal, 1950, 5, 1375);
    expect(s.points.some((p) => /Déficit estimado: ~250/.test(p.text))).toBe(true);
    expect(s.headline).toBe("Día bien encaminado");
  });
});

describe("IA: validación y fusión", () => {
  it("rechaza respuestas mal formadas", () => {
    expect(aiResultSchema.safeParse({ is_food: true, items: [{ name: "x", grams: -5 }] }).success).toBe(false);
  });
  it("usa valores de la base cuando la IA elige un food_id", () => {
    const pollo = foods.find((f) => f.name.startsWith("Pechuga de pollo a la plancha"))!;
    const merged = mergeWithDb(
      [
        { name: "Pollo", preparation: "plancha", grams: 120, confidence: "media", food_id: pollo.id, kcal_100g: 999, protein_100g: 1, carbs_100g: 1, fat_100g: 1, uncertainty: "" },
        { name: "Salsa rara", preparation: "", grams: 20, confidence: "baja", food_id: "no-existe", kcal_100g: 300, protein_100g: 1, carbs_100g: 10, fat_100g: 28, uncertainty: "" },
      ],
      foods,
    );
    expect(merged[0].kcal_100g).toBe(165);
    expect(merged[0].nutrition_source).toBe("base");
    expect(merged[1].food_id).toBeNull();
    expect(merged[1].nutrition_source).toBe("ia");
  });
});
