import { z } from "zod";

export const confidence = z.enum(["alta", "media", "baja"]);

/** Lo que devuelve el modelo por cada alimento detectado. */
export const aiItemSchema = z.object({
  name: z.string().min(1).max(120),
  preparation: z.string().max(160),
  grams: z.number().min(1).max(2000),
  confidence,
  /** id de la base FitTrack si coincide; null si no hay coincidencia */
  food_id: z.string().max(64).nullable(),
  /** estimación propia del modelo por 100 g, usada solo si food_id es null */
  kcal_100g: z.number().min(0).max(950),
  protein_100g: z.number().min(0).max(100),
  carbs_100g: z.number().min(0).max(100),
  fat_100g: z.number().min(0).max(100),
  uncertainty: z.string().max(240),
});

export const aiResultSchema = z.object({
  is_food: z.boolean(),
  items: z.array(aiItemSchema).max(20),
  hidden_ingredients_note: z.string().max(400),
  general_note: z.string().max(400),
});

export type AiItem = z.infer<typeof aiItemSchema>;
export type AiResult = z.infer<typeof aiResultSchema>;

/** JSON Schema estricto equivalente (para response_format de OpenAI). */
export const aiResultJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["is_food", "items", "hidden_ingredients_note", "general_note"],
  properties: {
    is_food: { type: "boolean", description: "false si la imagen no muestra comida" },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "preparation", "grams", "confidence", "food_id", "kcal_100g", "protein_100g", "carbs_100g", "fat_100g", "uncertainty"],
        properties: {
          name: { type: "string", description: "Nombre del alimento en español" },
          preparation: { type: "string", description: "Preparación visible: sancochado, frito, a la plancha, crudo..." },
          grams: { type: "number", description: "Gramos estimados del alimento tal como se ve en el plato" },
          confidence: { type: "string", enum: ["alta", "media", "baja"] },
          food_id: { type: ["string", "null"], description: "id del catálogo FitTrack si el alimento y la preparación coinciden; si no, null" },
          kcal_100g: { type: "number" },
          protein_100g: { type: "number" },
          carbs_100g: { type: "number" },
          fat_100g: { type: "number" },
          uncertainty: { type: "string", description: "Qué hace incierta la estimación (aceite, salsa, porción oculta...)" },
        },
      },
    },
    hidden_ingredients_note: { type: "string", description: "Ingredientes que podrían no verse: aceite, mantequilla, azúcar, salsas" },
    general_note: { type: "string" },
  },
} as const;

/** Item ya fusionado con la base de datos, el que ve y edita la usuaria. */
export const reviewItemSchema = z.object({
  name: z.string().min(1).max(120),
  preparation: z.string().max(160).default(""),
  grams: z.number().min(1).max(2000),
  confidence: confidence.default("media"),
  food_id: z.string().max(64).nullable(),
  kcal_100g: z.number().min(0).max(950),
  protein_100g: z.number().min(0).max(100),
  carbs_100g: z.number().min(0).max(100),
  fat_100g: z.number().min(0).max(100),
  uncertainty: z.string().max(240).default(""),
  nutrition_source: z.enum(["base", "ia"]),
});
export type ReviewItem = z.infer<typeof reviewItemSchema>;

export const refineRequestSchema = z.object({
  instruction: z.string().min(2).max(500),
  items: z.array(reviewItemSchema).max(20),
});
