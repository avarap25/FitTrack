export type Sex = "female" | "male";
export type MealType = "desayuno" | "media_manana" | "almuerzo" | "merienda" | "cena" | "snack";

export const MEAL_TYPES: { key: MealType; label: string }[] = [
  { key: "desayuno", label: "Desayuno" },
  { key: "media_manana", label: "Media mañana" },
  { key: "almuerzo", label: "Almuerzo" },
  { key: "merienda", label: "Merienda" },
  { key: "cena", label: "Cena" },
  { key: "snack", label: "Otros snacks" },
];

export function defaultMealType(d = new Date()): MealType {
  const h = d.getHours();
  if (h < 10) return "desayuno";
  if (h < 12) return "media_manana";
  if (h < 15) return "almuerzo";
  if (h < 18) return "merienda";
  if (h < 22) return "cena";
  return "snack";
}

export interface Profile {
  id: string;
  display_name: string | null;
  age: number;
  sex: Sex;
  height_cm: number;
  current_weight_kg: number;
  start_weight_kg: number;
  target_weight_kg: number;
  start_date: string;
  target_date: string | null;
  daily_activity_factor: number;
  training_days_per_week: number;
  kcal_per_session: number;
  units: "metric";
  nutrition_objective: "perder_grasa" | "mantener" | "ganar_musculo";
}

export interface NutritionGoal {
  id: string;
  user_id: string;
  effective_from: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  origin: "manual" | "calculado" | "ajuste_tendencia";
  note: string | null;
}

export interface PetNames {
  scottie: string;
  yorkie1: string;
  yorkie2: string;
}

export interface Preferences {
  user_id: string;
  pet_names?: Partial<PetNames> | null;
  dietary_preferences: string[];
  allergies: string[];
  disliked_foods: string[];
  notes: string | null;
}

export interface Serving {
  label: string;
  grams: number;
}

export interface FoodItem {
  id: string;
  user_id: string | null;
  name: string;
  category: string;
  state: "crudo" | "cocido" | "preparado" | "envasado";
  preparation: string | null;
  kcal_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
  fiber_100g: number | null;
  servings: Serving[];
  allergens: string[];
  tags: string[];
  source: string;
  source_ref: string | null;
  is_estimate: boolean;
}

export interface Macros {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export interface Meal {
  id: string;
  user_id: string;
  date: string;
  meal_type: MealType;
  note: string | null;
}

export interface MealItem extends Macros {
  id: string;
  user_id: string;
  meal_id: string;
  food_item_id: string | null;
  name: string;
  preparation: string | null;
  grams: number;
  origin: "manual" | "foto_ia" | "usda" | "recomendacion";
  is_estimate: boolean;
  photo_id: string | null;
  created_at: string;
}

export interface WeightLog {
  id: string;
  logged_on: string;
  weight_kg: number;
  note: string | null;
}

export interface BodyMeasurement {
  id: string;
  measured_on: string;
  waist_cm: number | null;
  hip_cm: number | null;
  thigh_cm: number | null;
  arm_cm: number | null;
  chest_cm: number | null;
  note: string | null;
}

export interface RoutineExercise {
  name: string;
  sets: number;
  reps: number;
}

export interface Routine {
  id: string;
  name: string;
  muscle_groups: string;
  day_order: number;
  exercises: RoutineExercise[];
}

export interface ExerciseSet {
  id: string;
  workout_exercise_id: string;
  set_number: number;
  reps: number;
  weight_kg: number;
}

export interface WorkoutExercise {
  id: string;
  workout_id: string;
  name: string;
  position: number;
  comment: string | null;
  exercise_sets: ExerciseSet[];
}

export interface Workout {
  id: string;
  date: string;
  routine_id: string | null;
  muscle_group: string;
  notes: string | null;
  duration_min: number | null;
  kind: "fuerza" | "cardio";
  activity: string | null;
  intensity: "ligera" | "moderada" | "intensa" | null;
  kcal_burned: number | null;
  workout_exercises: WorkoutExercise[];
}

export const ALLERGEN_OPTIONS = [
  { key: "lacteos", label: "Lácteos" },
  { key: "huevo", label: "Huevo" },
  { key: "pescado", label: "Pescado" },
  { key: "mariscos", label: "Mariscos" },
  { key: "gluten", label: "Gluten" },
  { key: "mani", label: "Maní" },
  { key: "frutos_secos", label: "Frutos secos" },
  { key: "soya", label: "Soya" },
];

export const PREFERENCE_OPTIONS = [
  { key: "vegetariano", label: "Vegetariana (sin carnes ni pescado)" },
  { key: "sin_res", label: "Sin carne de res" },
  { key: "sin_pescado", label: "Sin pescado" },
];
