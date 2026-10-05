"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Library } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { QUESTION_TYPES, type QuestionType } from "@/modules/question-bank/content";
import { addQuestionsFromBankAction } from "../actions";

export interface BankQuestionOption {
  id: string;
  type: QuestionType;
  prompt: string;
  points: number;
  category: string | null;
}

// Búsqueda sin tildes ni mayúsculas, como en el resto del producto.
const normalize = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export function AddFromBankDialog({ examId, bank, inExam }: { examId: string; bank: BankQuestionOption[]; inExam: string[] }) {
  const t = useTranslations("exams.bank");
  const tTypes = useTranslations("questionBank.types");
  const tBank = useTranslations("questionBank");
  const tQuestions = useTranslations("exams.questions");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const already = useMemo(() => new Set(inExam), [inExam]);

  const visible = bank.filter(
    (question) => (!type || question.type === type) && (!search.trim() || normalize(question.prompt).includes(normalize(search.trim()))),
  );

  function toggle(id: string, checked: boolean) {
    setSelected((current) => (checked ? [...current, id] : current.filter((value) => value !== id)));
  }

  async function add() {
    setPending(true);
    const result = await addQuestionsFromBankAction(examId, selected);
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(t("added", { count: result.data.count }));
    setOpen(false);
    setSelected([]);
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSelected([]);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <Library />
          {tQuestions("addFromBank")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {bank.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t("emptyBank")}</p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <div className="grid gap-1.5">
                <Label htmlFor="bank-search">{t("search")}</Label>
                <Input id="bank-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="bank-type">{t("type")}</Label>
                <NativeSelect id="bank-type" value={type} onChange={(event) => setType(event.target.value)}>
                  <option value="">{t("allTypes")}</option>
                  {QUESTION_TYPES.map((value) => (
                    <option key={value} value={value}>
                      {tTypes(value)}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            </div>
            <ul className="grid max-h-[50vh] gap-2 overflow-y-auto pr-1">
              {visible.length === 0 ? <li className="py-6 text-center text-sm text-muted-foreground">{t("empty")}</li> : null}
              {visible.map((question) => {
                const added = already.has(question.id);
                return (
                  <li key={question.id}>
                    <Label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 font-normal has-[:disabled]:cursor-default has-[:disabled]:opacity-60">
                      <Checkbox
                        className="mt-0.5"
                        disabled={added}
                        checked={selected.includes(question.id)}
                        onCheckedChange={(checked) => toggle(question.id, checked === true)}
                      />
                      <span className="grid min-w-0 gap-1">
                        <span className="line-clamp-2">{question.prompt}</span>
                        <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <Badge variant="secondary">{tTypes(question.type)}</Badge>
                          {tBank("points", { points: question.points })}
                          {question.category ? <span>· {question.category}</span> : null}
                          {added ? <span>· {t("alreadyAdded")}</span> : null}
                        </span>
                      </span>
                    </Label>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("cancel")}
          </Button>
          <Button onClick={add} disabled={pending || selected.length === 0}>
            {t("add", { count: selected.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
