import { NextResponse } from "next/server";
import { analyzeImage } from "@/lib/ai/openai";
import { mergeWithDb } from "@/lib/ai/merge";
import { aiErrorResponse, jsonError, loadCatalog, rateLimit, requireUser } from "@/lib/api";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

export async function POST(req: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return jsonError("No autenticada", 401);
  if (!rateLimit(user.id)) return jsonError("Demasiados análisis seguidos. Espera unos minutos.", 429);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError("Formulario inválido");
  }
  const file = form.get("image");
  const hint = String(form.get("hint") ?? "").slice(0, 300);
  const existingPhotoId = String(form.get("photo_id") ?? "") || null;
  if (!(file instanceof File)) return jsonError("Falta la imagen");
  if (!ALLOWED.includes(file.type)) return jsonError("Formato no permitido. Usa JPG, PNG o WEBP.");
  if (file.size > MAX_BYTES) return jsonError("La imagen supera 5 MB.");

  const bytes = Buffer.from(await file.arrayBuffer());
  // verificación de "magic bytes" para no confiar solo en el MIME declarado
  const isJpg = bytes[0] === 0xff && bytes[1] === 0xd8;
  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50;
  const isWebp = bytes.subarray(8, 12).toString() === "WEBP";
  if (!isJpg && !isPng && !isWebp) return jsonError("El archivo no parece una imagen válida.");

  let photoId = existingPhotoId;
  let path: string | null = null;
  if (!photoId) {
    const ext = file.type.split("/")[1].replace("jpeg", "jpg");
    path = `${user.id}/${crypto.randomUUID()}.${ext}`;
    const up = await supabase.storage.from("food-photos").upload(path, bytes, { contentType: file.type, upsert: false });
    if (up.error) return jsonError("No se pudo guardar la foto: " + up.error.message, 500);
  }

  try {
    const { foods, catalog } = await loadCatalog(supabase);
    const ai = await analyzeImage({ base64: bytes.toString("base64"), mime: file.type, catalog, hint });
    const items = mergeWithDb(ai.items, foods);
    const payload = { ...ai, items };
    if (photoId) {
      await supabase.from("food_photos").update({ ai_result: payload, status: "analizada" }).eq("id", photoId);
    } else {
      const ins = await supabase
        .from("food_photos")
        .insert({ user_id: user.id, storage_path: path, ai_result: payload, ai_model: process.env.OPENAI_VISION_MODEL || "gpt-4o" })
        .select("id")
        .single();
      if (ins.error) return jsonError("No se pudo registrar la foto.", 500);
      photoId = ins.data.id;
    }
    return NextResponse.json({ photo_id: photoId, ...payload });
  } catch (e) {
    if (path) await supabase.from("food_photos").insert({ user_id: user.id, storage_path: path, status: "error" });
    return aiErrorResponse(e);
  }
}
