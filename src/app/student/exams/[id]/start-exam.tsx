"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CircleAlert, CircleCheck, CircleX, Loader2, Play, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useHydrated } from "@/hooks/use-hydrated";
import { getClientId } from "@/lib/client-id";
import { startAttemptAction } from "../actions";

type CheckState = "running" | "ok" | "warn" | "fail";
interface CheckResult {
  key: "browser" | "connection" | "device" | "fullscreen";
  state: CheckState;
  detail: string;
}

const ICONS = {
  running: <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />,
  ok: <CircleCheck className="size-4 text-primary" aria-hidden />,
  warn: <CircleAlert className="size-4 text-amber-600" aria-hidden />,
  fail: <CircleX className="size-4 text-destructive" aria-hidden />,
};

/** Prueba de compatibilidad: nada se envía; solo se mide aquí y contra /api/time. */
function useCompatibility(fullscreenRequested: boolean) {
  const t = useTranslations("studentExams.check");
  const [results, setResults] = useState<CheckResult[]>([]);
  const [running, setRunning] = useState(true);

  // Mide y devuelve los resultados; el estado se actualiza después, fuera de la medición.
  const measure = useCallback(async (): Promise<CheckResult[]> => {
    const next: CheckResult[] = [];

    let storageOk = false;
    try {
      localStorage.setItem("examguard:check", "1");
      storageOk = localStorage.getItem("examguard:check") === "1";
      localStorage.removeItem("examguard:check");
    } catch {
      storageOk = false;
    }
    const browserOk = storageOk && typeof fetch === "function" && typeof crypto?.randomUUID === "function";
    next.push({ key: "browser", state: browserOk ? "ok" : "fail", detail: browserOk ? t("browserOk") : t("browserFail") });

    try {
      const sent = Date.now();
      const response = await fetch("/api/time", { cache: "no-store" });
      const received = Date.now();
      const { now } = (await response.json()) as { now: string };
      const ms = received - sent;
      const skewMinutes = Math.round(Math.abs(new Date(now).getTime() + ms / 2 - received) / 60_000);
      const detail = [ms > 1500 ? t("connectionSlow", { ms }) : t("connectionOk", { ms }), skewMinutes >= 2 ? t("clock", { minutes: skewMinutes }) : ""]
        .filter(Boolean)
        .join(" ");
      next.push({ key: "connection", state: ms > 1500 || skewMinutes >= 2 ? "warn" : "ok", detail });
    } catch {
      next.push({ key: "connection", state: "fail", detail: t("connectionFail") });
    }

    const touchOnly = window.matchMedia("(pointer: coarse)").matches && !window.matchMedia("(pointer: fine)").matches;
    next.push({ key: "device", state: touchOnly ? "warn" : "ok", detail: touchOnly ? t("deviceWarn") : t("deviceOk") });

    if (fullscreenRequested) {
      const available = Boolean(document.fullscreenEnabled);
      next.push({ key: "fullscreen", state: available ? "ok" : "warn", detail: available ? t("fullscreenOk") : t("fullscreenWarn") });
    }
    return next;
  }, [fullscreenRequested, t]);

  useEffect(() => {
    let cancelled = false;
    void measure().then((next) => {
      if (cancelled) return;
      setResults(next);
      setRunning(false);
    });
    return () => {
      cancelled = true;
    };
  }, [measure]);

  async function run() {
    setRunning(true);
    setResults(await measure());
    setRunning(false);
  }

  return { results, running, run };
}

export function StartExam({
  examId,
  requests,
  isMinor,
  cameraExempt,
  consent,
}: {
  examId: string;
  requests: { camera: boolean; microphone: boolean; fullscreen: boolean };
  isMinor: boolean;
  cameraExempt: boolean;
  consent: { textVersion: string; retentionDays: number };
}) {
  const t = useTranslations("studentExams");
  const router = useRouter();
  const hydrated = useHydrated();
  const { results, running, run } = useCompatibility(requests.fullscreen);
  const [camera, setCamera] = useState(false);
  const [microphone, setMicrophone] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [pending, setPending] = useState(false);

  const connectionFailed = results.some((result) => result.key === "connection" && result.state === "fail");
  const askCamera = requests.camera && !isMinor;
  const askMicrophone = requests.microphone && !isMinor;

  async function start() {
    setPending(true);
    const result = await startAttemptAction(examId, { clientId: getClientId(), consent: { camera, microphone } });
    if (!result.ok) {
      setPending(false);
      toast.error(result.error);
      router.refresh();
      return;
    }
    router.push(`/take/${result.data.attemptId}`);
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="grid gap-1.5">
            <CardTitle>{t("check.heading")}</CardTitle>
            <CardDescription>{t("check.description")}</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => void run()} disabled={running || !hydrated}>
            <RefreshCw />
            {running ? t("check.running") : t("check.again")}
          </Button>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-3" aria-live="polite" data-testid="compatibility">
            {results.map((result) => (
              <li key={result.key} className="flex items-start gap-3 text-sm">
                <span className="mt-0.5">{ICONS[result.state]}</span>
                <span className="grid gap-0.5">
                  <span className="font-medium">
                    {t(`check.${result.key}`)} · <span className="font-normal text-muted-foreground">{t(`check.${result.state}`)}</span>
                  </span>
                  <span className="text-muted-foreground">{result.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("consent.heading")}</CardTitle>
          <CardDescription>{t("consent.version", { version: consent.textVersion })}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm">
          <div className="grid gap-2 text-muted-foreground">
            <p>{t("consent.intro")}</p>
            <ul className="ml-5 grid list-disc gap-1">
              <li>{t("consent.activity")}</li>
              {requests.camera ? <li>{t("consent.camera")}</li> : null}
              {requests.microphone ? <li>{t("consent.microphone")}</li> : null}
              <li>{t("consent.retention", { days: consent.retentionDays })}</li>
              <li>{t("consent.access")}</li>
              <li>{t("consent.refuse")}</li>
            </ul>
            {isMinor && (requests.camera || requests.microphone) ? <p className="font-medium text-foreground">{t("consent.minor")}</p> : null}
            {cameraExempt ? <p className="font-medium text-foreground">{t("consent.cameraExempt")}</p> : null}
          </div>

          <fieldset disabled={!hydrated || pending} className="grid gap-3">
            {askCamera ? (
              <Label className="flex items-center gap-2 font-normal">
                <Checkbox checked={camera} onCheckedChange={(checked) => setCamera(checked === true)} />
                {t("consent.allowCamera")}
              </Label>
            ) : null}
            {askMicrophone ? (
              <Label className="flex items-center gap-2 font-normal">
                <Checkbox checked={microphone} onCheckedChange={(checked) => setMicrophone(checked === true)} />
                {t("consent.allowMicrophone")}
              </Label>
            ) : null}
            <Label className="flex items-center gap-2 font-medium">
              <Checkbox checked={acknowledged} onCheckedChange={(checked) => setAcknowledged(checked === true)} />
              {t("consent.acknowledge")}
            </Label>
          </fieldset>

          <div className="grid gap-2">
            <p className="text-xs text-muted-foreground">{t("lobby.timerNotice")}</p>
            <div>
              <Button onClick={start} disabled={!hydrated || pending || !acknowledged || connectionFailed}>
                {pending ? <Loader2 className="animate-spin" /> : <Play />}
                {pending ? t("lobby.starting") : t("lobby.start")}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
