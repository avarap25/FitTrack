import type { FoodItem, Macros, Profile } from "./types";

/** Energía aproximada de 1 kg de tejido corporal perdido (mezcla de grasa y otros). Valor de referencia, no exacto. */
export const KCAL_PER_KG = 7700;

export const ACTIVITY_LEVELS = [
  { value: 1.2, label: "Sedentaria", hint: "Trabajo sentada, casi sin caminar" },
  { value: 1.3, label: "Ligera", hint: "Algunas caminatas, periodos sedentarios" },
  { value: 1.45, label: "Moderada", hint: "De pie o caminando buena parte del día" },
  { value: 1.6, label: "Alta", hint: "Trabajo físico o muchos pasos diarios" },
];

export const round = (n: number, d = 0) => {
  const f = 10 ** d;
  return Math.round(n * f) / f;
};

/** Mifflin-St Jeor (1990). Devuelve kcal/día en reposo. */
export function bmrMifflin(p: Pick<Profile, "sex" | "current_weight_kg" | "height_cm" | "age">): number {
  const base = 10 * p.current_weight_kg + 6.25 * p.height_cm - 5 * p.age;
  return base + (p.sex === "male" ? 5 : -161);
}

export interface EnergyBreakdown {
  bmr: number;
  /** gasto por actividad cotidiana (no ejercicio) */
  daily_activity: number;
  /** gasto promedio diario por entrenamiento */
  exercise_avg: number;
  /** TDEE promedio = bmr + cotidiana + ejercicio promedio */
  tdee_avg: number;
}

export function energyBreakdown(p: Profile): EnergyBreakdown {
  const bmr = bmrMifflin(p);
  const daily_activity = bmr * (p.daily_activity_factor - 1);
  const exercise_avg = (p.training_days_per_week * p.kcal_per_session) / 7;
  return { bmr, daily_activity, exercise_avg, tdee_avg: bmr + daily_activity + exercise_avg };
}

/** TDEE de un día concreto: suma el gasto de entrenamiento solo si ese día se registró una sesión. */
export function tdeeForDay(p: Profile, trainedToday: boolean): number {
  const e = energyBreakdown(p);
  return e.bmr + e.daily_activity + (trainedToday ? p.kcal_per_session : 0);
}

/** Piso de seguridad: nunca sugerir objetivos por debajo del metabolismo basal ni de 1200/1500 kcal. */
export function calorieFloor(p: Profile): number {
  return Math.max(bmrMifflin(p), p.sex === "male" ? 1500 : 1200);
}

export interface SuggestedGoal {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  deficit: number;
  notes: string[];
}

/**
 * Propone un objetivo con déficit moderado (~15-20 % del TDEE, máx. 500 kcal),
 * proteína 1.6–2.0 g/kg y grasa ≥ 0.7 g/kg. Nunca baja del piso de seguridad.
 */
export function suggestGoal(p: Profile): SuggestedGoal {
  const { tdee_avg } = energyBreakdown(p);
  const notes: string[] = [];
  let deficit = 0;
  if (p.nutrition_objective === "perder_grasa") deficit = Math.min(500, tdee_avg * 0.18);
  if (p.nutrition_objective === "ganar_musculo") deficit = -Math.min(300, tdee_avg * 0.1);
  let calories = tdee_avg - deficit;
  const floor = calorieFloor(p);
  if (calories < floor) {
    notes.push(`Se ajustó al mínimo recomendado (${round(floor)} kcal). Un déficit mayor no es aconsejable.`);
    calories = floor;
    deficit = tdee_avg - calories;
  }
  calories = Math.round(calories / 10) * 10;
  // 1.8 g/kg: punto medio del rango 1.6–2.0 g/kg usado para conservar músculo en déficit
  const protein_g = Math.round(1.8 * p.current_weight_kg);
  const fat_g = Math.round(Math.max(0.7 * p.current_weight_kg, (calories * 0.27) / 9));
  const carbs_g = Math.max(0, Math.round((calories - protein_g * 4 - fat_g * 9) / 4));
  notes.push("Estimación basada en Mifflin-St Jeor y tus factores de actividad. Ajústala según tu evolución real.");
  return { calories, protein_g, carbs_g, fat_g, deficit: round(deficit), notes };
}

export function macrosFor(food: Pick<FoodItem, "kcal_100g" | "protein_100g" | "carbs_100g" | "fat_100g">, grams: number): Macros {
  const f = grams / 100;
  return {
    kcal: round(food.kcal_100g * f, 1),
    protein_g: round(food.protein_100g * f, 1),
    carbs_g: round(food.carbs_100g * f, 1),
    fat_g: round(food.fat_100g * f, 1),
  };
}

export function sumMacros(items: Macros[]): Macros {
  return items.reduce<Macros>(
    (a, b) => ({
      kcal: round(a.kcal + Number(b.kcal), 1),
      protein_g: round(a.protein_g + Number(b.protein_g), 1),
      carbs_g: round(a.carbs_g + Number(b.carbs_g), 1),
      fat_g: round(a.fat_g + Number(b.fat_g), 1),
    }),
    { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  );
}

// ---------------- Objetivo de peso y plazos ----------------

export type PaceLevel = "saludable" | "exigente" | "agresivo" | "sin_fecha" | "alcanzado";

export interface GoalPlan {
  kg_to_change: number;
  weeks_available: number | null;
  required_kg_per_week: number | null;
  required_daily_deficit: number | null;
  pace: PaceLevel;
  /** rango de semanas a ritmo de 0.25–0.5 kg/sem */
  weeks_range: [number, number];
  date_range: [Date, Date];
  recommended_date: Date;
  messages: string[];
}

const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);

