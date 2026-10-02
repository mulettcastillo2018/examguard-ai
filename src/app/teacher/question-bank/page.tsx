import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { requirePageUser } from "@/modules/auth/session";
import { QUESTION_TYPES } from "@/modules/question-bank/content";
import { listQuestions } from "@/modules/question-bank/question-bank";
import { QuestionRowActions } from "./question-row-actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("questionBank");
  return { title: t("title") };
}

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";

export default async function QuestionBankPage({ searchParams }: PageProps<"/teacher/question-bank">) {
  const user = await requirePageUser({ roles: ["TEACHER"] });
  const t = await getTranslations("questionBank");
  const params = await searchParams;
  const filters = {
    q: one(params.q),
    type: one(params.type),
    category: one(params.category),
    tag: one(params.tag),
    archived: one(params.archived) === "1",
  };
  const { questions, categories, tags } = await listQuestions(user, filters);
  const filtering = Boolean(filters.q || filters.type || filters.category || filters.tag || filters.archived);

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Button asChild>
            <Link href="/teacher/question-bank/new">
              <Plus />
              {t("new")}
            </Link>
          </Button>
        }
      />

      {/* Filtros por GET: la URL refleja la búsqueda y funciona sin JavaScript. */}
      <form method="get" className="mb-4 grid gap-3 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto] lg:items-end">
        <div className="grid gap-1.5">
          <Label htmlFor="f-q">{t("filters.search")}</Label>
          <Input id="f-q" name="q" type="search" defaultValue={filters.q} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="f-type">{t("filters.type")}</Label>
          <NativeSelect id="f-type" name="type" defaultValue={filters.type}>
            <option value="">{t("filters.allTypes")}</option>
            {QUESTION_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`types.${type}`)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="f-category">{t("filters.category")}</Label>
          <NativeSelect id="f-category" name="category" defaultValue={filters.category}>
            <option value="">{t("filters.allCategories")}</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="f-tag">{t("filters.tag")}</Label>
          <NativeSelect id="f-tag" name="tag" defaultValue={filters.tag}>
            <option value="">{t("filters.allTags")}</option>
            {tags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-1">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="archived" value="1" defaultChecked={filters.archived} className="size-4 accent-[var(--primary)]" />
            {t("filters.archived")}
          </label>
          <Button type="submit" variant="secondary">
            {t("filters.apply")}
          </Button>
          {filtering ? (
            <Button asChild variant="ghost">
              <Link href="/teacher/question-bank">{t("filters.clear")}</Link>
            </Button>
          ) : null}
        </div>
      </form>

      <Card>
        <CardContent>
          {questions.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{filtering ? t("empty") : t("emptyBank")}</p>
          ) : (
            <>
              <p className="mb-2 text-sm text-muted-foreground">{t("count", { count: questions.length })}</p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("columns.prompt")}</TableHead>
                    <TableHead className="hidden sm:table-cell">{t("columns.type")}</TableHead>
                    <TableHead className="hidden md:table-cell">{t("columns.category")}</TableHead>
                    <TableHead className="text-right">{t("columns.points")}</TableHead>
                    <TableHead className="w-12">
                      <span className="sr-only">{t("actions")}</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {questions.map((question) => (
                    <TableRow key={question.id}>
                      <TableCell className="max-w-md whitespace-normal">
                        <Link href={`/teacher/question-bank/${question.id}`} className="line-clamp-2 font-medium underline-offset-4 hover:underline">
                          {question.prompt}
                        </Link>
                        {/* En celular el tipo va bajo el enunciado para dejarle espacio. */}
                        <div className={cn("mt-1 flex flex-wrap gap-1", !question.tags.length && !question.archivedAt && "sm:hidden")}>
                          {question.archivedAt ? <Badge variant="destructive">{t("archivedBadge")}</Badge> : null}
                          <Badge variant="secondary" className="sm:hidden">
                            {t(`types.${question.type}`)}
                          </Badge>
                          {question.tags.map((tag) => (
                            <Badge key={tag} variant="outline">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                        {question.autoGradable ? null : (
                          <span className="mt-1 block text-xs text-muted-foreground sm:hidden">{t("manualGrading")}</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <div className="flex flex-col items-start gap-1">
                          <Badge variant="secondary">{t(`types.${question.type}`)}</Badge>
                          {question.autoGradable ? null : <span className="text-xs text-muted-foreground">{t("manualGrading")}</span>}
                        </div>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">{question.category ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{t("points", { points: question.points })}</TableCell>
                      <TableCell>
                        <QuestionRowActions question={{ id: question.id, prompt: question.prompt, archived: Boolean(question.archivedAt) }} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}
