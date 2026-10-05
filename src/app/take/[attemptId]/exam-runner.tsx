"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, Clock, CloudOff, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { getClientId } from "@/lib/client-id";
import { cn } from "@/lib/utils";
import { isAnswered } from "@/modules/attempts/answers";
import type { QuestionType } from "@/modules/question-bank/content";
import { createAnswerSync, SyncHttpError, type SavedAnswer, type SyncBlock, type SyncState } from "./answer-sync";

export interface RunnerQuestion {
  id: string;
  type: QuestionType;
  prompt: string;
  points: number;
  options: { id: string; label: string }[];
}

const LIMITS = { SHORT_ANSWER: 200, LONG_ANSWER: 10_000 } as const;
const storageKey = (attemptId: string) => `examguard:pending:${attemptId}`;

async function post<T>(url: string, body: unknown, keepalive = false): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    keepalive,
    cache: "no-store",
  });
  const data = (await response.json().catch(() => ({}))) as T & { code?: string };
  if (!response.ok) throw new SyncHttpError(response.status, data.code);
  return data;
}

function readLocal(attemptId: string): Record<string, SavedAnswer> {
  try {
    return JSON.parse(localStorage.getItem(storageKey(attemptId)) ?? "{}") as Record<string, SavedAnswer>;
  } catch {
    return {};
  }
}

