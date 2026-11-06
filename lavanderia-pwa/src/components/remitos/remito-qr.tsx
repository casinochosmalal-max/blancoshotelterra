"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function urlRemito(id: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL || (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}/r/${id}`;
}

/** QR que apunta a /r/{id}: abre el remito en la vista del rol que lo escanea. */
export function RemitoQR({ id, size = 140 }: { id: string; size?: number }) {
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    QRCode.toDataURL(urlRemito(id), { margin: 1, width: size * 2 }).then(setSrc);
  }, [id, size]);
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} width={size} height={size} alt="Código QR del remito" className="rounded-md border bg-white p-1" /> : <div style={{ width: size, height: size }} className="animate-pulse rounded-md bg-muted" />;
}
