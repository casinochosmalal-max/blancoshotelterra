import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Lavandería · Terra Malal",
    short_name: "Lavandería TM",
    description: "Remitos de lavadero, stock de ropa blanca y liquidaciones.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#faf6f0",
    theme_color: "#5e2f25",
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
