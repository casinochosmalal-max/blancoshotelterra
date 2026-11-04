export interface WhatsAppProvider {
  readonly nombre: string;
  enviarTexto(destino: string, mensaje: string): Promise<void>;
}

export type Destinatario = "hotel" | "lavadero";
