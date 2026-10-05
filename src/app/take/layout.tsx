import { requirePageUser } from "@/modules/auth/session";

// Presentar el examen: pantalla limpia, sin la barra lateral, para concentrarse.
export default async function TakeLayout({ children }: LayoutProps<"/take">) {
  await requirePageUser({ roles: ["STUDENT"] });
  return <div className="min-h-svh bg-background">{children}</div>;
}
