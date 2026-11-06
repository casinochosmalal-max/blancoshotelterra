"use client";
import { useEffect, useId, useRef, useState } from "react";
import { CameraOff } from "lucide-react";

/**
 * Lector de QR con la cámara trasera (html5-qrcode). Llama onScan una sola vez
 * con el texto leído. Se carga dinámicamente porque la librería usa `window`.
 */
export function EscanerQR({ onScan }: { onScan: (texto: string) => void }) {
  const id = useId().replace(/:/g, "");
  const [error, setError] = useState<string | null>(null);
  const leido = useRef(false);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    let scanner: import("html5-qrcode").Html5Qrcode | null = null;
    let activo = true;
    (async () => {
      const { Html5Qrcode } = await import("html5-qrcode");
      if (!activo) return;
      scanner = new Html5Qrcode(`qr-${id}`);
      try {
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (texto) => {
            if (leido.current) return;
            leido.current = true;
            navigator.vibrate?.(100);
            onScanRef.current(texto);
          },
          () => {},
        );
      } catch {
        setError("No se pudo acceder a la cámara. Revisá los permisos del navegador.");
      }
    })();
    return () => {
      activo = false;
      if (scanner?.isScanning) scanner.stop().catch(() => {});
    };
  }, [id]);

  return (
    <div className="space-y-3">
      <div id={`qr-${id}`} className="overflow-hidden rounded-xl bg-black [&_video]:w-full" />
      {error && (
        <p className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          <CameraOff className="size-4" /> {error}
        </p>
      )}
    </div>
  );
}
