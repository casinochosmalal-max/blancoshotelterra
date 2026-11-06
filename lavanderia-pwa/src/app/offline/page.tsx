import { WifiOff } from "lucide-react";

export default function Offline() {
  return (
    <main className="grid min-h-dvh place-items-center p-6 text-center">
      <div className="space-y-3">
        <WifiOff className="mx-auto size-10 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Sin conexión</h1>
        <p className="text-sm text-muted-foreground">
          Revisá la señal y volvé a intentar. Los remitos necesitan conexión para registrar conteos y firmas.
        </p>
      </div>
    </main>
  );
}
