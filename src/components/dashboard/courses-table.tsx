import { getTranslations } from "next-intl/server";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface CourseRow {
  id: string;
  code: string;
  name: string;
  period: string;
  teachers: { teacher: { id: string; name: string } }[];
  _count: { enrollments: number };
}

/** Tabla de cursos compartida por administración y docentes. */
export async function CoursesTable({ courses, showTeachers = true }: { courses: CourseRow[]; showTeachers?: boolean }) {
  const t = await getTranslations();

  if (courses.length === 0) return <p className="text-sm text-muted-foreground">{t("common.empty")}</p>;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("admin.courses.code")}</TableHead>
          <TableHead>{t("admin.courses.name")}</TableHead>
          <TableHead className="hidden sm:table-cell">{t("admin.courses.period")}</TableHead>
          {showTeachers ? <TableHead className="hidden md:table-cell">{t("admin.courses.teachers")}</TableHead> : null}
          <TableHead className="text-right">{t("admin.courses.students")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {courses.map((course) => (
          <TableRow key={course.id}>
            <TableCell className="font-mono text-xs">{course.code}</TableCell>
            <TableCell className="font-medium">{course.name}</TableCell>
            <TableCell className="hidden sm:table-cell">{course.period}</TableCell>
            {showTeachers ? (
              <TableCell className="hidden text-muted-foreground md:table-cell">
                {course.teachers.length
                  ? course.teachers.map(({ teacher }) => teacher.name).join(", ")
                  : t("common.teachers", { count: 0 })}
              </TableCell>
            ) : null}
            <TableCell className="text-right tabular-nums">{course._count.enrollments}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
