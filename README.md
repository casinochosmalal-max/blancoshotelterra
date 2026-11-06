# Lavandería · Hotel Terra Malal

PWA (mobile-first y escritorio) para gestionar la ropa blanca de los dos edificios del hotel: stock por ubicación, remitos de envío al lavadero con conteo y firma táctil, roturas y faltantes, liquidación mensual y pagos.

**Stack:** Next.js 15 (App Router) · React 19 · Tailwind + componentes estilo shadcn/ui · Lucide · Supabase (Postgres, Auth, RLS, Realtime, Storage) · jsPDF · html5-qrcode · react-signature-canvas · Recharts. Todo en planes gratuitos (Supabase Free + Vercel Hobby).

---

## Puesta en marcha

1. **Crear el proyecto en Supabase** (plan Free).
2. **Ejecutar el SQL**, en orden, desde *SQL Editor* (o con `supabase db push` si usás la CLI):
   - `supabase/migrations/0001_esquema.sql`: tipos, tablas, claves foráneas e índices
   - `supabase/migrations/0002_logica_negocio.sql`: triggers de stock, máquina de estados y RPCs
   - `supabase/migrations/0003_rls.sql`: Row Level Security y privilegios por columna
   - `supabase/migrations/0004_vistas.sql`: vistas de stock, alertas, liquidación y cuenta corriente
   - `supabase/migrations/0005_storage.sql`: buckets `comprobantes` e `incidencias`
   - `supabase/migrations/0006_admin_usuarios.sql` y `0007_pendientes_entrega.sql`
   - `supabase/seed.sql`: edificios A/B, artículos con precios y stock inicial (ajustar)
3. **Usuarios**: en *Authentication > Users* crear los 3 usuarios (2 hotel y 1 lavadero), desactivar el registro público (*Auth > Providers > Email > Allow new users to sign up = off*) y asignar el rol con el SQL que está al final de `seed.sql`. El rol vive en `raw_app_meta_data`, que el usuario no puede modificar.
4. **Variables de entorno**: copiar `.env.example` a `.env.local` y completar.
5. `npm install && npm run dev`, luego abrir http://localhost:3000.
6. **Deploy**: subir el repo a GitHub, importarlo en Vercel y cargar las mismas variables de entorno.

`npm run test:db` corre el ciclo completo (envío, recepción con faltante, roturas, despacho, cierre, liquidación, límites de 2 envíos diarios, RLS por rol) contra un Postgres embebido (PGlite), sin necesidad de Supabase.

---

## Estructura

```
supabase/
  migrations/0001…0005.sql   Esquema, lógica, RLS, vistas, storage
  seed.sql                   Datos iniciales
scripts/test-db.mjs          Prueba end-to-end del SQL (PGlite)
public/sw.js, icons/         Service worker + íconos PWA
src/
  middleware.ts              Refresca la sesión de Supabase y protege rutas
  app/
    login/                   Ingreso
    r/[id]/                  Destino de los QR → abre el remito según el rol
    lavadero/                Vista móvil del lavadero (rol 'lavadero')
      page.tsx               Por recibir / En lavado / Despachados
      remitos/[id]/          Conteo de recepción o despacho + firma
      escanear/              Lector QR con la cámara
    hotel/                   Vista del hotel (rol 'hotel')
      page.tsx               Panel general: KPIs, remitos en curso, alertas
      stock/                 Stock por edificio y ubicación, mínimos, movimientos
      remitos/               Listado, nuevo envío, detalle, validación y cierre
      observaciones/         Aprobar o rechazar roturas y faltantes
      finanzas/              Dashboard, liquidación mensual, pagos y cuenta corriente
      precios/               Maestro de precios con historial
    actions/                 Server Actions (llaman a las RPC + WhatsApp)
  components/
    ui/                      Button, Card, Input, Badge, Table, Stat (shadcn)
    remitos/                 ConteoRemito, FirmaDigital, EscanerQR, RemitoQR, BotonPDF…
    stock/                   AlertasStock, TransferenciaForm, MinimoEditable
    finanzas/                Gráficos, PagoForm, PreciosEditor
    layout/                  Shells, notificaciones Realtime, refresco en vivo
  lib/
    supabase/                Clientes browser / server / middleware (@supabase/ssr)
    whatsapp/                Proveedores intercambiables por variable de entorno
    pdf/remito-pdf.ts        Remito A4 con detalle, observaciones, firmas y QR
  types/database.ts          Tipos de dominio
```

---

## Modelo y reglas de negocio

**Stock** = `stock_edificio(edificio, artículo, ubicación)` con ubicaciones `habitaciones`, `deposito` y `lavadero`. Ninguna cantidad se edita a mano: todo pasa por `aplicar_movimiento()`, que valida que no quede negativo y deja una fila en `movimientos_stock` (auditoría).

**Ciclo del remito** (máquina de estados validada por trigger):

