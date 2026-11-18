import type { Macros, NutritionGoal } from "./types";
import { round } from "./nutrition";

export interface DaySummary {
  headline: string;
  points: { tone: "ok" | "warn" | "info"; text: string }[];
  tomorrow: string[];
}

/** Resumen diario explicativo. No presiona a "llenar" calorías ni premia comer de menos. */
export function daySummary(t: Macros, goal: NutritionGoal, tdee: number, itemsCount: number, floor: number, dayOver = true): DaySummary {
  const points: DaySummary["points"] = [];
  const tomorrow: string[] = [];
  if (itemsCount === 0) {
    return { headline: "Aún no hay registros hoy", points: [{ tone: "info", text: "Registra tus comidas para ver el análisis del día." }], tomorrow: [] };
  }
  const kcalPct = t.kcal / goal.calories;
  points.push({ tone: "info", text: `Consumiste ${Math.round(t.kcal)} kcal de un objetivo de ${goal.calories} (${Math.round(kcalPct * 100)}%).` });

  const protPct = t.protein_g / goal.protein_g;
  if (protPct >= 0.9) points.push({ tone: "ok", text: `Proteína: ${Math.round(t.protein_g)} g. Alcanzaste tu objetivo (${goal.protein_g} g).` });
  else {
    points.push({ tone: "warn", text: `Proteína: ${Math.round(t.protein_g)} g de ${goal.protein_g} g (faltaron ${Math.round(goal.protein_g - t.protein_g)} g).` });
    tomorrow.push("Incluye una fuente de proteína en cada comida (huevo, yogur griego, pollo, pescado, atún, menestras).");
  }

  const carbPct = t.carbs_g / goal.carbs_g;
  const fatPct = t.fat_g / goal.fat_g;
  const cText = carbPct > 1.15 ? "por encima" : carbPct < 0.6 ? "bastante por debajo" : "dentro de un rango razonable";
  const fText = fatPct > 1.2 ? "por encima" : fatPct < 0.5 ? "muy por debajo" : "dentro de un rango razonable";
  points.push({ tone: carbPct > 1.15 ? "warn" : "info", text: `Carbohidratos ${Math.round(t.carbs_g)} g (${cText} del objetivo).` });
  points.push({ tone: fatPct > 1.2 ? "warn" : "info", text: `Grasas ${Math.round(t.fat_g)} g (${fText} del objetivo).` });
  if (fatPct > 1.2) tomorrow.push("Revisa las grasas ocultas: aceite de cocción, frituras, salsas y cremas.");
  if (fatPct < 0.5) tomorrow.push("No elimines las grasas: un poco de palta, aceite de oliva o huevo ayuda a tus hormonas y a la saciedad.");

  const balance = round(tdee - t.kcal);
  if (!dayOver) points.push({ tone: "info", text: "El día aún no termina: este análisis es parcial." });
  if (balance > 0) points.push({ tone: "ok", text: `Déficit estimado: ~${balance} kcal frente a un gasto estimado de ${Math.round(tdee)} kcal.` });
  else points.push({ tone: "warn", text: `Hoy no hubo déficit estimado (superávit de ~${Math.abs(balance)} kcal). Un día así no cambia tu tendencia.` });

  if (dayOver && t.kcal < floor * 0.85) {
    points.push({ tone: "warn", text: "Comiste bastante menos de lo recomendado. Comer muy poco no acelera los resultados y puede afectar tu energía y tu masa muscular." });
    tomorrow.push("Asegúrate de cubrir al menos tus comidas principales; si el registro quedó incompleto, complétalo.");
  }
  if (!tomorrow.length) tomorrow.push("Buen día. Mantén la misma estructura mañana.");

  const headline = protPct >= 0.9 && kcalPct <= 1.1 && kcalPct >= 0.8 ? "Día bien encaminado" : kcalPct > 1.15 ? "Día por encima del objetivo" : "Día con oportunidades de mejora";
  return { headline, points, tomorrow };
}
