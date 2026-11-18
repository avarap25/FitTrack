"use client";
import { supabaseBrowser } from "./supabase/client";
import { macrosFor, round } from "./nutrition";
import type { FoodItem, Meal, MealItem, MealType, NutritionGoal, WeightLog, Workout } from "./types";

const sb = () => supabaseBrowser();

const toNum = <T extends object>(o: T, keys: (keyof T)[]): T => {
  const c = { ...o };
  for (const k of keys) if (c[k] !== null && c[k] !== undefined) (c[k] as unknown) = Number(c[k]);
  return c;
};

export async function uid(): Promise<string> {
  const { data } = await sb().auth.getUser();
  if (!data.user) throw new Error("Sesión expirada");
  return data.user.id;
}

export async function getOrCreateMeal(date: string, meal_type: MealType): Promise<Meal> {
  const user_id = await uid();
  const found = await sb().from("meals").select("*").eq("date", date).eq("meal_type", meal_type).maybeSingle();
  if (found.data) return found.data as Meal;
  const ins = await sb().from("meals").insert({ user_id, date, meal_type }).select("*").single();
  if (ins.error) {
    // carrera: otra pestaña la creó
    const again = await sb().from("meals").select("*").eq("date", date).eq("meal_type", meal_type).single();
    if (again.error) throw new Error(ins.error.message);
    return again.data as Meal;
  }
  return ins.data as Meal;
}

export interface NewMealItem {
  name: string;
  preparation?: string | null;
  grams: number;
  food_item_id?: string | null;
  per100: { kcal_100g: number; protein_100g: number; carbs_100g: number; fat_100g: number };
  origin?: MealItem["origin"];
  is_estimate?: boolean;
  photo_id?: string | null;
}

export async function addItems(date: string, meal_type: MealType, items: NewMealItem[]) {
  if (!items.length) return;
  const user_id = await uid();
  const meal = await getOrCreateMeal(date, meal_type);
  const rows = items.map((i) => ({
    user_id,
    meal_id: meal.id,
    food_item_id: i.food_item_id ?? null,
    name: i.name,
    preparation: i.preparation ?? null,
    grams: round(i.grams, 1),
    ...macrosFor(i.per100, i.grams),
    origin: i.origin ?? "manual",
    is_estimate: i.is_estimate ?? false,
    photo_id: i.photo_id ?? null,
  }));
  const { error } = await sb().from("meal_items").insert(rows);
  if (error) throw new Error(error.message);
}

export async function updateItemGrams(item: MealItem, grams: number) {
  // escala proporcional sobre los valores congelados del registro
  const f = grams / Number(item.grams);
  const { error } = await sb()
    .from("meal_items")
    .update({ grams: round(grams, 1), kcal: round(item.kcal * f, 1), protein_g: round(item.protein_g * f, 1), carbs_g: round(item.carbs_g * f, 1), fat_g: round(item.fat_g * f, 1) })
    .eq("id", item.id);
  if (error) throw new Error(error.message);
}

export async function moveItem(item: MealItem, date: string, meal_type: MealType) {
  const meal = await getOrCreateMeal(date, meal_type);
  const { error } = await sb().from("meal_items").update({ meal_id: meal.id }).eq("id", item.id);
  if (error) throw new Error(error.message);
}