export function goalPlan(opts: {
  currentKg: number;
  targetKg: number;
  tdee: number;
  floor: number;
  targetDate?: string | null;
  today?: Date;
}): GoalPlan {
  const today = opts.today ?? new Date();
  const kg = round(opts.currentKg - opts.targetKg, 2);
  const messages: string[] = [];
  const lose = Math.max(0, kg);
  const weeks_range: [number, number] = [Math.ceil(lose / 0.5), Math.ceil(lose / 0.25)];
  const date_range: [Date, Date] = [addDays(today, weeks_range[0] * 7), addDays(today, weeks_range[1] * 7)];
  // ritmo recomendado: 0.4 kg/sem, o 0.7 % del peso si es menor
  const recRate = Math.min(0.4, opts.currentKg * 0.007);
  const recommended_date = addDays(today, Math.ceil(lose / recRate) * 7);

  if (kg <= 0) {
    return { kg_to_change: kg, weeks_available: null, required_kg_per_week: null, required_daily_deficit: null, pace: "alcanzado", weeks_range: [0, 0], date_range: [today, today], recommended_date: today, messages: ["Ya estás en tu peso objetivo o por debajo. Considera un objetivo de mantenimiento."] };
  }

  let weeks_available: number | null = null;
  let required: number | null = null;
  let deficit: number | null = null;
  let pace: PaceLevel = "sin_fecha";
  if (opts.targetDate) {
    const t = new Date(opts.targetDate + "T12:00:00");
    weeks_available = Math.max(0, round((t.getTime() - today.getTime()) / (7 * 86400000), 1));
    if (weeks_available <= 0) {
      pace = "agresivo";
      messages.push("La fecha elegida ya pasó o es hoy. Elige una nueva fecha.");
    } else {
      required = round(lose / weeks_available, 2);
      deficit = round((required * KCAL_PER_KG) / 7);
      const pct = required / opts.currentKg;
      if (required <= 0.5 && pct <= 0.0075) pace = "saludable";
      else if (required <= 0.75 && pct <= 0.01) pace = "exigente";
      else pace = "agresivo";
      const impliedIntake = opts.tdee - deficit;
      if (impliedIntake < opts.floor) {
        pace = "agresivo";
        messages.push(`Para llegar en esa fecha tendrías que comer ~${round(impliedIntake)} kcal/día, por debajo del mínimo recomendado (${round(opts.floor)} kcal).`);
      }
    }
  }
  if (pace === "saludable") messages.push("El ritmo necesario es gradual y sostenible.");
  if (pace === "exigente") messages.push("El ritmo es exigente. Es posible, pero puede costar mantener la energía y el rendimiento en el gimnasio.");
  if (pace === "agresivo") messages.push(`El plazo es demasiado corto para perder grasa conservando músculo. Una fecha más saludable sería alrededor del ${recommended_date.toLocaleDateString("es-PE", { day: "numeric", month: "long", year: "numeric" })}.`);
  messages.push("Las fechas son estimaciones: el peso fluctúa por agua, ciclo menstrual, sal y digestión. No hay garantía de resultados.");
  return { kg_to_change: kg, weeks_available, required_kg_per_week: required, required_daily_deficit: deficit, pace, weeks_range, date_range, recommended_date, messages };
}

/**
 * Ajuste por tendencia: con ≥ 3 semanas de datos estima el gasto real
 * (ingesta promedio + energía equivalente al cambio de peso) y sugiere un
 * cambio pequeño (máx. ±100 kcal) hacia un ritmo de ~0.4 kg/sem.
 */
export function trendAdjustment(opts: {
  avgIntake: number;
  weeklyChangeKg: number; // negativo = pérdida
  weeksOfData: number;
  currentGoal: number;
  floor: number;
  targetRate?: number;
}): { observedTdee: number; suggestedGoal: number; change: number; message: string } | null {
  if (opts.weeksOfData < 3 || opts.avgIntake <= 0) return null;
  const observedTdee = opts.avgIntake - (opts.weeklyChangeKg * KCAL_PER_KG) / 7;
  const targetRate = opts.targetRate ?? 0.4;
  const ideal = observedTdee - (targetRate * KCAL_PER_KG) / 7;
  let change = Math.max(-100, Math.min(100, ideal - opts.currentGoal));
  change = Math.round(change / 10) * 10;
  let suggestedGoal = opts.currentGoal + change;
  if (suggestedGoal < opts.floor) {
    suggestedGoal = Math.round(opts.floor / 10) * 10;
    change = suggestedGoal - opts.currentGoal;
  }
  // Si ya come bastante menos que su objetivo, nunca pedir que baje más: lo más probable es un registro incompleto.
  if (change < 0 && opts.avgIntake < opts.currentGoal - 150) {
    return {
      observedTdee: round(observedTdee),
      suggestedGoal: opts.currentGoal,
      change: 0,
      message: `Tu ingesta registrada (~${Math.round(opts.avgIntake)} kcal/día) ya está por debajo de tu objetivo. Antes de bajar calorías, revisa que estés registrando todo (aceites, bebidas, snacks); si el registro está completo, mantén el objetivo y da más tiempo.`,
    };
  }
  let message: string;
  if (Math.abs(change) < 30) message = "Tu ritmo actual está en línea con el objetivo. No hace falta cambiar las calorías.";
  else if (change < 0) message = `Estás bajando más lento de lo previsto. Podrías reducir unas ${Math.abs(change)} kcal (un cambio pequeño), o revisar si el registro está completo (aceites, bebidas, salsas).`;
  else message = `Estás bajando más rápido de lo recomendado. Sube unas ${change} kcal para proteger tu masa muscular y tu energía.`;
  return { observedTdee: round(observedTdee), suggestedGoal, change, message };
}
