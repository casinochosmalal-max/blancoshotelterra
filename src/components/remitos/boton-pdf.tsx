"use client";
import { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button, type ButtonProps } from "@/components/ui/button";
import type { DetalleRemito, Observacion, RemitoVista } from "@/types/database";
import { urlRemito } from "./remito-qr";

export function BotonPDF({
  remito,
  detalle,
  observaciones,
  conPrecios = true,
  ...props
}: { remito: RemitoVista; detalle: DetalleRemito[]; observaciones: Observacion[]; conPrecios?: boolean } & ButtonProps) {
  const [cargando, setCargando] = useState(false);
  return (
    <Button
      variant="outline"
      {...props}
      disabled={cargando}
      onClick={async () => {
        setCargando(true);
        try {
          const { generarRemitoPDF } = await import("@/lib/pdf/remito-pdf");
          const doc = await generarRemitoPDF(remito, detalle, observaciones, { urlQR: urlRemito(remito.id), conPrecios });
          doc.save(`remito-${remito.codigo}.pdf`);
        } catch (e) {
          toast.error("No se pudo generar el PDF");
          console.error(e);
        } finally {
          setCargando(false);
        }
      }}
    >
      {cargando ? <Loader2 className="animate-spin" /> : <FileDown />} PDF
    </Button>
  );
}
