"use client";
import { useEffect, useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";
import { Eraser, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Panel de firma táctil. Devuelve un data URL PNG (recortado) por onChange,
 * o null si se borra. El canvas se adapta al ancho del contenedor y a la
 * densidad de pantalla para que el trazo sea nítido en celulares.
 */
export function FirmaDigital({ onChange, label = "Firma" }: { onChange: (dataUrl: string | null) => void; label?: string }) {
  const ref = useRef<SignatureCanvas>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [vacia, setVacia] = useState(true);

  useEffect(() => {
    const ajustar = () => {
      const canvas = ref.current?.getCanvas();
      if (!canvas || !wrap.current) return;
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const datos = ref.current?.isEmpty() ? null : ref.current?.toData();
      canvas.width = wrap.current.offsetWidth * ratio;
      canvas.height = 180 * ratio;
      canvas.style.width = `${wrap.current.offsetWidth}px`;
      canvas.style.height = "180px";
      canvas.getContext("2d")?.scale(ratio, ratio);
      ref.current?.clear();
      if (datos) ref.current?.fromData(datos);
    };
    ajustar();
    window.addEventListener("resize", ajustar);
    return () => window.removeEventListener("resize", ajustar);
  }, []);

  const terminar = () => {
    const sig = ref.current;
    if (!sig || sig.isEmpty()) return;
    setVacia(false);
    onChange(sig.getCanvas().toDataURL("image/png"));
  };

  const borrar = () => {
    ref.current?.clear();
    setVacia(true);
    onChange(null);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <PenLine className="size-4" /> {label}
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={borrar} disabled={vacia}>
          <Eraser /> Borrar
        </Button>
      </div>
      <div ref={wrap} className="relative overflow-hidden rounded-lg border-2 border-dashed bg-white">
        <SignatureCanvas
          ref={ref}
          penColor="#0f172a"
          minWidth={1}
          maxWidth={2.6}
          onEnd={terminar}
          canvasProps={{ className: "touch-none block", "aria-label": "Área de firma" }}
        />
        {vacia && (
          <span className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-slate-400">
            Firmá con el dedo aquí
          </span>
        )}
        <span className="pointer-events-none absolute bottom-8 left-6 right-6 border-b border-slate-300" />
      </div>
    </div>
  );
}
