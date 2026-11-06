import type { WhatsAppProvider } from "./types";

function requerido(nombre: string) {
  const v = process.env[nombre];
  if (!v) throw new Error(`Falta la variable de entorno ${nombre}`);
  return v;
}

async function verificar(res: Response, proveedor: string) {
  if (!res.ok) {
    const cuerpo = await res.text().catch(() => "");
    throw new Error(`${proveedor} respondió ${res.status}: ${cuerpo.slice(0, 200)}`);
  }
}

/** Evolution API (open source, self-hosted, basado en Baileys). */
export class EvolutionProvider implements WhatsAppProvider {
  readonly nombre = "evolution";
  async enviarTexto(destino: string, mensaje: string) {
    const base = requerido("EVOLUTION_API_URL").replace(/\/$/, "");
    const instancia = requerido("EVOLUTION_INSTANCE");
    const res = await fetch(`${base}/message/sendText/${encodeURIComponent(instancia)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: requerido("EVOLUTION_API_KEY") },
      body: JSON.stringify({ number: destino, text: mensaje }),
    });
    await verificar(res, "Evolution API");
  }
}

/** UltraMsg (SaaS con plan de prueba). */
export class UltraMsgProvider implements WhatsAppProvider {
  readonly nombre = "ultramsg";
  async enviarTexto(destino: string, mensaje: string) {
    const instancia = requerido("ULTRAMSG_INSTANCE_ID");
    const body = new URLSearchParams({ token: requerido("ULTRAMSG_TOKEN"), to: `+${destino}`, body: mensaje });
    const res = await fetch(`https://api.ultramsg.com/${encodeURIComponent(instancia)}/messages/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    await verificar(res, "UltraMsg");
  }
}

/**
 * CallMeBot: gratuito pero cada número debe activar su propia apikey
 * (sólo sirve para avisarse a uno mismo). CALLMEBOT_RECIPIENTS=numero:apikey,...
 */
export class CallMeBotProvider implements WhatsAppProvider {
  readonly nombre = "callmebot";
  async enviarTexto(destino: string, mensaje: string) {
    const pares = Object.fromEntries(
      (process.env.CALLMEBOT_RECIPIENTS ?? "").split(",").filter(Boolean).map((p) => p.split(":") as [string, string]),
    );
    const apikey = pares[destino];
    if (!apikey) throw new Error(`CallMeBot: no hay apikey para ${destino}`);
    const url = `https://api.callmebot.com/whatsapp.php?phone=${destino}&text=${encodeURIComponent(mensaje)}&apikey=${apikey}`;
    await verificar(await fetch(url), "CallMeBot");
  }
}

/** Sin proveedor: deja el mensaje en el log del servidor (útil en desarrollo). */
export class ConsolaProvider implements WhatsAppProvider {
  readonly nombre = "none";
  async enviarTexto(destino: string, mensaje: string) {
    console.info(`[whatsapp:none] -> ${destino}\n${mensaje}`);
  }
}

export function crearProveedor(): WhatsAppProvider {
  switch ((process.env.WHATSAPP_PROVIDER ?? "none").toLowerCase()) {
    case "evolution":
      return new EvolutionProvider();
    case "ultramsg":
      return new UltraMsgProvider();
    case "callmebot":
      return new CallMeBotProvider();
    default:
      return new ConsolaProvider();
  }
}
