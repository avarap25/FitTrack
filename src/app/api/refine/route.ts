import { NextResponse } from "next/server";
import { refineItems } from "@/lib/ai/openai";
import { mergeWithDb } from "@/lib/ai/merge";
import { refineRequestSchema } from "@/lib/ai/schema";
import { aiErrorResponse, jsonError, loadCatalog, rateLimit, requireUser } from "@/lib/api";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return jsonError("No autenticada", 401);
  if (!rateLimit(user.id + ":refine", 40)) return jsonError("Demasiadas correcciones seguidas. Espera unos minutos.", 429);
  const body = refineRequestSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return jsonError("Datos inválidos");
  try {
    const { foods, catalog } = await loadCatalog(supabase);
    const ai = await refineItems({ items: body.data.items, instruction: body.data.instruction, catalog });
    return NextResponse.json({ ...ai, items: mergeWithDb(ai.items, foods) });
  } catch (e) {
    return aiErrorResponse(e);
  }
}
