"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  BookOpen,
  ClipboardList,
  FileQuestion,
  GraduationCap,
  House,
  ScrollText,
  ShieldCheck,
  ShieldHalf,
  Users,
  type LucideIcon,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import type { NavIcon, NavItem } from "./navigation";

const ICONS: Record<NavIcon, LucideIcon> = {
  home: House,
  users: Users,
  courses: BookOpen,
  audit: ScrollText,
  exams: ClipboardList,
  questions: FileQuestion,
  reviews: ShieldHalf,
  results: GraduationCap,
  privacy: ShieldCheck,
};

export function AppSidebar({
  items,
  institutionName,
  roleLabel,
}: {
  items: NavItem[];
  institutionName: string;
  roleLabel: string;
}) {
  const pathname = usePathname();
  const t = useTranslations();

  // Activo: la ruta exacta para el inicio de cada sección, el prefijo para las demás.
  const isActive = (href: string, index: number) =>
    index === 0 ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ShieldCheck className="size-4" aria-hidden />
          </div>
          <div className="grid min-w-0 text-sm leading-tight group-data-[collapsible=icon]:hidden">
            <span className="truncate font-semibold">{t("app.name")}</span>
            <span className="truncate text-xs text-muted-foreground">
              {roleLabel} · {institutionName}
            </span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item, index) => {
                const Icon = ICONS[item.icon];
                const label = t(`nav.${item.key}`);
                if (!item.href) {
                  return (
                    <SidebarMenuItem key={item.key}>
                      <SidebarMenuButton disabled tooltip={label} aria-disabled>
                        <Icon />
                        <span>{label}</span>
                      </SidebarMenuButton>
                      <SidebarMenuBadge>{t("nav.upcomingPhase", { phase: item.phase ?? 0 })}</SidebarMenuBadge>
                    </SidebarMenuItem>
                  );
                }
                return (
                  <SidebarMenuItem key={item.key}>
                    <SidebarMenuButton asChild isActive={isActive(item.href, index)} tooltip={label}>
                      <Link href={item.href}>
                        <Icon />
                        <span>{label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
