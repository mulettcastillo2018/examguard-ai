import { getTranslations } from "next-intl/server";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { getInstitutionName } from "@/modules/institutions/institutions";
import type { CurrentUser } from "@/modules/auth/session";
import { AppSidebar } from "./app-sidebar";
import { NAVIGATION } from "./navigation";
import { UserMenu } from "./user-menu";

/** Marco común de las secciones privadas: barra lateral por rol y encabezado con el usuario. */
export async function AppShell({ user, children }: { user: CurrentUser; children: React.ReactNode }) {
  const t = await getTranslations("roles");
  const institutionName = await getInstitutionName(user.institutionId);
  const roleLabel = t(user.role);

  return (
    <SidebarProvider>
      <AppSidebar items={NAVIGATION[user.role]} institutionName={institutionName} roleLabel={roleLabel} />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
          <span className="truncate text-sm text-muted-foreground">{institutionName}</span>
          <div className="ml-auto">
            <UserMenu name={user.name} email={user.email} roleLabel={roleLabel} />
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
