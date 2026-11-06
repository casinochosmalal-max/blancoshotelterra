import Image from "next/image";
import { cn } from "@/lib/utils";

/** Logo completo de Terra Malal (emblema + nombre). */
export function LogoTerraMalal({ className, priority }: { className?: string; priority?: boolean }) {
  return (
    <Image
      src="/brand/logo.png"
      alt="Terra Malal · Chos Malal, Patagonia"
      width={600}
      height={194}
      priority={priority}
      className={cn("h-auto w-auto object-contain", className)}
    />
  );
}

/** Emblema solo, para cabeceras compactas. */
export function EmblemaTerraMalal({ className }: { className?: string }) {
  return <Image src="/brand/emblema.png" alt="" width={192} height={192} className={cn("object-contain", className)} aria-hidden />;
}
