import type { Role } from "@/modules/rbac";

// Navegación por rol. Las secciones de fases futuras se muestran deshabilitadas con su
// número de fase, para que el avance del proyecto sea visible en el propio producto.
export type NavIcon = "home" | "users" | "courses" | "audit" | "exams" | "questions" | "reviews" | "results" | "privacy";

export interface NavItem {
  key: "overview" | "users" | "courses" | "audit" | "exams" | "questionBank" | "reviews" | "myExams" | "results" | "myData";
  icon: NavIcon;
  href?: string;
  phase?: number;
}

export const NAVIGATION: Record<Role, NavItem[]> = {
  ADMIN: [
    { key: "overview", icon: "home", href: "/admin" },
    { key: "users", icon: "users", href: "/admin/users" },
    { key: "courses", icon: "courses", href: "/admin/courses" },
    { key: "audit", icon: "audit", href: "/admin/audit" },
    { key: "reviews", icon: "reviews", href: "/admin/reviews" },
  ],
  TEACHER: [
    { key: "overview", icon: "home", href: "/teacher" },
    { key: "exams", icon: "exams", href: "/teacher/exams" },
    { key: "questionBank", icon: "questions", href: "/teacher/question-bank" },
    { key: "reviews", icon: "reviews", href: "/teacher/reviews" },
  ],
  STUDENT: [
    { key: "overview", icon: "home", href: "/student" },
    { key: "myExams", icon: "exams", href: "/student/exams" },
    { key: "results", icon: "results", href: "/student/results" },
    { key: "myData", icon: "privacy", href: "/student/my-data" },
  ],
};
