import { macrosFor, round, sumMacros } from "./nutrition";
import type { FoodItem, Macros, Preferences } from "./types";

/**
 * Motor de recomendaciones determinista. Cada combinación usa alimentos de la
 * base nutricional (por nombre exacto); los macros se calculan con esos datos,
 * no se inventan. Las porciones se escalan entre 60 % y 140 % para acercarse
 * a lo que falta, sin obligar a "completar" las calorías.
 */
interface ComboTemplate {
  title: string;
  moment: ("desayuno" | "snack" | "comida")[];
  parts: { food: string; grams: number }[];
  why: string;
}

export const COMBOS: ComboTemplate[] = [
  { title: "Yogur griego con plátano y avena", moment: ["desayuno", "snack"], parts: [{ food: "Yogur griego natural sin grasa", grams: 200 }, { food: "Plátano de seda", grams: 100 }, { food: "Avena en hojuelas (seca)", grams: 25 }], why: "Mucha proteína con carbohidratos de buena calidad." },
  { title: "Yogur griego con fresas", moment: ["snack"], parts: [{ food: "Yogur griego natural sin grasa", grams: 200 }, { food: "Fresas", grams: 150 }], why: "Snack ligero y alto en proteína." },
  { title: "Sándwich de atún con ensalada", moment: ["snack", "comida"], parts: [{ food: "Pan integral", grams: 60 }, { food: "Atún en agua (escurrido)", grams: 100 }, { food: "Tomate", grams: 60 }, { food: "Lechuga", grams: 30 }], why: "Proteína magra con fibra del pan integral." },
  { title: "Huevos con pan integral y palta", moment: ["desayuno", "snack"], parts: [{ food: "Huevo entero crudo", grams: 100 }, { food: "Pan integral", grams: 60 }, { food: "Palta", grams: 30 }], why: "Proteína completa y grasas saludables." },
  { title: "Claras y huevo revueltos con tomate", moment: ["desayuno", "snack"], parts: [{ food: "Huevo entero crudo", grams: 50 }, { food: "Clara de huevo", grams: 132 }, { food: "Tomate", grams: 80 }], why: "Mucha proteína con pocas calorías." },
  { title: "Pollo a la plancha con brócoli y camote", moment: ["comida"], parts: [{ food: "Pechuga de pollo a la plancha (sin piel)", grams: 130 }, { food: "Brócoli sancochado", grams: 150 }, { food: "Camote sancochado (sin cáscara)", grams: 130 }], why: "Plato equilibrado: proteína, verdura y carbohidrato." },
  { title: "Pollo con arroz y ensalada", moment: ["comida"], parts: [{ food: "Pechuga de pollo a la plancha (sin piel)", grams: 120 }, { food: "Arroz blanco cocido", grams: 120 }, { food: "Ensalada fresca (lechuga, tomate, cebolla) sin aderezo", grams: 120 }, { food: "Aceite de oliva", grams: 5 }], why: "Clásico, saciante y fácil de preparar." },
  { title: "Tilapia con quinua y verduras", moment: ["comida"], parts: [{ food: "Tilapia cocida", grams: 140 }, { food: "Quinua cocida", grams: 120 }, { food: "Brócoli sancochado", grams: 100 }], why: "Pescado magro con quinua andina." },
  { title: "Ceviche con camote", moment: ["comida"], parts: [{ food: "Ceviche de pescado (sin camote ni choclo)", grams: 250 }, { food: "Camote sancochado (sin cáscara)", grams: 100 }], why: "Plato peruano alto en proteína y bajo en grasa." },
  { title: "Lentejas con arroz y huevo", moment: ["comida"], parts: [{ food: "Lentejas sancochadas", grams: 180 }, { food: "Arroz blanco cocido", grams: 100 }, { food: "Huevo sancochado (duro)", grams: 50 }], why: "Proteína vegetal + huevo, con mucha fibra." },
  { title: "Carne molida con papa y ensalada", moment: ["comida"], parts: [{ food: "Carne de res molida 90% magra cocida", grams: 110 }, { food: "Papa sancochada (sin cáscara)", grams: 150 }, { food: "Ensalada fresca (lechuga, tomate, cebolla) sin aderezo", grams: 120 }], why: "Aporta hierro y proteína." },
  { title: "Leche descremada con avena y manzana", moment: ["desayuno", "snack"], parts: [{ food: "Leche descremada", grams: 240 }, { food: "Avena en hojuelas (seca)", grams: 30 }, { food: "Manzana con cáscara", grams: 120 }], why: "Desayuno sencillo con proteína láctea." },
  { title: "Fruta con mantequilla de maní", moment: ["snack"], parts: [{ food: "Manzana con cáscara", grams: 150 }, { food: "Mantequilla de maní", grams: 16 }], why: "Snack práctico cuando te quedan pocas calorías y algo de grasa." },
  { title: "Bowl de fruta con yogur y chía", moment: ["desayuno", "snack"], parts: [{ food: "Yogur griego natural sin grasa", grams: 170 }, { food: "Arándanos", grams: 60 }, { food: "Mango", grams: 80 }, { food: "Semillas de chía", grams: 10 }], why: "Fresco, alto en proteína y con fibra de la chía." },
  { title: "Papaya con queso cottage", moment: ["desayuno", "snack"], parts: [{ food: "Queso cottage bajo en grasa", grams: 150 }, { food: "Papaya", grams: 200 }], why: "Dulce, ligero y con buena proteína." },
  { title: "Mandarinas y almendras", moment: ["snack"], parts: [{ food: "Mandarina", grams: 176 }, { food: "Almendras", grams: 15 }], why: "Snack de bolsillo con vitamina C y grasas buenas." },
  { title: "Piña con yogur griego", moment: ["snack"], parts: [{ food: "Piña", grams: 150 }, { food: "Yogur griego natural sin grasa", grams: 150 }], why: "Postre fresco que suma proteína." },
  { title: "Manzana, pera y maní", moment: ["snack"], parts: [{ food: "Manzana con cáscara", grams: 120 }, { food: "Pera", grams: 100 }, { food: "Maní tostado sin sal", grams: 15 }], why: "Mucha fibra y saciedad por pocas calorías." },
  { title: "Sandía y melón", moment: ["snack"], parts: [{ food: "Sandía", grams: 250 }, { food: "Melón", grams: 150 }], why: "Hidrata y endulza con muy pocas calorías." },
  { title: "Aguaymanto y fresas", moment: ["snack"], parts: [{ food: "Aguaymanto", grams: 100 }, { food: "Fresas", grams: 150 }], why: "Frutas peruanas ácidas y ligeras." },
  { title: "Batido de plátano y leche", moment: ["desayuno", "snack"], parts: [{ food: "Leche descremada", grams: 300 }, { food: "Plátano de seda", grams: 100 }, { food: "Avena en hojuelas (seca)", grams: 20 }], why: "Ideal después de entrenar." },
  { title: "Tostadas con palta y huevo", moment: ["desayuno"], parts: [{ food: "Pan integral", grams: 60 }, { food: "Palta", grams: 40 }, { food: "Huevo sancochado (duro)", grams: 100 }], why: "Desayuno clásico, completo y saciante." },
  { title: "Avena cocida con fresas", moment: ["desayuno"], parts: [{ food: "Avena en hojuelas (seca)", grams: 40 }, { food: "Leche descremada", grams: 200 }, { food: "Fresas", grams: 100 }], why: "Carbohidratos de lenta absorción para empezar el día." },
  { title: "Salmón con camote y espinaca", moment: ["comida"], parts: [{ food: "Salmón cocido", grams: 110 }, { food: "Camote sancochado (sin cáscara)", grams: 120 }, { food: "Espinaca", grams: 60 }], why: "Omega-3, carbohidrato y hierro." },
  { title: "Pavo con quinua y verduras", moment: ["comida"], parts: [{ food: "Pechuga de pavo asada", grams: 120 }, { food: "Quinua cocida", grams: 120 }, { food: "Zapallito italiano", grams: 100 }, { food: "Pimiento rojo", grams: 50 }], why: "Magro, colorido y con quinua." },
  { title: "Causa de pollo + ensalada", moment: ["comida"], parts: [{ food: "Causa limeña de pollo", grams: 220 }, { food: "Ensalada fresca (lechuga, tomate, cebolla) sin aderezo", grams: 100 }], why: "Un clásico peruano en porción moderada." },
  { title: "Langostinos salteados con arroz integral", moment: ["comida"], parts: [{ food: "Langostinos / camarones cocidos", grams: 130 }, { food: "Arroz integral cocido", grams: 130 }, { food: "Brócoli sancochado", grams: 100 }, { food: "Aceite de oliva", grams: 5 }], why: "Mucha proteína con poca grasa." },
  { title: "Garbanzos con atún y verduras", moment: ["comida"], parts: [{ food: "Garbanzos sancochados", grams: 130 }, { food: "Atún en agua (escurrido)", grams: 80 }, { food: "Tomate", grams: 80 }, { food: "Pepino", grams: 80 }], why: "Ensalada completa para llevar." },
  { title: "Lomo de cerdo con puré de papa y vainitas", moment: ["comida"], parts: [{ food: "Lomo de cerdo asado (magro)", grams: 120 }, { food: "Papa sancochada (sin cáscara)", grams: 150 }, { food: "Vainitas sancochadas", grams: 100 }], why: "El lomo de cerdo es más magro de lo que parece." },
  { title: "Sudado de pescado con arroz", moment: ["comida"], parts: [{ food: "Sudado de pescado (sin arroz)", grams: 300 }, { food: "Arroz blanco cocido", grams: 100 }], why: "Plato casero ligero y con mucha proteína." },
  { title: "Tofu salteado con verduras", moment: ["comida"], parts: [{ food: "Tofu firme", grams: 150 }, { food: "Champiñones", grams: 80 }, { food: "Pimiento rojo", grams: 60 }, { food: "Arroz integral cocido", grams: 100 }], why: "Opción vegetal con proteína completa." },
  { title: "Atún con papa y choclo", moment: ["comida", "snack"], parts: [{ food: "Atún en agua (escurrido)", grams: 120 }, { food: "Papa sancochada (sin cáscara)", grams: 120 }, { food: "Choclo sancochado", grams: 60 }, { food: "Tomate", grams: 60 }], why: "Ensalada peruana tipo causa deconstruida, alta en proteína." },
];

