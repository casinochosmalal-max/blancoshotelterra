import { redirect } from "next/navigation";
import { getPerfil, inicioDeRol } from "@/lib/auth";

export default async function Home() {
  const perfil = await getPerfil();
  redirect(inicioDeRol(perfil.rol!));
}
