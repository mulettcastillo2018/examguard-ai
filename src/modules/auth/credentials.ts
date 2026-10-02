import "server-only";
import type { Prisma, PrismaClient, Role } from "@prisma/client";
import { hashPassword } from "better-auth/crypto";
import { prisma } from "@/lib/db";

export interface NewCredentialUser {
  institutionId: string;
  name: string;
  email: string;
  role: Role;
  password: string;
  isMinor?: boolean;
  mustChangePassword?: boolean;
}

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Crea un usuario con contraseña, en el formato de Better Auth: el usuario y su cuenta
 * "credential" con la contraseña cifrada con el mismo algoritmo que usa al iniciar sesión.
 * Lo usan el seed y, desde la Fase 2, la administración de usuarios.
 */
export async function createCredentialUser(input: NewCredentialUser, db: Db = prisma) {
  const passwordHash = await hashPassword(input.password);
  const user = await db.user.create({
    data: {
      institutionId: input.institutionId,
      name: input.name,
      email: input.email.trim().toLowerCase(),
      role: input.role,
      isMinor: input.isMinor ?? false,
      mustChangePassword: input.mustChangePassword ?? true,
    },
  });
  await db.account.create({
    data: { userId: user.id, accountId: user.id, providerId: "credential", password: passwordHash },
  });
  return user;
}
