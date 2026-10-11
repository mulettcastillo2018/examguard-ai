"use server";

import { revalidatePath } from "next/cache";
import { formFlag, formText, runAction, type ActionResult } from "@/lib/action";
import { enforceRateLimit, LIMITS } from "@/lib/rate-limit";
import { requireActor } from "@/modules/auth/session";
import { createUser, importUsers, resetUserPassword, updateUser, type ImportResultRow } from "@/modules/users/users";

// Acciones de la administración de usuarios. Cada una vuelve a verificar el permiso en el
// servidor (requireActor + el servicio), sin confiar en que el botón solo lo ve un admin.

export async function createUserAction(form: FormData): Promise<ActionResult<{ temporaryPassword: string; name: string; email: string }>> {
  return runAction(async () => {
    const actor = await requireActor({ permission: "users:manage" });
    const { user, temporaryPassword } = await createUser(actor, {
      name: formText(form, "name"),
      email: formText(form, "email"),
      role: formText(form, "role") as "ADMIN" | "TEACHER" | "STUDENT",
      isMinor: formFlag(form, "isMinor"),
    });
    revalidatePath("/admin/users");
    return { temporaryPassword, name: user.name, email: user.email };
  });
}

export async function updateUserAction(userId: string, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireActor({ permission: "users:manage" });
    await updateUser(actor, userId, {
      name: formText(form, "name"),
      role: formText(form, "role") as "ADMIN" | "TEACHER" | "STUDENT",
      isMinor: formFlag(form, "isMinor"),
      active: formFlag(form, "active"),
    });
    revalidatePath("/admin/users");
    return undefined;
  });
}

export async function resetPasswordAction(userId: string): Promise<ActionResult<{ temporaryPassword: string }>> {
  return runAction(async () => {
    const actor = await requireActor({ permission: "users:manage" });
    const result = await resetUserPassword(actor, userId);
    revalidatePath("/admin/users");
    return result;
  });
}

export type ImportActionData =
  | { ok: false; error: "empty" | "missingColumns" | "tooManyRows"; missing: string[] }
  | { ok: true; summary: { created: number; exists: number; invalid: number }; results: ImportResultRow[] };

export async function importUsersAction(csvText: string): Promise<ActionResult<ImportActionData>> {
  return runAction(async () => {
    const actor = await requireActor({ permission: "users:manage" });
    if (csvText.length > 200_000) return { ok: false as const, error: "tooManyRows" as const, missing: [] };
    await enforceRateLimit(`user-import:${actor.id}`, LIMITS.userImport);
    const result = await importUsers(actor, csvText);
    revalidatePath("/admin/users");
    return result;
  });
}
