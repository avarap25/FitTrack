import { round } from "./nutrition";

/** Fecha local YYYY-MM-DD (sin desfase UTC). */
export function isoDate(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseDate(s: string): Date {
  return new Date(s + "T12:00:00");
}

export function addDaysIso(s: string, n: number): string {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

/** Lunes de la semana de la fecha (ISO). */
export function weekStart(s: string): string {
  const d = parseDate(s);
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return isoDate(d);
}

export function monthKey(s: string) {
  return s.slice(0, 7);
}

export interface Bucket {
  key: string; // inicio de semana o mes
  avg: number;
  count: number;
}

export function bucketAverages<T>(rows: T[], dateOf: (r: T) => string, valueOf: (r: T) => number, by: "week" | "month" = "week"): Bucket[] {
  const map = new Map<string, number[]>();
  for (const r of rows) {
    const k = by === "week" ? weekStart(dateOf(r)) : monthKey(dateOf(r));
    const arr = map.get(k) ?? [];
    arr.push(valueOf(r));
    map.set(k, arr);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, v]) => ({ key, avg: round(v.reduce((a, b) => a + b, 0) / v.length, 2), count: v.length }));
}

/** Pendiente por regresión lineal (unidades por paso de x). */
export function linearSlope(points: { x: number; y: number }[]): number | null {
  if (points.length < 2) return null;
  const n = points.length;
  const mx = points.reduce((a, p) => a + p.x, 0) / n;
  const my = points.reduce((a, p) => a + p.y, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.x - mx) * (p.y - my);
    den += (p.x - mx) ** 2;
  }
  return den === 0 ? null : num / den;
}

/**
 * Tendencia de peso en kg/semana a partir de TODOS los pesajes (regresión
 * sobre días), no solo de dos pesajes aislados. Requiere ≥ 4 pesajes
 * repartidos en ≥ 10 días para dar un valor.
 */
export function weightTrendPerWeek(logs: { logged_on: string; weight_kg: number }[]): number | null {
  if (logs.length < 4) return null;
  const sorted = [...logs].sort((a, b) => a.logged_on.localeCompare(b.logged_on));
  const t0 = parseDate(sorted[0].logged_on).getTime();
  const span = (parseDate(sorted[sorted.length - 1].logged_on).getTime() - t0) / 86400000;
  if (span < 10) return null;
  const slope = linearSlope(sorted.map((l) => ({ x: (parseDate(l.logged_on).getTime() - t0) / 86400000, y: Number(l.weight_kg) })));
  return slope === null ? null : round(slope * 7, 2);
}

/** Media móvil de 7 días por fecha. */
export function movingAverage(logs: { logged_on: string; weight_kg: number }[], days = 7) {
  const sorted = [...logs].sort((a, b) => a.logged_on.localeCompare(b.logged_on));
  return sorted.map((l) => {
    const end = parseDate(l.logged_on).getTime();
    const win = sorted.filter((o) => {
      const t = parseDate(o.logged_on).getTime();
      return t <= end && t > end - days * 86400000;
    });
    return { date: l.logged_on, weight: Number(l.weight_kg), avg: round(win.reduce((a, o) => a + Number(o.weight_kg), 0) / win.length, 2) };
  });
}

export const fmtDate = (s: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }) =>
  parseDate(s).toLocaleDateString("es-PE", opts);
