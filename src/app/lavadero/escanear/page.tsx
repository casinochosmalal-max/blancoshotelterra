"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EscanerQR } from "@/components/remitos/escaner-qr";

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export default function Escanear() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");

  const abrir = (texto: string) => {
    const id = texto.match(UUID)?.[0];
    if (!id) return setError("El código no corresponde a un remito");
    router.push(`/lavadero/remitos/${id}`);
  };

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Escanear remito</h1>
      <p className="text-sm text-muted-foreground">Apuntá la cámara al código QR impreso en el remito o en la bolsa.</p>
      <EscanerQR onScan={abrir} />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Card className="space-y-2 p-4">
        <p className="text-sm font-medium">¿No lee? Pegá el enlace del remito</p>
        <div className="flex gap-2">
          <Input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="https://…/r/…" />
          <Button onClick={() => abrir(manual)}>Abrir</Button>
        </div>
      </Card>
    </div>
  );
}
