import type { EstadoRemito, TipoObservacion, Ubicacion, MetodoPago } from "@/types/database";

export const ESTADOS: Record<EstadoRemito, { label: string; variant: "secondary" | "info" | "warning" | "success" | "destructive" | "outline"; paso: number }> = {
  borrador: { label: "Borrador", variant: "outline", paso: 0 },
  enviado: { label: "Enviado · a recepcionar", variant: "info", paso: 1 },
  recibido: { label: "En lavado", variant: "warning", paso: 2 },
  despachado: { label: "Despachado · a validar", variant: "info", paso: 3 },
  cerrado: { label: "Cerrado", variant: "success", paso: 4 },
  anulado: { label: "Anulado", variant: "destructive", paso: -1 },
};

export const TIPOS_OBS: Record<TipoObservacion, string> = {
  faltante: "Faltante",
  rotura: "Rotura",
  mancha: "Mancha / no salió",
  sobrante: "Sobrante",
  otro: "Otro",
};

export const UBICACIONES: Record<Ubicacion, string> = {
  habitaciones: "Habitaciones",
  deposito: "Depósito central",
  lavadero: "En lavadero",
};

export const METODOS_PAGO: Record<MetodoPago, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  cheque: "Cheque",
  mercado_pago: "Mercado Pago",
  otro: "Otro",
};
