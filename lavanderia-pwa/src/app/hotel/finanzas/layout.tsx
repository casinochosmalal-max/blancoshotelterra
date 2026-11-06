import { FinanzasNav } from "@/components/finanzas/finanzas-nav";

export default function FinanzasLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <FinanzasNav />
      {children}
    </>
  );
}
