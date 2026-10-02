import { AppShell } from "@/components/shell/app-shell";
import { requirePageUser } from "@/modules/auth/session";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await requirePageUser({ roles: ["ADMIN"] });
  return <AppShell user={user}>{children}</AppShell>;
}
