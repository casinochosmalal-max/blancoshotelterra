import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Lavandería · Hotel Terra Blancos",
    short_name: "Lavandería TB",
    description: "Remitos de lavadero, stock de ropa blanca y liquidaciones.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f8fafc",
    theme_color: "#0c6b96",
    lang: "es-AR",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Escanear remito", url: "/lavadero/escanear" },
      { name: "Nuevo envío", url: "/hotel/remitos/nuevo" },
    ],
  };
}
