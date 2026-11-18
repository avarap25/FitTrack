"use client";
import { useEffect, useState } from "react";

export type ThemePref = "system" | "light" | "dark";

export function applyTheme(pref: ThemePref) {
  try { localStorage.setItem("ft-theme", pref); } catch {}
  const dark = pref === "dark" || (pref === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  window.dispatchEvent(new Event("ft-theme"));
}

export function getThemePref(): ThemePref {
  try { return (localStorage.getItem("ft-theme") as ThemePref) || "system"; } catch { return "system"; }
}

const read = () => {
  const s = getComputedStyle(document.documentElement);
  const c = (n: string) => `rgb(${s.getPropertyValue(`--${n}`).trim().split(/\s+/).join(",")})`;
  return { grid: c("line"), axis: c("faint"), fg: c("fg"), surface: c("surface"), accent: c("accent"), prot: c("prot"), carb: c("carb"), fat: c("fat"), pos: c("pos"), muted: c("muted") };
};

const FALLBACK = { grid: "#E2D7C9", axis: "#A69488", fg: "#2B1D17", surface: "#FCF9F4", accent: "#6E1F2E", prot: "#8E3A4A", carb: "#CEA05F", fat: "#7B8B5E", pos: "#5E7A4C", muted: "#7A6559" };

/** Colores del tema actual para gráficos SVG (Recharts). Se actualiza al cambiar de tema. */
export function useChartColors() {
  const [c, setC] = useState(FALLBACK);
  useEffect(() => {
    const update = () => setC(read());
    update();
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const sys = () => { if (getThemePref() === "system") applyTheme("system"); };
    window.addEventListener("ft-theme", update);
    mq.addEventListener("change", sys);
    return () => { window.removeEventListener("ft-theme", update); mq.removeEventListener("change", sys); };
  }, []);
  return c;
}