| Estado | Quién | Qué pasa con el stock |
|---|---|---|
| `borrador` → `enviado` | Hotel (`enviar_remito`) | Depósito (u Habitaciones) → **En lavadero** |
| `enviado` → `recibido` | Lavadero (`recepcionar_remito`) cuenta, observa y firma | Diferencias se registran como faltante/sobrante automático |
| `recibido` → `despachado` | Lavadero (`despachar_remito`) informa devueltas y firma | — |
| `despachado` → `cerrado` | Hotel (`cerrar_remito`) valida el ingreso y firma | En lavadero → **Depósito** (cantidad validada) |
| `borrador`/`enviado` → `anulado` | Hotel | Si estaba enviado, revierte el movimiento |

- **Máximo 2 envíos por edificio y día**: índice único parcial + trigger con lock; un remito anulado libera su número. Código legible `A-20261104-1`.
- **Precio histórico**: al cargar el detalle se copia `precio_unitario_actual` a `precio_unitario_historico`. Cada cambio de precio queda en `precios_historicos` con % de variación y motivo.
- **Facturación**: se paga lo que el lavadero recibió y aceptó (`cantidad_recibida × precio histórico`), sólo de remitos cerrados.
- **Roturas y faltantes**: al aprobarse dan de baja la prenda de "En lavadero". Si son **a cargo del lavadero**, generan un cargo de `cantidad × costo_reposicion` que se descuenta en la liquidación; si son **a cargo del hotel**, sólo se da de baja, sin cargo. Las que reporta el lavadero quedan pendientes de aprobación del hotel; las del hotel se aprueban solas.
- **Prendas pendientes de entrega** (`0007_pendientes_entrega.sql`): si el lavadero despacha menos de lo recibido y no es rotura ni faltante (p. ej. una mancha que se relava), la diferencia queda pendiente. El lavadero la ve en *A entregar*, el hotel en *A recibir*, y en el próximo despacho de esa torre se suma al remito; el hotel la valida al cerrarlo. No se paga en el remito original sino en el que se entrega (al precio original). El hotel puede darla por perdida (faltante con o sin cargo).
- **Stock de seguridad**: `stock_minimo` por edificio y artículo en el depósito; `v_alertas_stock` marca advertencia o crítica (por debajo de la mitad del mínimo o en cero).

**Seguridad (RLS):** el hotel ve y gestiona todo. El lavadero sólo ve remitos ya enviados (de ambos edificios), su detalle, observaciones y pendientes, y puede crear observaciones en recepción y despacho. En *Resumen* ve sus montos por semana y mes (lavado, descuentos, pagos recibidos y saldo); no ve stock, precios históricos ni las vistas financieras del hotel. Los cambios de estado sólo se hacen por RPC, y los privilegios por columna impiden editar cantidades, estados o roles a mano.

---

## WhatsApp

`WHATSAPP_PROVIDER` elige el proveedor sin tocar código:

| Valor | Notas |
|---|---|
| `evolution` | Evolution API (open source, self-hosted, basado en Baileys). Gratis si se hospeda. |
| `ultramsg` | SaaS con prueba gratuita. |
| `callmebot` | Gratis, pero cada destinatario activa su propia apikey. |
| `none` | Sólo lo escribe en el log del servidor (desarrollo). |

Se envía automáticamente cuando el hotel genera un envío (al lavadero), cuando el lavadero reporta observaciones o recepción conforme (al hotel) y cuando el lavadero despacha (al hotel). Para sumar otro proveedor alcanza con implementar `WhatsAppProvider` en `src/lib/whatsapp/providers.ts`. Una falla del proveedor nunca bloquea la operación del remito.

Además hay notificaciones dentro de la app (tabla `notificaciones` + Supabase Realtime) con campana, toast y vibración, y los paneles se refrescan solos cuando el otro rol mueve algo.

---

## PWA, PDF y QR

- `manifest.webmanifest` + service worker (`public/sw.js`): instalable en Android/iOS, página offline. No cachea datos para no mostrar stock viejo.
- Cada remito tiene un QR que apunta a `/r/{id}` y abre la pantalla correcta según quién lo escanee. El lavadero puede escanearlo desde *Escanear QR*.
- **PDF**: botón en cada remito que genera un A4 con detalle, observaciones, las tres firmas y el QR. La liquidación mensual se imprime o guarda como PDF desde el navegador.

---

## Administración de usuarios

La pantalla **Usuarios** (menú del hotel) sólo aparece para perfiles con `es_admin = true`; la migración `0006_admin_usuarios.sql` se lo asigna a casinochosmalal@gmail.com. Permite crear usuarios (con rol y contraseña inicial), editar nombre, email, rol y WhatsApp, cambiar contraseñas, desactivar/reactivar (bloquea el ingreso sin borrar historial) y eliminar.

Necesita la variable `SUPABASE_SERVICE_ROLE_KEY` (Secret key de Supabase) en Vercel. Esa clave sólo se usa en el servidor y después de verificar que quien llama es administrador.
