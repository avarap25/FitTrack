import { describe, expect, it } from "vitest";
import foods from "../src/lib/foods-seed.json";
import { foodEmoji } from "../src/lib/food-emoji";

const EXPECT: Record<string, string> = {
  "Fresas": "🍓", "Papaya": "🥭", "Espinaca": "🥗", "Piña": "🍍", "Pera": "🍐", "Uvas": "🍇",
  "Papa sancochada (sin cáscara)": "🥔", "Pan integral": "🍞", "Atún en agua (escurrido)": "🐟",
  "Lomo saltado (solo el saltado, sin arroz)": "🥩", "Arroz chaufa de pollo": "🍛", "Frejoles sancochados (canario/pinto)": "🫘",
  "Maní tostado sin sal": "🥜", "Champiñones": "🍄", "Palta": "🥑", "Mango": "🥭", "Pechuga de pollo a la plancha (sin piel)": "🍗",
};

describe("íconos de alimentos", () => {
  it("casos conocidos", () => {
    for (const [name, e] of Object.entries(EXPECT)) expect(foodEmoji(name), name).toBe(e);
  });
  it("las frutas nunca reciben ícono de carne, papa ni pan", () => {
    for (const f of foods as { name: string; category: string }[]) {
      const e = foodEmoji(f.name, f.category);
      if (f.category === "frutas") expect(["🥩", "🥔", "🍞", "🍗"], f.name).not.toContain(e);
    }
  });
});
