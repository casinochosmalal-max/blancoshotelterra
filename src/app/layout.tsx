import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import { RegistrarServiceWorker } from "@/components/layout/registrar-sw";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Lavandería · Terra Blancos", template: "%s · Lavandería Terra Blancos" },
  description: "Gestión de ropa blanca, remitos de lavadero y liquidaciones del hotel.",
  applicationName: "Lavandería TB",
  appleWebApp: { capable: true, title: "Lavandería TB", statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#0c6b96",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR">
      <body className="min-h-dvh">
        {children}
        <Toaster richColors position="top-center" />
        <RegistrarServiceWorker />
      </body>
    </html>
  );
}
