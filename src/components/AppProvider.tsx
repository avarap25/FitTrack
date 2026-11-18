"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { NutritionGoal, Preferences, Profile } from "@/lib/types";
import { ErrorBox, Loading } from "./ui";

interface Ctx {
  user: User;
  profile: Profile;
  goal: NutritionGoal;
  prefs: Preferences;
  reload: () => Promise<void>;
}

const AppCtx = createContext<Ctx | null>(null);

export function useApp() {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp fuera de AppProvider");
  return c;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<Omit<Ctx, "reload"> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const sb = supabaseBrowser();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
      window.location.href = "/login";
      return;
    }
    const [p, g, pr] = await Promise.all([
      sb.from("profiles").select("*").eq("id", user.id).single(),
      sb.from("nutrition_goals").select("*").order("effective_from", { ascending: false }).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      sb.from("user_preferences").select("*").maybeSingle(),
    ]);
    if (p.error || !p.data) {
      setError("No se encontró tu perfil. ¿Ejecutaste las migraciones SQL en Supabase? " + (p.error?.message ?? ""));
      return;
    }
    const num = (o: Record<string, unknown>, keys: string[]) => {
      for (const k of keys) if (o[k] !== null && o[k] !== undefined) o[k] = Number(o[k]);
      return o;
    };
    const profile = num(p.data, ["age", "height_cm", "current_weight_kg", "start_weight_kg", "target_weight_kg", "daily_activity_factor", "training_days_per_week", "kcal_per_session"]) as unknown as Profile;
    const goal = (g.data ?? { id: "default", user_id: user.id, effective_from: profile.start_date, calories: 1750, protein_g: 125, carbs_g: 190, fat_g: 55, origin: "manual", note: null }) as NutritionGoal;
    const prefs = (pr.data ?? { user_id: user.id, dietary_preferences: [], allergies: [], disliked_foods: [], notes: null }) as Preferences;
    setState({ user, profile, goal, prefs });
  }, []);

  useEffect(() => {
    load().catch((e) => setError(String(e)));
  }, [load]);

  if (error) return <div className="p-6"><ErrorBox message={error} onRetry={load} /></div>;
  if (!state) return <Loading text="Preparando FitTrack…" />;
  return <AppCtx.Provider value={{ ...state, reload: load }}>{children}</AppCtx.Provider>;
}
