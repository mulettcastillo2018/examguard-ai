"use server";

import { revalidatePath } from "next/cache";
import { formText, runAction, type ActionResult } from "@/lib/action";
import { requireActor } from "@/modules/auth/session";
import { createCourse, setCourseMembers, updateCourse } from "@/modules/courses/courses";

const courseFromForm = (form: FormData) => ({
  code: formText(form, "code"),
  name: formText(form, "name"),
  period: formText(form, "period"),
});

export async function createCourseAction(form: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireActor({ permission: "courses:manage" });
    const course = await createCourse(actor, courseFromForm(form));
    revalidatePath("/admin/courses");
    return { id: course.id };
  });
}

export async function updateCourseAction(courseId: string, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireActor({ permission: "courses:manage" });
    await updateCourse(actor, courseId, courseFromForm(form));
    revalidatePath("/admin/courses");
    revalidatePath(`/admin/courses/${courseId}`);
    return undefined;
  });
}

export async function setCourseMembersAction(
  courseId: string,
  kind: "teachers" | "students",
  userIds: string[],
): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireActor({ permission: "courses:manage" });
    await setCourseMembers(actor, courseId, kind, userIds);
    revalidatePath("/admin/courses");
    revalidatePath(`/admin/courses/${courseId}`);
    return undefined;
  });
}
