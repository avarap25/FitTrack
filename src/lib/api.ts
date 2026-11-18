import "server-only";
import { NextResponse } from "next/server";
import { supabaseServer } from "./supabase/server";
import { AiNotConfiguredError, type CatalogEntry } from "./ai/openai";

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function requireUser() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function loadCatalog(supabase: Awaited<ReturnType<typeof supabaseServer>>) {
  const { data, error } = await supabase
    .from("food_items")
    .select("id,name,state,kcal_100g,protein_100g,carbs_100g,fat_100g")
    .order("name")
    .limit(400);
  if (error) throw new Error("No se pudo cargar la base de alimentos.");
  const catalog: CatalogEntry[] = (data ?? []).map((f) => ({ id: f.id, name: f.name, state: f.state }));
  return { foods: data ?? [], catalog };
}

export function aiErrorResponse(e: unknown) {
  if (e instanceof AiNotConfiguredError) {
    return jsonError("El análisis con IA no está configurado: falta OPENAI_API_KEY en el servidor. Mientras tanto puedes usar el buscador manual.", 503);
  }
  const msg = e instanceof Error ? e.message : "Error desconocido";
  console.error("[ai]", msg);
  return jsonError(`No se pudo completar el análisis: ${msg}`, 502);
}

/** Limitador simple en memoria por usuario (protege la cuota de OpenAI). */
const hits = new Map<string, number[]>();
export function rateLimit(key: string, max = 20, windowMs = 10 * 60 * 1000) {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= max) return false;
  arr.push(now);
  hits.set(key, arr);
  return true;
}
