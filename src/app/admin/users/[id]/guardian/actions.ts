"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionResult } from "@/lib/action";
import { requireActor } from "@/modules/auth/session";
import { recordGuardianConsent, revokeGuardianConsent, type GuardianConsentInput } from "@/modules/guardian/guardian";

// La administración registra o revoca la autorización del acudiente de un estudiante menor.
// El permiso se vuelve a verificar aquí y en el servicio.

export async function recordGuardianConsentAction(studentId: string, input: GuardianConsentInput): Promise<ActionResult> {
  return runAction(async () => {
    await recordGuardianConsent(await requireActor({ permission: "users:manage" }), studentId, input);
    revalidatePath(`/admin/users/${studentId}/guardian`);
    revalidatePath("/admin/users");
    return undefined;
  });
}

export async function revokeGuardianConsentAction(studentId: string): Promise<ActionResult> {
  return runAction(async () => {
    await revokeGuardianConsent(await requireActor({ permission: "users:manage" }), studentId);
    revalidatePath(`/admin/users/${studentId}/guardian`);
    revalidatePath("/admin/users");
    return undefined;
  });
}
