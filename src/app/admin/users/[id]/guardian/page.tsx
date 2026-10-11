import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NotFoundError } from "@/lib/errors";
import { requirePageUser } from "@/modules/auth/session";
import { getGuardianConsent } from "@/modules/guardian/guardian";
import { GuardianForm, RevokeGuardianConsent } from "./guardian-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.guardian");
  return { title: t("title") };
}

const devicesOf = (value: { camera?: unknown; microphone?: unknown }) => (value.camera && value.microphone ? "both" : value.camera ? "camera" : "microphone");

/** Autorización del acudiente de un estudiante menor: estado, registro, revocación e historial. */
export default async function GuardianConsentPage({ params }: PageProps<"/admin/users/[id]/guardian">) {
  const user = await requirePageUser({ roles: ["ADMIN"] });
  const { id } = await params;
  const { student, consent, history, textVersion } = await getGuardianConsent(user, id).catch((error: unknown) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });
  const t = await getTranslations("admin.guardian");
  const format = await getFormatter();
  const date = (value: Date) => format.dateTime(value, { dateStyle: "medium", timeStyle: "short" });
  const active = consent && !consent.revokedAt ? consent : null;

  return (
    <>
      <Link href="/admin/users" className="mb-4 inline-block text-sm text-muted-foreground underline-offset-4 hover:underline">
        ← {t("back")}
      </Link>
      <PageHeader title={`${t("title")}: ${student.name}`} description={student.isMinor ? t("description", { name: student.name }) : undefined} />

      {!student.isMinor ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{t("notMinor")}</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
          <div className="grid gap-6">
            <Card data-testid="guardian-status">
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
                <CardTitle>{t("status.title")}</CardTitle>
                {active ? (
                  <Badge>{t("status.active")}</Badge>
                ) : consent?.revokedAt ? (
                  <Badge variant="outline">{t("status.revoked", { date: date(consent.revokedAt) })}</Badge>
                ) : null}
              </CardHeader>
              <CardContent className="grid gap-3 text-sm">
                {active ? (
                  <>
                    <p className="font-medium">{t("status.authorized", { devices: devicesOf(active) })}</p>
                    <p>{t("status.guardian", { name: active.guardianName, relationship: active.relationship })}</p>
                    {active.evidence ? <p className="text-muted-foreground">{t("status.evidence", { evidence: active.evidence })}</p> : null}
                    <p className="text-muted-foreground">
                      {t("status.recorded", { name: active.recordedBy.name, date: date(active.recordedAt) })} · {t("status.textVersion", { version: active.textVersion })}
                    </p>
                    <div>
                      <RevokeGuardianConsent studentId={student.id} studentName={student.name} />
                    </div>
                  </>
                ) : (
                  <p className="text-muted-foreground">{t("status.none")}</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{active ? t("form.replaceTitle") : t("form.title")}</CardTitle>
                <p className="text-xs text-muted-foreground">{t("status.textVersion", { version: textVersion })}</p>
              </CardHeader>
              <CardContent>
                <GuardianForm studentId={student.id} replacing={Boolean(active)} />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t("history.title")}</CardTitle>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("history.empty")}</p>
              ) : (
                <ol className="grid gap-3 text-sm" data-testid="guardian-history">
                  {history.map((entry) => {
                    const metadata = (entry.metadata ?? {}) as { camera?: boolean; microphone?: boolean };
                    const name = entry.actor?.name ?? "—";
                    return (
                      <li key={entry.id} className="grid gap-0.5">
                        <span>
                          {entry.action === "GUARDIAN_CONSENT_REVOKED"
                            ? t("history.revoked", { name })
                            : t("history.recorded", { name, devices: devicesOf(metadata) })}
                        </span>
                        <span className="text-xs text-muted-foreground tabular-nums">{date(entry.createdAt)}</span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
