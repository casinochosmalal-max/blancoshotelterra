const moneda = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const numero = new Intl.NumberFormat("es-AR");

export const fmtMoneda = (n: number | string | null | undefined) => moneda.format(Number(n ?? 0));
export const fmtNumero = (n: number | string | null | undefined) => numero.format(Number(n ?? 0));

export function fmtFecha(d: string | Date | null | undefined, conHora = false) {
  if (!d) return "—";
  // Las columnas `date` llegan como "YYYY-MM-DD": se interpretan en hora local, no UTC.
  const date = typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T12:00:00`) : new Date(d);
  return date.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(conHora ? { hour: "2-digit", minute: "2-digit" } : {}),
    timeZone: "America/Argentina/Buenos_Aires",
  });
}

export function fmtPeriodo(periodo: string) {
  const d = new Date(`${periodo.slice(0, 10)}T12:00:00`);
  const s = d.toLocaleDateString("es-AR", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Primer día del mes "YYYY-MM-01" a partir de "YYYY-MM" o fecha. */
export function inicioMes(valor?: string) {
  const base = valor ? new Date(`${valor.slice(0, 7)}-01T12:00:00`) : new Date();
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-01`;
}
