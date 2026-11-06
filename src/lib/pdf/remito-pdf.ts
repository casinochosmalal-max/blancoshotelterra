import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import QRCode from "qrcode";
import type { DetalleRemito, Observacion, RemitoVista } from "@/types/database";
import { fmtFecha, fmtMoneda } from "@/lib/format";

const ESTADO_TXT: Record<string, string> = {
  borrador: "BORRADOR",
  enviado: "ENVIADO",
  recibido: "RECIBIDO",
  despachado: "DESPACHADO",
  cerrado: "CERRADO",
  anulado: "ANULADO",
};

async function cargarLogo(): Promise<string | null> {
  try {
    const blob = await (await fetch("/brand/logo.png")).blob();
    return await new Promise((ok) => {
      const r = new FileReader();
      r.onload = () => ok(r.result as string);
      r.onerror = () => ok(null);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * Genera el PDF del remito (A4) con detalle, observaciones, firmas y QR.
 * `conPrecios` = false para la copia del lavadero si se quiere ocultar importes.
 */
export async function generarRemitoPDF(
  remito: RemitoVista,
  detalle: DetalleRemito[],
  observaciones: Observacion[],
  { urlQR, conPrecios = true }: { urlQR: string; conPrecios?: boolean },
) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const ancho = doc.internal.pageSize.getWidth();
  const azul: [number, number, number] = [94, 47, 37]; // marrón Terra Malal

  // Encabezado: logo Terra Malal + código del remito
  const logo = await cargarLogo();
  if (logo) doc.addImage(logo, "PNG", 14, 6, 52, 17);
  else doc.setFont("helvetica", "bold").setFontSize(16).setTextColor(...azul).text("Hotel Terra Malal", 14, 14);
  doc.setTextColor(...azul);
  doc.setFont("helvetica", "bold").setFontSize(14).text(remito.codigo, ancho - 14, 12, { align: "right" });
  doc.setFont("helvetica", "normal").setFontSize(9).text(`Remito de lavandería · ${ESTADO_TXT[remito.estado] ?? remito.estado}`, ancho - 14, 19, { align: "right" });
  doc.setDrawColor(...azul).setLineWidth(0.6).line(14, 27, ancho - 14, 27);

  const qr = await QRCode.toDataURL(urlQR, { margin: 0, width: 240 });
  doc.addImage(qr, "PNG", ancho - 44, 33, 30, 30);

  doc.setTextColor(30);
  doc.setFontSize(10);
  const info: [string, string][] = [
    ["Edificio", remito.edificio_nombre],
    ["Fecha", `${fmtFecha(remito.fecha)} · envío Nº ${remito.nro_envio_dia} del día`],
    ["Enviado", fmtFecha(remito.enviado_at, true)],
    ["Recibido por lavadero", fmtFecha(remito.recibido_at, true) + (remito.conforme === false ? " (con observaciones)" : remito.conforme ? " (conforme)" : "")],
    ["Despachado", fmtFecha(remito.despachado_at, true)],
    ["Cerrado", fmtFecha(remito.cerrado_at, true)],
  ];
  info.forEach(([k, v], i) => {
    doc.setFont("helvetica", "bold").text(`${k}:`, 14, 38 + i * 5.5);
    doc.setFont("helvetica", "normal").text(v, 58, 38 + i * 5.5);
  });

  // Detalle
  const cabecera = ["Artículo", "Enviado", "Recibido", "Devuelto", "Validado", ...(conPrecios ? ["P. unit.", "Subtotal"] : [])];
  const filas = detalle.map((d) => [
    d.articulos?.nombre ?? `#${d.articulo_id}`,
    d.cantidad_enviada,
    d.cantidad_recibida ?? "—",
    d.cantidad_devuelta ?? "—",
    d.cantidad_validada ?? "—",
    ...(conPrecios ? [fmtMoneda(d.precio_unitario_historico), fmtMoneda(d.subtotal)] : []),
  ]);
  const total = (k: keyof DetalleRemito) => detalle.reduce((s, d) => s + Number(d[k] ?? 0), 0);

  autoTable(doc, {
    startY: 72,
    head: [cabecera],
    body: filas,
    foot: [["Total", total("cantidad_enviada"), total("cantidad_recibida"), total("cantidad_devuelta"), total("cantidad_validada"), ...(conPrecios ? ["", fmtMoneda(total("subtotal"))] : [])]],
    theme: "grid",
    headStyles: { fillColor: azul },
    footStyles: { fillColor: [245, 239, 230], textColor: 20, fontStyle: "bold" },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" } },
    styles: { fontSize: 9 },
  });

  // Observaciones
  let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  if (observaciones.length) {
    autoTable(doc, {
      startY: y,
      head: [["Etapa", "Tipo", "Artículo", "Cant.", "Cargo de", "Estado", ...(conPrecios ? ["Cargo $"] : []), "Detalle"]],
      body: observaciones.map((o) => [
        o.etapa,
        o.tipo,
        o.articulos?.nombre ?? "—",
        o.cantidad,
        o.responsable,
        o.estado,
        ...(conPrecios ? [Number(o.importe_cargo) > 0 ? fmtMoneda(o.importe_cargo) : "—"] : []),
        o.descripcion ?? "",
      ]),
      theme: "striped",
      headStyles: { fillColor: [180, 83, 9] },
      styles: { fontSize: 8 },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }

  // Firmas
  const firmas: [string, string | null][] = [
    ["Recepción lavadero", remito.firma_recepcion],
    ["Despacho lavadero", remito.firma_despacho],
    ["Recepción hotel", remito.firma_cierre],
  ];
  if (y > 240) {
    doc.addPage();
    y = 20;
  }
  const w = (ancho - 28 - 10) / 3;
  firmas.forEach(([label, img], i) => {
    const x = 14 + i * (w + 5);
    if (img) {
      try {
        doc.addImage(img, "PNG", x, y, w, 22);
      } catch {
        /* firma corrupta: se omite */
      }
    }
    doc.setDrawColor(150).line(x, y + 24, x + w, y + 24);
    doc.setFontSize(8).setTextColor(90).text(label, x + w / 2, y + 28, { align: "center" });
  });

  doc.setFontSize(7).setTextColor(140).text(`Generado ${new Date().toLocaleString("es-AR")}`, 14, 290);
  return doc;
}
