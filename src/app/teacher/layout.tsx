import { AppShell } from "@/components/shell/app-shell";
import { requirePageUser } from "@/modules/auth/session";

export default async function TeacherLayout({ children }: LayoutProps<"/teacher">) {
  const user = await requirePageUser({ roles: ["TEACHER"] });
  return <AppShell user={user}>{children}</AppShell>;
}
