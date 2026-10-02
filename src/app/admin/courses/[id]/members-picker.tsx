"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { setCourseMembersAction } from "../actions";

interface Person {
  id: string;
  name: string;
  email: string;
  isMinor: boolean;
}

const normalize = (value: string) => value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Lista con buscador para asignar docentes o matricular estudiantes en un curso. */
export function MembersPicker({
  courseId,
  kind,
  people,
  initialSelected,
}: {
  courseId: string;
  kind: "teachers" | "students";
  people: Person[];
  initialSelected: string[];
}) {
  const t = useTranslations();
  const [selected, setSelected] = useState(() => new Set(initialSelected));
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState(false);
  const router = useRouter();

  const visible = useMemo(() => {
    const q = normalize(query.trim());
    return q ? people.filter((p) => normalize(`${p.name} ${p.email}`).includes(q)) : people;
  }, [people, query]);

  const dirty = selected.size !== initialSelected.length || initialSelected.some((id) => !selected.has(id));

  function toggle(id: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function save() {
    setPending(true);
    const result = await setCourseMembersAction(courseId, kind, [...selected]);
    setPending(false);
    if (!result.ok) toast.error(result.error);
    else {
      toast.success(t("admin.courses.detail.saved"));
      router.refresh();
    }
  }

  if (people.length === 0) return <p className="text-sm text-muted-foreground">{t("admin.courses.detail.none")}</p>;

  return (
    <div className="grid gap-3">
      <Input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t("admin.courses.detail.search")}
        aria-label={t("admin.courses.detail.search")}
      />
      <ul className="grid max-h-80 gap-1 overflow-y-auto rounded-lg border p-2">
        {visible.map((person) => (
          <li key={person.id}>
            <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted">
              <Checkbox checked={selected.has(person.id)} onCheckedChange={(checked) => toggle(person.id, checked === true)} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{person.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{person.email}</span>
              </span>
              {person.isMinor ? <Badge variant="outline">{t("common.minor")}</Badge> : null}
            </label>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">
          {t("admin.courses.detail.selected", { count: selected.size, total: people.length })}
        </span>
        <Button type="button" onClick={save} disabled={pending || !dirty}>
          {pending ? t("admin.courses.detail.saving") : t("admin.courses.detail.save")}
        </Button>
      </div>
    </div>
  );
}
