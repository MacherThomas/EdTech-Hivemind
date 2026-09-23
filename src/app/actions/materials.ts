"use server";

import type { AssessmentStatus, MaterialKind } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { config } from "@/lib/config";
import { requireUser } from "@/lib/auth/session";
import { assertBelongsToCourse, assertCanContribute } from "@/lib/permissions";
import { putObject } from "@/lib/storage";
import { getAI } from "@/lib/ai";
import { canGroundAI } from "@/lib/integrity";
import { runJob } from "@/jobs";
import { handle, optStr, str, UserError } from "./util";
import type { FormState } from "@/components/ActionForm";

const KINDS = ["PAST_EXAM", "PROBLEM_SET", "SOLUTIONS", "NOTES", "SLIDES", "SYLLABUS", "OTHER"] as const;
const STATUSES = ["NOT_ASSESSMENT", "RETIRED", "POSSIBLY_LIVE", "UNKNOWN"] as const;
const ASSESSMENT_KINDS: MaterialKind[] = ["PAST_EXAM", "PROBLEM_SET", "SOLUTIONS"];
const TEXT_TYPES = ["text/plain", "text/markdown"];

export async function uploadMaterial(courseId: string, _: FormState, form: FormData) {
  return handle(async () => {
    const user = await requireUser();
    await assertCanContribute(user, courseId);
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) throw new UserError("Choose a file to upload.");
    if (file.size > config.uploads.maxBytes) throw new UserError("Files must be 15 MB or smaller.");
    const mime = file.type || (file.name.endsWith(".md") ? "text/markdown" : "application/octet-stream");
    if (!(config.uploads.allowedMimeTypes as readonly string[]).includes(mime)) {
      throw new UserError("Supported formats: PDF, Word, PowerPoint, plain text, Markdown, PNG, JPEG.");
    }
    const title = z.string().trim().min(3, "Add a title.").max(160).parse(str(form, "title"));
    const kind = z.enum(KINDS).parse(str(form, "kind")) as MaterialKind;
    let assessmentStatus = z.enum(STATUSES, { message: "Say whether this is still graded." }).parse(str(form, "assessmentStatus")) as AssessmentStatus;
    // An assessment can't be "not an assessment"; be conservative.
    if (ASSESSMENT_KINDS.includes(kind) && assessmentStatus === "NOT_ASSESSMENT") assessmentStatus = "UNKNOWN";
    if (!ASSESSMENT_KINDS.includes(kind)) assessmentStatus = "NOT_ASSESSMENT";

    const offeringId = optStr(form, "offeringId");
    const professorName = optStr(form, "professor");
    let topicIds = form.getAll("topicIds").map(String).filter(Boolean);
    await assertBelongsToCourse(courseId, { topicIds, offeringId });

    const buf = Buffer.from(await file.arrayBuffer());
    const extractedText = TEXT_TYPES.includes(mime) ? buf.toString("utf8").slice(0, 200_000) : null;
    const storageKey = await putObject(buf, file.name);

    let suggested = false;
    const ai = getAI();
    if (ai && topicIds.length === 0 && extractedText) {
      const topics = await db.topic.findMany({ where: { courseId } });
      const names = await ai.suggestTopicTags({ title, text: extractedText, topics: topics.map((t) => t.name) });
      topicIds = topics.filter((t) => names.includes(t.name)).map((t) => t.id);
      suggested = topicIds.length > 0;
    }

    const professorId = professorName
      ? (
          await db.professor.upsert({
            where: { schoolId_name: { schoolId: user.schoolId, name: professorName } },
            create: { schoolId: user.schoolId, name: professorName },
            update: {},
          })
        ).id
      : null;

    const material = await db.material.create({
      data: {
        courseId,
        uploaderId: user.id,
        title,
        description: optStr(form, "description"),
        kind,
        assessmentStatus,
        offeringId,
        professorId,
        storageKey,
        fileName: file.name.slice(0, 200),
        mimeType: mime,
        sizeBytes: file.size,
        extractedText,
        topics: { connect: topicIds.map((id) => ({ id })) },
      },
      include: { offering: { include: { term: true } } },
    });

    let msg = "Uploaded.";
    if (kind === "SYLLABUS" && extractedText) {
      await db.course.update({ where: { id: courseId }, data: { syllabusText: extractedText } });
      await runJob("guide.buildTopics", { courseId });
      msg += " The course topic structure was rebuilt from this syllabus.";
    }
    if (suggested) msg += " Topics were suggested by the AI from the file's text. Please check them.";
    if (!canGroundAI({ kind, assessmentStatus, termEndsOn: material.offering?.term.endsOn })) {
      msg += " Because it may still be graded, it's marked as possibly live.";
    }
    if (topicIds.length === 0) msg += " Tip: tag it with topics so classmates can find it.";
    revalidatePath(`/courses/${courseId}/materials`);
    return { ok: msg };
  });
}

/**
 * Any enrolled student can move an assessment toward "possibly live" (the
 * safer direction). Only the uploader can mark it retired. Nobody can
 * reclassify an assessment as "not an assessment" — that would lift the gate.
 */
export async function updateMaterialStatus(materialId: string, status: AssessmentStatus) {
  const user = await requireUser();
  const m = await db.material.findUniqueOrThrow({ where: { id: materialId } });
  await assertCanContribute(user, m.courseId);
  if (!ASSESSMENT_KINDS.includes(m.kind)) return;
  if (status !== "POSSIBLY_LIVE" && status !== "RETIRED") return;
  if (status === "RETIRED" && m.uploaderId !== user.id) return;
  await db.material.update({ where: { id: materialId }, data: { assessmentStatus: status } });
  revalidatePath(`/courses/${m.courseId}/materials`);
}