function formatClock(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

function QuestionInput({
  question,
  value,
  onChange,
  disabled,
}: {
  question: RunnerQuestion;
  value: unknown;
  onChange: (value: unknown, delayMs: number) => void;
  disabled: boolean;
}) {
  const t = useTranslations("studentExams.attempt");
  const current = (value ?? {}) as { optionId?: string | null; optionIds?: string[]; value?: boolean | null; text?: string };

  switch (question.type) {
    case "SINGLE_CHOICE":
      return (
        <RadioGroup
          value={current.optionId ?? ""}
          onValueChange={(optionId) => onChange({ optionId }, 300)}
          disabled={disabled}
          aria-label={t("chooseOne")}
          className="grid gap-2"
        >
          {question.options.map((option) => (
            <Label key={option.id} className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 font-normal has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5">
              <RadioGroupItem value={option.id} />
              {option.label}
            </Label>
          ))}
        </RadioGroup>
      );
    case "MULTIPLE_CHOICE": {
      const chosen = current.optionIds ?? [];
      return (
        <div className="grid gap-2" role="group" aria-label={t("chooseMany")}>
          {question.options.map((option) => (
            <Label key={option.id} className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 font-normal has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5">
              <Checkbox
                checked={chosen.includes(option.id)}
                disabled={disabled}
                onCheckedChange={(checked) =>
                  onChange({ optionIds: checked === true ? [...chosen, option.id] : chosen.filter((id) => id !== option.id) }, 300)
                }
              />
              {option.label}
            </Label>
          ))}
        </div>
      );
    }
    case "TRUE_FALSE":
      return (
        <RadioGroup
          value={current.value == null ? "" : String(current.value)}
          onValueChange={(choice) => onChange({ value: choice === "true" }, 300)}
          disabled={disabled}
          aria-label={t("chooseOne")}
          className="grid gap-2 sm:grid-cols-2"
        >
          {(["true", "false"] as const).map((choice) => (
            <Label key={choice} className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 font-normal has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5">
              <RadioGroupItem value={choice} />
              {choice === "true" ? t("trueLabel") : t("falseLabel")}
            </Label>
          ))}
        </RadioGroup>
      );
    case "SHORT_ANSWER":
      return (
        <Input
          value={current.text ?? ""}
          maxLength={LIMITS.SHORT_ANSWER}
          placeholder={t("shortPlaceholder")}
          aria-label={question.prompt}
          disabled={disabled}
          onChange={(event) => onChange({ text: event.target.value }, 1200)}
        />
      );
    case "LONG_ANSWER": {
      const text = current.text ?? "";
      return (
        <div className="grid gap-1">
          <Textarea
            value={text}
            rows={10}
            maxLength={LIMITS.LONG_ANSWER}
            placeholder={t("longPlaceholder")}
            aria-label={question.prompt}
            disabled={disabled}
            onChange={(event) => onChange({ text: event.target.value }, 1200)}
          />
          <p className="text-right text-xs text-muted-foreground tabular-nums">{t("characters", { count: text.length, max: LIMITS.LONG_ANSWER })}</p>
        </div>
      );
    }
  }
}

export function ExamRunner({
  attemptId,
  examId,
  title,
  questions,
  initialAnswers,
  deadlineAt,
  serverNow,
}: {
  attemptId: string;
  examId: string;
  title: string;
  questions: RunnerQuestion[];
  initialAnswers: Record<string, SavedAnswer>;
  deadlineAt: string;
  serverNow: string;
}) {
  const t = useTranslations("studentExams.attempt");
  const tBank = useTranslations("questionBank");
  const router = useRouter();

  // Se monta solo en el navegador (ver exam-runner-client.tsx): puede leer la copia local.
  const [boot] = useState(() => {
    const merged: Record<string, SavedAnswer> = { ...initialAnswers };
    const pending = new Map<string, SavedAnswer>();
    for (const [questionId, entry] of Object.entries(readLocal(attemptId))) {
      if (!questions.some((question) => question.id === questionId)) continue;
      if ((merged[questionId]?.version ?? 0) < entry.version) {
        merged[questionId] = entry;
        pending.set(questionId, entry);
      }
    }
    return { merged, pending };
  });
  const [answers, setAnswers] = useState(boot.merged);
  const [index, setIndex] = useState(0);
  const [saveState, setSaveState] = useState<SyncState>(boot.pending.size ? "pending" : "saved");
  const [blocker, setBlocker] = useState<SyncBlock | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const clientId = useRef("");
  const offset = useRef(0);
  const deadline = useRef(new Date(deadlineAt).getTime());
  const warned = useRef({ five: false, one: false, ended: false });

  const [sync] = useState(() =>
    createAnswerSync({
      initialPending: boot.pending,
      transport: {
        save: (examQuestionId, entry, keepalive) =>
          post(`/api/attempts/${attemptId}/answers`, { clientId: clientId.current, examQuestionId, value: entry.value, version: entry.version }, keepalive),
      },
      storage: {
        store: (pending) => {
          try {
            if (Object.keys(pending).length) localStorage.setItem(storageKey(attemptId), JSON.stringify(pending));
            else localStorage.removeItem(storageKey(attemptId));
          } catch {
            // Sin almacenamiento local: el guardado sigue, solo sin copia de respaldo.
          }
        },
      },
      onState: setSaveState,
      onBlocked: setBlocker,
      onBumped: (questionId, entry) => setAnswers((current) => ({ ...current, [questionId]: entry })),
      isOnline: () => navigator.onLine,
    }),
  );

  const answeredCount = useMemo(
    () => questions.filter((question) => isAnswered(question.type, answers[question.id]?.value)).length,
    [answers, questions],
  );
  const question = questions[index];

  function leave() {
    router.push(`/student/exams/${examId}`);
    router.refresh();
  }

  async function finish(auto: boolean) {
    setSubmitting(true);
    await sync.flush({ keepalive: auto });
    if (sync.hasPending() && !auto) {
      setSubmitting(false);
      toast.error(t("submitFailed"));
      return;
    }
    try {
      await post(`/api/attempts/${attemptId}/submit`, { clientId: clientId.current, auto });
      try {
        localStorage.removeItem(storageKey(attemptId));
      } catch {
        // Nada que limpiar.
      }
      if (auto) {
        setBlocker("timeUp");
      } else {
        toast.success(t("submitted"));
        leave();
      }
    } catch (error) {
      setSubmitting(false);
      if (error instanceof SyncHttpError && error.status === 409) {
        setBlocker(error.code === "otherDevice" ? "otherDevice" : "timeUp");
        return;
      }
      if (!auto) toast.error(t("submitFailed"));
    }
  }

  async function takeOver() {
    try {
      const claimed = await post<{ status: string; deadlineAt: string; serverNow: string }>(`/api/attempts/${attemptId}/claim`, {
        clientId: clientId.current,
      });
      if (claimed.status !== "IN_PROGRESS") {
        setBlocker("timeUp");
        return;
      }
      setBlocker(null);
      sync.unblock();
    } catch {
      toast.error(t("submitFailed"));
    }
  }

  // Al abrir: esta pestaña reclama el intento; el servidor corrige el reloj y la hora límite.
  useEffect(() => {
    clientId.current = getClientId();
    offset.current = new Date(serverNow).getTime() - Date.now();
    let cancelled = false;
    post<{ status: string; deadlineAt: string; serverNow: string }>(`/api/attempts/${attemptId}/claim`, { clientId: clientId.current })
      .then((claimed) => {
        if (cancelled) return;
        if (claimed.status !== "IN_PROGRESS") {
          setBlocker("timeUp");
          return;
        }
        offset.current = new Date(claimed.serverNow).getTime() - Date.now();
        deadline.current = new Date(claimed.deadlineAt).getTime();
        sync.setReady();
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof SyncHttpError && error.status === 409) setBlocker("timeUp");
        else setSaveState("offline");
      });
    return () => {
      cancelled = true;
    };
  }, [attemptId, serverNow, sync]);

  // Cuenta atrás con la hora del servidor; avisos a los 5 y a 1 minuto; a cero, entrega.
  useEffect(() => {
    const tick = () => {
      const left = deadline.current - (Date.now() + offset.current);
      setRemaining(left);
      if (left <= 5 * 60_000 && !warned.current.five) {
        warned.current.five = true;
        setAnnouncement(t("warning5"));
      }
      if (left <= 60_000 && !warned.current.one) {
        warned.current.one = true;
        setAnnouncement(t("warning1"));
      }
      if (left <= 0 && !warned.current.ended) {
        warned.current.ended = true;
        void finish(true);
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
    // finish y t son estables para este intento; el temporizador no debe reiniciarse.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Conexión, cierre de la pestaña y limpieza.
  useEffect(() => {
    const onOnline = () => sync.wake();
    const onOffline = () => setSaveState("offline");
    const onPageHide = () => void sync.flush({ keepalive: true });
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (sync.hasPending()) event.preventDefault();
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
      sync.dispose();
    };
  }, [sync]);

  function change(questionId: string, value: unknown, delayMs: number) {
    const entry = { value, version: (answers[questionId]?.version ?? 0) + 1 };
    setAnswers((current) => ({ ...current, [questionId]: entry }));
    sync.queue(questionId, entry, delayMs);
  }

  if (!question) return null;
  const locked = Boolean(blocker) || submitting;
  const low = remaining !== null && remaining <= 5 * 60_000;
  const unanswered = questions.length - answeredCount;

  const saveLabel = {
    saved: t("save.saved"),
    pending: t("save.pending"),
    saving: t("save.saving"),
    offline: t("save.offline"),
    retrying: t("save.retrying"),
  }[saveState];

  return (
    <div className="mx-auto flex min-h-svh max-w-5xl flex-col">
      <header className="sticky top-0 z-10 border-b bg-background/95 px-4 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate font-semibold">{title}</h1>
            <p className="text-xs text-muted-foreground tabular-nums" data-testid="progress">
              {t("progress", { answered: answeredCount, total: questions.length })}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <p className={cn("flex items-center gap-1.5 text-xs", saveState === "offline" || saveState === "retrying" ? "text-amber-700" : "text-muted-foreground")} data-testid="save-state">
              {saveState === "saving" ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
              {saveState === "offline" ? <CloudOff className="size-3.5" aria-hidden /> : null}
              <span className="max-w-56 sm:max-w-none">{saveLabel}</span>
            </p>
            <div className={cn("flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-sm tabular-nums", low && "border-destructive text-destructive")}>
              <Clock className="size-4" aria-hidden />
              <span className="sr-only">{t("timeLeft")}</span>
              <span data-testid="time-left">{remaining === null ? "--:--" : formatClock(remaining)}</span>
            </div>
          </div>
        </div>
        <p className="sr-only" aria-live="assertive">
          {announcement}
        </p>
      </header>

      <div className="grid flex-1 grid-cols-1 content-start gap-6 p-4 lg:grid-cols-[minmax(0,1fr)_14rem]">
        <main>
          {/* El borde va afuera: en un fieldset la leyenda se monta sobre la línea. */}
          <div className="rounded-xl border p-5 sm:p-6">
            <fieldset className="grid gap-4" disabled={locked}>
              <legend className="mb-3 grid gap-1">
                <span className="text-sm text-muted-foreground">
                  {t("question", { number: index + 1, total: questions.length })} · {tBank("points", { points: question.points })}
                </span>
                <span className="text-lg font-medium whitespace-pre-line">{question.prompt}</span>
              </legend>
              <QuestionInput
                key={question.id}
                question={question}
                value={answers[question.id]?.value}
                disabled={locked}
                onChange={(value, delayMs) => change(question.id, value, delayMs)}
              />
            </fieldset>
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <Button variant="outline" onClick={() => setIndex((current) => current - 1)} disabled={index === 0}>
              <ChevronLeft />
              {t("previous")}
            </Button>
            {index < questions.length - 1 ? (
              <Button variant="outline" onClick={() => setIndex((current) => current + 1)}>
                {t("next")}
                <ChevronRight />
              </Button>
            ) : (
              <Button onClick={() => setConfirmOpen(true)} disabled={locked}>
                <Send />
                {t("finish")}
              </Button>
            )}
          </div>
        </main>

        <aside>
          <nav aria-label={t("navigation")}>
            <ol className="flex flex-wrap gap-2">
              {questions.map((item, position) => {
                const done = isAnswered(item.type, answers[item.id]?.value);
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setIndex(position)}
                      aria-current={position === index ? "step" : undefined}
                      aria-label={`${t("goTo", { number: position + 1 })}${done ? ` (${t("answered")})` : ""}`}
                      className={cn(
                        "flex size-10 items-center justify-center rounded-md border text-sm tabular-nums transition-colors",
                        done && "border-primary/40 bg-primary/10",
                        position === index && "ring-2 ring-ring",
                      )}
                    >
                      {position + 1}
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>
          <Button className="mt-4 w-full" onClick={() => setConfirmOpen(true)} disabled={locked}>
            {submitting ? <Loader2 className="animate-spin" /> : <Send />}
            {t("finish")}
          </Button>
        </aside>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirm.title")}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="grid gap-2">
                <p>{unanswered ? t("confirm.unanswered", { count: unanswered }) : t("confirm.allAnswered")}</p>
                {saveState !== "saved" ? <p>{t("confirm.pendingSaves")}</p> : null}
                <p>{t("confirm.description")}</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("confirm.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void finish(false)}>{t("confirm.confirm")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={blocker === "otherDevice"}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("otherDevice.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("otherDevice.description")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => void takeOver()}>{t("otherDevice.takeOver")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={blocker === "timeUp"}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("timeUp.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("timeUp.description")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={leave}>{t("timeUp.back")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
