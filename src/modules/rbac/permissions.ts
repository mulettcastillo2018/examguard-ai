// Control de acceso por rol (sección 5 de la especificación).
// El rol responde "¿puede este tipo de usuario hacer esto?". El alcance ("¿es su
// institución?, ¿es su curso?, ¿es su intento?") lo verifica cada servicio.

export const ROLES = ["ADMIN", "TEACHER", "STUDENT"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "institution:manage",
  "users:manage",
  "courses:manage",
  "policies:manage",
  "audit:read",
  "exams:read",
  "exams:manage",
  "questions:manage",
  "results:read",
  "sessions:review",
  "events:read",
  "reports:export",
  "exams:take",
  "results:read-own",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  // Administrador / Rector: gobierno de la institución y consulta de todo lo académico.
  ADMIN: [
    "institution:manage",
    "users:manage",
    "courses:manage",
    "policies:manage",
    "audit:read",
    "exams:read",
    "results:read",
    "sessions:review",
    "events:read",
  ],
  // Docente: sus exámenes, su banco de preguntas y la revisión de sus cursos.
  TEACHER: [
    "exams:read",
    "exams:manage",
    "questions:manage",
    "results:read",
    "sessions:review",
    "events:read",
    "reports:export",
  ],
  // Estudiante: presentar exámenes y ver sus propios resultados publicados.
  STUDENT: ["exams:take", "results:read-own"],
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function permissionsOf(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}

/** Sección de la aplicación que corresponde a cada rol. */
export const ROLE_HOME: Record<Role, "/admin" | "/teacher" | "/student"> = {
  ADMIN: "/admin",
  TEACHER: "/teacher",
  STUDENT: "/student",
};

/** Rol dueño de una ruta protegida, o null si la ruta no pertenece a ninguna sección. */
export function roleForPath(pathname: string): Role | null {
  for (const role of ROLES) {
    const home = ROLE_HOME[role];
    if (pathname === home || pathname.startsWith(`${home}/`)) return role;
  }
  return null;
}