export type RecFilter = "auto" | "desayuno" | "snack" | "comida" | "frutas";

export interface Recommendation {
  title: string;
  why: string;
  parts: { name: string; grams: number; food: FoodItem }[];
  totals: Macros;
  score: number;
  fitNote: string;
}

function blockedBy(food: FoodItem, prefs: Preferences | null): boolean {
  if (!prefs) return false;
  if (food.allergens.some((a) => prefs.allergies.includes(a))) return true;
  const p = prefs.dietary_preferences;
  if (p.includes("vegetariano") && (food.tags.includes("carne") || food.tags.includes("pescado"))) return true;
  if (p.includes("sin_res") && food.tags.includes("res")) return true;
  if (p.includes("sin_pescado") && food.tags.includes("pescado")) return true;
  const name = food.name.toLowerCase();
  if (prefs.disliked_foods.some((d) => d.trim() && name.includes(d.trim().toLowerCase()))) return true;
  return false;
}

export function recommend(opts: {
  remaining: Macros;
  foods: FoodItem[];
  prefs: Preferences | null;
  eatenToday: string[];
  hour?: number;
  limit?: number;
  /** "auto" usa la hora del día; "frutas" muestra combinaciones con fruta */
  filter?: RecFilter;
}): { items: Recommendation[]; message: string | null } {
  const { remaining, foods, prefs } = opts;
  const byName = new Map(foods.map((f) => [f.name, f]));
  const hour = opts.hour ?? new Date().getHours();
  const filter = opts.filter ?? "auto";
  const moment = filter !== "auto" && filter !== "frutas" ? filter : hour < 11 ? "desayuno" : hour >= 12 && hour < 15 ? "comida" : hour >= 19 ? "comida" : "snack";

  if (remaining.kcal < 120) {
    return {
      items: [],
      message:
        remaining.kcal < -150
          ? "Hoy superaste tu objetivo estimado. No pasa nada: un día no define tu progreso. Mañana retoma tu plan normal, sin compensar comiendo de menos."
          : "Ya estás muy cerca de tu objetivo de hoy. Si tienes hambre, prioriza verduras, una fruta o una bebida sin azúcar. No es necesario comer más solo por completar números.",
    };
  }

  const eaten = opts.eatenToday.map((n) => n.toLowerCase());
  const out: Recommendation[] = [];
  for (const c of COMBOS) {
    const resolved = c.parts.map((p) => ({ ...p, f: byName.get(p.food) }));
    if (resolved.some((r) => !r.f)) continue;
    if (resolved.some((r) => blockedBy(r.f!, prefs))) continue;
    if (filter === "frutas" && !resolved.some((r) => r.f!.category === "frutas")) continue;
    if (filter !== "auto" && filter !== "frutas" && !c.moment.includes(filter)) continue;
    const base = sumMacros(resolved.map((r) => macrosFor(r.f!, r.grams)));
    // escala para no pasarse de las calorías restantes (pero sin obligar a llenarlas)
    const target = Math.min(remaining.kcal, 650);
    let scale = Math.min(1.4, Math.max(0.6, target / base.kcal));
    scale = Math.round(scale * 10) / 10;
    const parts = resolved.map((r) => ({ name: r.f!.name, grams: Math.round((r.grams * scale) / 5) * 5, food: r.f! }));
    const totals = sumMacros(parts.map((p) => macrosFor(p.food, p.grams)));
    if (totals.kcal > remaining.kcal + 60) continue;

    // puntaje: proteína pendiente cubierta, densidad proteica, no exceder grasa, momento del día, variedad
    const protNeed = Math.max(0, remaining.protein_g);
    const protScore = protNeed > 0 ? Math.min(1, totals.protein_g / protNeed) : 0.5;
    const density = totals.protein_g / Math.max(1, totals.kcal / 100); // g prot por 100 kcal
    const fatOver = Math.max(0, totals.fat_g - Math.max(0, remaining.fat_g)) / 10;
    const carbOver = Math.max(0, totals.carbs_g - Math.max(0, remaining.carbs_g)) / 30;
    const momentBonus = c.moment.includes(moment as never) ? 0.6 : 0;
    const repeated = parts.filter((p) => eaten.some((e) => e.includes(p.name.toLowerCase().split(" ")[0]))).length * 0.25;
    const score = round(protScore * 2 + Math.min(density, 12) / 6 + momentBonus - fatOver - carbOver - repeated, 2);

    const fit: string[] = [];
    if (protNeed > 0) fit.push(`cubre ${Math.round(Math.min(100, (totals.protein_g / protNeed) * 100))}% de la proteína pendiente`);
    fit.push(`usa ${Math.round((totals.kcal / remaining.kcal) * 100)}% de las kcal restantes`);
    out.push({ title: c.title, why: c.why, parts, totals, score, fitNote: fit.join(" · ") });
  }
  out.sort((a, b) => b.score - a.score);
  return { items: out.slice(0, opts.limit ?? 4), message: out.length ? null : "No encontré combinaciones compatibles con tus preferencias y restricciones. Puedes agregar alimentos personalizados en el buscador." };
}
