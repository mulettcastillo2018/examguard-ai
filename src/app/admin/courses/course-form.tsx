"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createCourseAction, updateCourseAction } from "./actions";

interface CourseValues {
  id: string;
  code: string;
  name: string;
  period: string;
}

function CourseFields({ course, fields }: { course?: CourseValues; fields: string[] }) {
  const t = useTranslations("admin.courses.form");
  const invalid = (field: string) => fields.includes(field);
  const suggestedPeriod = `${new Date().getFullYear()}-${new Date().getMonth() < 6 ? 1 : 2}`;

  return (
    <>
      <div className="grid gap-2">
        <Label htmlFor="course-code">{t("code")}</Label>
        <Input id="course-code" name="code" defaultValue={course?.code} required className="uppercase" aria-invalid={invalid("code")} />
        <p className={invalid("code") ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
          {invalid("code") ? t("errors.code") : t("codeHint")}
        </p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="course-name">{t("name")}</Label>
        <Input id="course-name" name="name" defaultValue={course?.name} required aria-invalid={invalid("name")} />
        {invalid("name") ? <p className="text-xs text-destructive">{t("errors.name")}</p> : null}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="course-period">{t("period")}</Label>
        <Input id="course-period" name="period" defaultValue={course?.period ?? suggestedPeriod} required aria-invalid={invalid("period")} />
        <p className={invalid("period") ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
          {invalid("period") ? t("errors.period") : t("periodHint")}
        </p>
      </div>
    </>
  );
}

/** Crea un curso y lleva a su detalle para asignar docentes y estudiantes. */
export function CreateCourseDialog({ trigger }: { trigger: ReactNode }) {
  const t = useTranslations("admin.courses.form");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<string[]>([]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFields([]);
    const result = await createCourseAction(new FormData(event.currentTarget));
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      setFields(result.fields ?? []);
      return;
    }
    setOpen(false);
    router.push(`/admin/courses/${result.data.id}`);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setError(null);
        setFields([]);
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("createTitle")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          <CourseFields fields={fields} />
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? t("saving") : t("create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Edita código, nombre y periodo de un curso existente. */
export function EditCourseForm({ course }: { course: CourseValues }) {
  const t = useTranslations("admin.courses.form");
  const tDetail = useTranslations("admin.courses.detail");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<string[]>([]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFields([]);
    const result = await updateCourseAction(course.id, new FormData(event.currentTarget));
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      setFields(result.fields ?? []);
      return;
    }
    toast.success(tDetail("saved"));
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:max-w-md" noValidate>
      <CourseFields course={course} fields={fields} />
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? t("saving") : t("save")}
        </Button>
      </div>
    </form>
  );
}
