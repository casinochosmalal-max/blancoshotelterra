import { LoginForm } from "./login-form";

export const metadata = { title: "Ingresar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <main className="grid min-h-dvh place-items-center bg-gradient-to-b from-accent to-background p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="mx-auto mb-3 grid size-14 place-items-center rounded-2xl bg-primary text-2xl text-primary-foreground shadow-lg">
            🧺
          </div>
          <h1 className="text-xl font-semibold">Lavandería Terra Blancos</h1>
          <p className="text-sm text-muted-foreground">Ingresá con tu usuario de hotel o lavadero</p>
        </div>
        {error === "sin-rol" && (
          <p className="rounded-md bg-warning/15 p-3 text-sm text-warning-foreground">
            Tu usuario todavía no tiene un rol asignado. Pedile a la administración que lo habilite.
          </p>
        )}
        <LoginForm next={next} />
      </div>
    </main>
  );
}
