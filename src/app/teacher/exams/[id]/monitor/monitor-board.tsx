"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { ChevronDown, ChevronRight } from "lucide-react";
import { EventItem, type EventView } from "@/components/proctoring/event-item";
import { SignalList } from "@/components/proctoring/signal-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Jsonify } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { ExamMonitor } from "@/modules/proctoring/monitor";

type MonitorData = Jsonify<ExamMonitor>;
const POLL_MS = 5000;

function clock(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const pad = (value: number) => String(value).padStart(2, "0");
  const hours = Math.floor(total / 3600);
  return hours ? `${hours}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}` : `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

/** Tablero en vivo: consulta cada 5 s mientras la pestaña está visible. */
export function MonitorBoard({ examId, initial }: { examId: string; initial: MonitorData }) {
  const t = useTranslations("monitor");
  const tProctoring = useTranslations("proctoring");
  const tCommon = useTranslations("common");
  const tReview = useTranslations("review");
  const format = useFormatter();
  const [data, setData] = useState(initial);
  const [receivedAt, setReceivedAt] = useState(() => new Date(initial.serverNow).getTime());
  const [now, setNow] = useState(() => new Date(initial.serverNow).getTime());
  const [state, setState] = useState<"live" | "paused" | "failed">("live");
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Desfase entre el reloj del equipo y el del servidor, para la cuenta atrás.
    let offset = new Date(initial.serverNow).getTime() - Date.now();
    async function poll() {
      if (document.visibilityState === "hidden") {
        setState("paused");
        return;
      }
      try {
        const response = await fetch(`/api/exams/${examId}/monitor`, { cache: "no-store" });
        if (!response.ok) throw new Error(String(response.status));
        const next = (await response.json()) as MonitorData;
        if (cancelled) return;
        offset = new Date(next.serverNow).getTime() - Date.now();
        setData(next);
        setReceivedAt(new Date(next.serverNow).getTime());
        setState("live");
      } catch {
        if (!cancelled) setState("failed");
      }
    }
    const pollTimer = setInterval(() => void poll(), POLL_MS);
    const tick = setInterval(() => setNow(Date.now() + offset), 1000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(pollTimer);
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [examId, initial.serverNow]);

  const status = state === "paused" ? t("paused") : state === "failed" ? t("failed") : t("updated", { time: format.dateTime(new Date(receivedAt), { timeStyle: "medium" }) });

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <div className="grid gap-0.5">
          <p className="font-medium" data-testid="monitor-summary">
            {t("summary", data.summary)}
          </p>
          <p className={cn("text-xs", data.summary.recommended ? "font-medium text-destructive" : "text-muted-foreground")} data-testid="monitor-recommended">
            {tReview("recommendedCount", { count: data.summary.recommended })}
          </p>
        </div>
        <p className={cn("flex items-center gap-2 text-muted-foreground", state === "failed" && "text-amber-700")} aria-live="polite">
          <span className={cn("size-2 rounded-full", state === "live" ? "animate-pulse bg-emerald-500" : "bg-muted-foreground/50")} aria-hidden />
          {status}
        </p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8">
              <span className="sr-only">{t("lastEvents")}</span>
            </TableHead>
            <TableHead>{t("columns.student")}</TableHead>
            <TableHead>{t("columns.state")}</TableHead>
            <TableHead className="hidden md:table-cell">{t("columns.lastEvent")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.rows.map((row) => {
            const attempt = row.attempt;
            const session = attempt?.session ?? null;
            const expanded = open === row.student.id;
            const last = session?.lastEvents[0];
            return (
              <Fragment key={row.student.id}>
                <TableRow data-testid="monitor-row">
                  <TableCell>
                    {session ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        aria-expanded={expanded}
                        aria-label={expanded ? t("hideEvents", { name: row.student.name }) : t("showEvents", { name: row.student.name })}
                        onClick={() => setOpen(expanded ? null : row.student.id)}
                      >
                        {expanded ? <ChevronDown /> : <ChevronRight />}
                      </Button>
                    ) : null}
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{row.student.name}</span>
                      {row.student.isMinor ? <Badge variant="outline">{tCommon("minor")}</Badge> : null}
                    </div>
                    {session?.browser ? (
                      <p className="text-xs text-muted-foreground">{t("device", { browser: session.browser, os: session.os ?? "—" })}</p>
                    ) : null}
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    {attempt ? (
                      <div className="grid gap-1 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={attempt.status === "IN_PROGRESS" ? "default" : "secondary"}>{t(`status.${attempt.status}`)}</Badge>
                          {session && session.reviewStatus !== "NOT_REQUIRED" ? (
                            <>
                              <Badge variant={session.reviewStatus === "RECOMMENDED" ? "destructive" : "outline"}>{tReview(`status.${session.reviewStatus}`)}</Badge>
                              <Link
                                href={`/teacher/reviews/${session.id}`}
                                className="text-xs text-primary underline-offset-4 hover:underline"
                                aria-label={t("openReview", { name: row.student.name })}
                              >
                                {tReview("openReview")}
                              </Link>
                            </>
                          ) : null}
                          {attempt.status === "IN_PROGRESS" ? (
                            <span className="flex items-center gap-1.5 text-xs">
                              <span className={cn("size-2 rounded-full", session?.online ? "bg-emerald-500" : "bg-muted-foreground/50")} aria-hidden />
                              {session?.online ? t("online") : t("offline")}
                            </span>
                          ) : null}
                        </div>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {t("progress", { answered: attempt.answered, total: data.questionCount })}
                          {attempt.status === "IN_PROGRESS" ? ` · ${t("timeLeft", { time: clock(new Date(attempt.deadlineAt).getTime() - now) })}` : ""}
                        </span>
                        {session ? (
                          <span className="flex flex-wrap gap-1">
                            {Object.entries(session.counts).map(([category, count]) => (
                              <Badge key={category} variant="outline" className="h-5 px-1.5 text-[11px]">
                                {tProctoring(`categories.${category}`)} {count}
                              </Badge>
                            ))}
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">{t("status.notStarted")}</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {last ? (
                      <ul>
                        <EventItem event={last as EventView} />
                      </ul>
                    ) : null}
                  </TableCell>
                </TableRow>
                {expanded && session ? (
                  <TableRow>
                    <TableCell />
                    <TableCell colSpan={3} className="whitespace-normal">
                      <div className="grid gap-3 py-2 text-sm">
                        <p className="text-muted-foreground">
                          {t("camera", { state: session.cameraEnabled ? t("authorized") : t("notAuthorized") })} ·{" "}
                          {t("microphone", { state: session.microphoneEnabled ? t("microphoneAuthorized") : t("microphoneNotAuthorized") })} ·{" "}
                          {t("events", { count: session.eventCount })}
                        </p>
                        {session.signals.length ? (
                          <div className="grid gap-2 rounded-md border p-3">
                            <p className="font-medium">{tReview("signals")}</p>
                            <SignalList signals={session.signals} />
                          </div>
                        ) : null}
                        <ul className="grid gap-2" data-testid="monitor-events">
                          {session.lastEvents.map((event) => (
                            <EventItem key={event.id} event={event as EventView} />
                          ))}
                        </ul>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : null}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
