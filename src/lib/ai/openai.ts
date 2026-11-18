import "server-only";
import OpenAI from "openai";
import { aiResultJsonSchema, aiResultSchema, type AiResult, type ReviewItem } from "./schema";

export class AiNotConfiguredError extends Error {}

export function openaiClient() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new AiNotConfiguredError("Falta OPENAI_API_KEY en el servidor.");
  return new OpenAI({ apiKey: key });
}

export const visionModel = () => process.env.OPENAI_VISION_MODEL || "gpt-4o";

export interface CatalogEntry {
  id: string;
  name: string;
  state: string;
}

const SYSTEM = `Eres el analizador nutricional de FitTrack, una app peruana de nutrición.
Reglas:
- Identifica cada componente del plato por separado (p. ej. pollo, arroz, papa, ensalada). Usa nombres en español de Perú.
- Estima los gramos de cada componente tal como está servido (cocido si está cocido). Usa como referencia el tamaño del plato (~26 cm), cubiertos y manos si aparecen.
- Una foto NO permite conocer el peso exacto, ni aceites, mantequilla, azúcar o salsas ocultas. Refléjalo en "confidence" y "uncertainty". Nunca afirmes exactitud.
- Si un componente coincide con un alimento del CATÁLOGO (mismo alimento y preparación compatible), pon su id en food_id. Si no hay coincidencia razonable, food_id = null y da tu mejor estimación por 100 g basada en tablas de composición estándar (USDA / Tablas Peruanas de Composición de Alimentos).
- Un plato peruano mixto (lomo saltado, ají de gallina, etc.) puede ir como un solo item si está en el catálogo, o separado en componentes si se distinguen claramente (p. ej. el arroz aparte).
- Si la imagen no es comida, is_food = false e items vacío.
- No agregues alimentos que no se ven, salvo que la usuaria lo indique.`;

function catalogText(catalog: CatalogEntry[]) {
  return catalog.map((c) => `${c.id} | ${c.name} | ${c.state}`).join("\n");
}

async function callStructured(messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]): Promise<AiResult> {
  const client = openaiClient();
  const res = await client.chat.completions.create({
    model: visionModel(),
    temperature: 0.2,
    max_tokens: 1800,
    response_format: { type: "json_schema", json_schema: { name: "fittrack_meal", strict: true, schema: aiResultJsonSchema as unknown as Record<string, unknown> } },
    messages,
  });
  const choice = res.choices[0];
  if (choice?.message?.refusal) throw new Error("El modelo no pudo analizar la imagen.");
  const raw = choice?.message?.content;
  if (!raw) throw new Error("Respuesta vacía del modelo.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("La IA devolvió un formato inválido.");
  }
  const result = aiResultSchema.safeParse(parsed);
  if (!result.success) throw new Error("La respuesta de la IA no pasó la validación.");
  return result.data;
}

export async function analyzeImage(opts: { base64: string; mime: string; catalog: CatalogEntry[]; hint?: string }) {
  return callStructured([
    { role: "system", content: SYSTEM },
    {
      role: "user",
      content: [
        { type: "text", text: `CATÁLOGO (id | nombre | estado):\n${catalogText(opts.catalog)}\n\n${opts.hint ? `Comentario de la usuaria: ${opts.hint}\n\n` : ""}Analiza este plato.` },
        { type: "image_url", image_url: { url: `data:${opts.mime};base64,${opts.base64}`, detail: "high" } },
      ],
    },
  ]);
}

export async function refineItems(opts: { items: ReviewItem[]; instruction: string; catalog: CatalogEntry[] }) {
  const current = opts.items.map(({ nutrition_source: _ns, ...rest }) => rest);
  return callStructured([
    { role: "system", content: SYSTEM + "\nAhora vas a CORREGIR una lista existente según la instrucción de la usuaria. Mantén los items que no menciona sin cambios. Aplica cantidades exactas si las da (p. ej. 'el pollo era 150 gramos'). Agrega, elimina o cambia items según pida." },
    {
      role: "user",
      content: `CATÁLOGO (id | nombre | estado):\n${catalogText(opts.catalog)}\n\nLISTA ACTUAL (JSON):\n${JSON.stringify({ items: current })}\n\nINSTRUCCIÓN DE LA USUARIA: "${opts.instruction.replace(/"/g, "'")}"\n\nDevuelve la lista completa actualizada. is_food = true.`,
    },
  ]);
}
