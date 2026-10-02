import { AppShell } from "@/components/shell/app-shell";
import { requirePageUser } from "@/modules/auth/session";

export default async function StudentLayout({ children }: LayoutProps<"/student">) {
  const user = await requirePageUser({ roles: ["STUDENT"] });
  return <AppShell user={user}>{children}</AppShell>;
}
