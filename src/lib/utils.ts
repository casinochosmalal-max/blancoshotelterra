import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Ordena artículos de stock: primero los que tienen prendas en depósito o habitaciones, luego por el orden del maestro. */
export function conStockPrimero<T extends { deposito: number; habitaciones: number; orden: number }>(filas: T[]): T[] {
  const grupo = (f: T) => (f.deposito > 0 || f.habitaciones > 0 ? 0 : 1);
  return [...filas].sort((a, b) => grupo(a) - grupo(b) || a.orden - b.orden);
}
