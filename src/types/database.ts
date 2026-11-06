// Tipos de dominio que reflejan supabase/migrations. Si usás la CLI de Supabase podés
// reemplazarlos por los generados con: npx supabase gen types typescript --linked
export type Rol = "hotel" | "lavadero";
export type Ubicacion = "habitaciones" | "deposito" | "lavadero";
export type EstadoRemito = "borrador" | "enviado" | "recibido" | "despachado" | "cerrado" | "anulado";
export type TipoObservacion = "faltante" | "rotura" | "mancha" | "sobrante" | "otro";
export type Responsable = "hotel" | "lavadero";
export type EstadoObservacion = "pendiente" | "aprobada" | "rechazada";
export type Etapa = "recepcion" | "despacho" | "validacion";
export type MetodoPago = "efectivo" | "transferencia" | "cheque" | "mercado_pago" | "otro";

export interface Perfil {
  id: string;
  nombre: string;
  rol: Rol | null;
  telefono_whatsapp: string | null;
  activo: boolean;
  es_admin?: boolean;
}

export interface UsuarioAdmin {
  id: string;
  email: string;
  nombre: string;
  rol: Rol | null;
  telefono_whatsapp: string | null;
  activo: boolean;
  es_admin: boolean;
  ultimo_ingreso: string | null;
  creado: string;
}

export interface Edificio {
  id: number;
  codigo: string;
  nombre: string;
  direccion: string | null;
  activo: boolean;
}

export interface Articulo {
  id: number;
  codigo: string;
  nombre: string;
  categoria: "cama" | "baño" | "otros";
  precio_unitario_actual: number;
  costo_reposicion: number;
  orden: number;
  activo: boolean;
}

export interface PrecioHistorico {
  id: number;
  articulo_id: number;
  precio_anterior: number | null;
  precio_nuevo: number;
  variacion_pct: number | null;
  vigente_desde: string;
  motivo: string | null;
}

export interface StockResumen {
  edificio_id: number;
  edificio_codigo: string;
  edificio_nombre: string;
  articulo_id: number;
  articulo_codigo: string;
  articulo_nombre: string;
  categoria: string;
  orden: number;
  habitaciones: number;
  deposito: number;
  lavadero: number;
  total: number;
  stock_minimo: number;
  bajo_minimo: boolean;
}

export interface AlertaStock {
  edificio_id: number;
  edificio_codigo: string;
  edificio_nombre: string;
  articulo_id: number;
  articulo_nombre: string;
  deposito: number;
  stock_minimo: number;
  faltan: number;
  nivel: "critica" | "advertencia";
}

export interface Remito {
  id: string;
  numero: number;
  codigo: string;
  edificio_id: number;
  fecha: string;
  nro_envio_dia: number;
  ubicacion_origen: Ubicacion;
  estado: EstadoRemito;
  conforme: boolean | null;
  tiene_observaciones: boolean;
  notas: string | null;
  created_at: string;
  enviado_at: string | null;
  recibido_at: string | null;
  firma_recepcion: string | null;
  despachado_at: string | null;
  firma_despacho: string | null;
  cerrado_at: string | null;
  firma_cierre: string | null;
  anulado_motivo: string | null;
}

export interface RemitoVista extends Remito {
  edificio_codigo: string;
  edificio_nombre: string;
  prendas_enviadas: number;
  prendas_recibidas: number | null;
  prendas_devueltas: number | null;
  prendas_validadas: number | null;
  importe: number;
  observaciones_pendientes: number;
  prendas_retenidas?: number;
  prendas_pendientes_incluidas?: number;
}

export type EstadoPendiente = "pendiente" | "en_camino" | "entregada" | "perdida";

/** Prendas que el lavadero retuvo en un despacho y entrega en un remito posterior. */
export interface PendienteEntrega {
  id: number;
  edificio_id: number;
  articulo_id: number;
  remito_origen_id: string;
  cantidad: number;
  motivo: string | null;
  precio_unitario: number;
  estado: EstadoPendiente;
  remito_entrega_id: string | null;
  created_at: string;
  entregada_at: string | null;
  edificio_nombre: string;
  articulo_nombre: string;
  articulo_orden: number;
  remito_origen_codigo: string;
  remito_origen_fecha: string;
  remito_entrega_codigo: string | null;
}

export interface ItemPendiente {
  id: number;
  cantidad: number;
}

export interface DetalleRemito {
  id: number;
  remito_id: string;
  articulo_id: number;
  cantidad_enviada: number;
  cantidad_recibida: number | null;
  cantidad_devuelta: number | null;
  cantidad_validada: number | null;
  precio_unitario_historico: number;
  subtotal: number;
  articulos?: Pick<Articulo, "nombre" | "codigo" | "categoria" | "orden">;
}

export interface Observacion {
  id: number;
  remito_id: string;
  articulo_id: number | null;
  etapa: Etapa;
  tipo: TipoObservacion;
  responsable: Responsable;
  cantidad: number;
  descripcion: string | null;
  foto_url: string | null;
  estado: EstadoObservacion;
  automatica: boolean;
  cargo_unitario: number;
  importe_cargo: number;
  created_at: string;
  resolucion_nota: string | null;
  articulos?: Pick<Articulo, "nombre"> | null;
}

export interface Pago {
  id: number;
  fecha: string;
  monto: number;
  metodo: MetodoPago;
  comprobante_nro: string | null;
  comprobante_url: string | null;
  periodo: string | null;
  notas: string | null;
  created_at: string;
}

export interface LiquidacionMensual {
  periodo: string;
  edificio_id: number;
  edificio_codigo: string;
  edificio_nombre: string;
  remitos: number;
  prendas: number;
  importe_lavado: number;
  cargos_lavadero: number;
  incidencias: number;
  neto: number;
}

export interface ConciliacionMensual {
  periodo: string;
  remitos: number;
  prendas: number;
  importe_lavado: number;
  cargos_lavadero: number;
  neto: number;
  pagado: number;
  saldo: number;
  estado: "pagado" | "parcial" | "pendiente";
}

export interface MovimientoCuenta {
  fecha: string;
  concepto: string;
  debe: number;
  haber: number;
  saldo: number;
}

/** Item que se envía a las RPC de recepción / despacho / cierre. */
export interface ItemConteo {
  articulo_id: number;
  cantidad: number;
}

export interface ObservacionInput {
  articulo_id: number | null;
  tipo: TipoObservacion;
  responsable: Responsable;
  cantidad: number;
  descripcion?: string;
  foto_url?: string;
}
