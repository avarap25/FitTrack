import type { AiItem, ReviewItem } from "./schema";

interface DbFood {
  id: string;
  kcal_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
  name: string;
}

/** Si la IA eligió un alimento de la base, se usan los valores de la base (verificables), no los del modelo. */
export function mergeWithDb(items: AiItem[], foods: DbFood[]): ReviewItem[] {
  const map = new Map(foods.map((f) => [f.id, f]));
  return items.map((it) => {
    const f = it.food_id ? map.get(it.food_id) : undefined;
    if (f) {
      return {
        ...it,
        food_id: f.id,
        kcal_100g: Number(f.kcal_100g),
        protein_100g: Number(f.protein_100g),
        carbs_100g: Number(f.carbs_100g),
        fat_100g: Number(f.fat_100g),
        nutrition_source: "base" as const,
      };
    }
    return { ...it, food_id: null, nutrition_source: "ia" as const };
  });
}
