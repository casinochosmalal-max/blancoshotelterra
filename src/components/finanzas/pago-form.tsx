"use client";
import { useRef, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { registrarPago } from "@/app/actions/finanzas";
import { METODOS_PAGO } from "@/components/remitos/constantes";

export function PagoForm({ hoy, periodo }: { hoy: string; periodo?: string }) {
  const form = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Registrar pago al lavadero</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          ref={form}
          className="space-y-3"
          action={(fd) =>
            start(async () => {
              const r = await registrarPago(fd);
              if (!r.ok) return void toast.error(r.error);
              toast.success("Pago registrado");
              form.current?.reset();
            })
          }
        >
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>Fecha</Label>
              <Input type="date" name="fecha" defaultValue={hoy} required />
            </div>
            <div className="space-y-1">
              <Label>Monto</Label>
              <Input type="number" name="monto" min="0.01" step="0.01" inputMode="decimal" required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>Método</Label>
              <Select name="metodo" defaultValue="transferencia">
                {Object.entries(METODOS_PAGO).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Imputar a mes</Label>
              <Input type="month" name="periodo" defaultValue={periodo} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Nº comprobante</Label>
            <Input name="comprobante_nro" placeholder="Ej. transferencia 000123" />
          </div>
          <div className="space-y-1">
            <Label>Archivo del comprobante</Label>
            <Input type="file" name="comprobante" accept="image/*,application/pdf" />
          </div>
          <Textarea name="notas" placeholder="Notas" />
          <Button type="submit" className="w-full" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />} Registrar pago
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
