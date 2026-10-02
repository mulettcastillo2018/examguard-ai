import "server-only";
import { PrismaClient } from "@prisma/client";

// Un solo cliente por proceso. En desarrollo, la recarga en caliente reevalúa los
// módulos; guardarlo en globalThis evita abrir conexiones nuevas en cada cambio.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
