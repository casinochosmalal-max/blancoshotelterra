import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Cliente con la clave secreta (service role). Sólo se usa en el servidor,
 * después de verificar que quien llama es administrador. Nunca llega al navegador.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
