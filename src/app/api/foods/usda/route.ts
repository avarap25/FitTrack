import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/api";

export const runtime = "nodejs";

interface FdcNutrient { nutrientId?: number; nutrientNumber?: string; value?: number; unitName?: string }
interface FdcFood { fdcId: number; description: string; dataType: string; foodNutrients: FdcNutrient[] }

const pick = (ns: FdcNutrient[], id: number, num: string) =>
  ns.find((n) => n.nutrientId === id || n.nutrientNumber === num)?.value ?? null;

export async function GET(req: Request) {
  const { user } = await requireUser();
  if (!user) return jsonError("No autenticada", 401);
  const key = process.env.USDA_FDC_API_KEY;
  if (!key) return jsonError("Búsqueda USDA no configurada (falta USDA_FDC_API_KEY).", 503);
  const q = new URL(req.url).searchParams.get("q")?.trim().slice(0, 80);
  if (!q || q.length < 2) return jsonError("Escribe al menos 2 letras");
  const res = await fetch("https://api.nal.usda.gov/fdc/v1/foods/search?api_key=" + encodeURIComponent(key), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: q, dataType: ["Foundation", "SR Legacy"], pageSize: 15 }),
    cache: "no-store",
  });
  if (!res.ok) return jsonError("USDA no respondió correctamente.", 502);
  const data = (await res.json()) as { foods?: FdcFood[] };
  const foods = (data.foods ?? [])
    .map((f) => ({
      fdcId: f.fdcId,
      description: f.description,
      dataType: f.dataType,
      kcal_100g: pick(f.foodNutrients, 1008, "208") ?? pick(f.foodNutrients, 2047, "957"),
      protein_100g: pick(f.foodNutrients, 1003, "203"),
      carbs_100g: pick(f.foodNutrients, 1005, "205"),
      fat_100g: pick(f.foodNutrients, 1004, "204"),
    }))
    .filter((f) => f.kcal_100g !== null && f.protein_100g !== null && f.carbs_100g !== null && f.fat_100g !== null);
  return NextResponse.json({ foods });
}