export async function deleteItem(id: string) {
  const { error } = await sb().from("meal_items").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

const ITEM_NUM: (keyof MealItem)[] = ["grams", "kcal", "protein_g", "carbs_g", "fat_g"];

export async function fetchDay(date: string): Promise<{ meals: Meal[]; items: MealItem[] }> {
  const { data, error } = await sb().from("meals").select("*, meal_items(*)").eq("date", date);
  if (error) throw new Error(error.message);
  const meals = (data ?? []) as (Meal & { meal_items: MealItem[] })[];
  return {
    meals,
    items: meals.flatMap((m) => m.meal_items.map((i) => toNum(i, ITEM_NUM))).sort((a, b) => a.created_at.localeCompare(b.created_at)),
  };
}

/** Totales por día en un rango (para promedios semanales/mensuales). */
export async function fetchDailyTotals(from: string, to: string) {
  const { data, error } = await sb()
    .from("meals")
    .select("date, meal_items(kcal,protein_g,carbs_g,fat_g)")
    .gte("date", from)
    .lte("date", to);
  if (error) throw new Error(error.message);
  const map = new Map<string, { kcal: number; protein_g: number; carbs_g: number; fat_g: number }>();
  for (const m of (data ?? []) as { date: string; meal_items: { kcal: number; protein_g: number; carbs_g: number; fat_g: number }[] }[]) {
    const t = map.get(m.date) ?? { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
    for (const i of m.meal_items) {
      t.kcal += Number(i.kcal);
      t.protein_g += Number(i.protein_g);
      t.carbs_g += Number(i.carbs_g);
      t.fat_g += Number(i.fat_g);
    }
    map.set(m.date, t);
  }
  return [...map.entries()]
    .filter(([, t]) => t.kcal > 0)
    .map(([date, t]) => ({ date, ...t }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

const FOOD_NUM: (keyof FoodItem)[] = ["kcal_100g", "protein_100g", "carbs_100g", "fat_100g", "fiber_100g"];

export async function fetchFoods(): Promise<FoodItem[]> {
  const { data, error } = await sb().from("food_items").select("*").order("name").limit(1000);
  if (error) throw new Error(error.message);
  return (data ?? []).map((f) => toNum(f as FoodItem, FOOD_NUM));
}

export async function searchFoods(q: string): Promise<FoodItem[]> {
  const term = q.trim().replace(/[%_,()]/g, " ");
  if (!term) return fetchFoods();
  const words = term.split(/\s+/).filter(Boolean);
  let query = sb().from("food_items").select("*");
  for (const w of words) query = query.ilike("name", `%${w}%`);
  const { data, error } = await query.order("name").limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []).map((f) => toNum(f as FoodItem, FOOD_NUM));
}

export async function fetchWeights(): Promise<WeightLog[]> {
  const { data, error } = await sb().from("weight_logs").select("*").order("logged_on");
  if (error) throw new Error(error.message);
  return (data ?? []).map((w) => toNum(w as WeightLog, ["weight_kg"]));
}

export async function fetchGoals(): Promise<NutritionGoal[]> {
  const { data, error } = await sb().from("nutrition_goals").select("*").order("effective_from", { ascending: false }).order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as NutritionGoal[];
}

export async function fetchWorkouts(from?: string): Promise<Workout[]> {
  let q = sb().from("workouts").select("*, workout_exercises(*, exercise_sets(*))").order("date", { ascending: false }).order("created_at", { ascending: false });
  if (from) q = q.gte("date", from);
  const { data, error } = await q.limit(200);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Workout[]).map((w) => ({
    ...w,
    kind: w.kind ?? "fuerza",
    kcal_burned: w.kcal_burned === null || w.kcal_burned === undefined ? null : Number(w.kcal_burned),
    duration_min: w.duration_min === null ? null : Number(w.duration_min),
    workout_exercises: [...w.workout_exercises]
      .sort((a, b) => a.position - b.position)
      .map((e) => ({ ...e, exercise_sets: [...e.exercise_sets].sort((a, b) => a.set_number - b.set_number).map((s) => toNum(s, ["weight_kg", "reps"])) })),
  }));
}

export async function signedUrl(bucket: string, path: string) {
  const { data } = await sb().storage.from(bucket).createSignedUrl(path, 60 * 30);
  return data?.signedUrl ?? null;
}

/** Comprime en el navegador a máx. 1600 px JPEG para respetar el límite de 5 MB y ahorrar datos. */
export async function compressImage(file: File, maxSide = 1600, quality = 0.85): Promise<File> {
  if (!file.type.startsWith("image/")) throw new Error("El archivo no es una imagen");
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file;
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const blob: Blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("No se pudo procesar la imagen"))), "image/jpeg", quality));
  return new File([blob], "foto.jpg", { type: "image/jpeg" });
}
