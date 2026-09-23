"use server";

import type { KnowledgeStability } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { config } from "@/lib/config";
import { requireUser } from "@/lib/auth/session";
import { assertBelongsToCourse, assertCanContribute } from "@/lib/permissions";
import { validateEntryVersioning } from "@/lib/hivemind";
import { runJob } from "@/jobs";
import { handle, optStr, str, UserError } from "./util";
import type { FormState } from "@/components/ActionForm";

const EntryInput = z.object({
  title: z.string().trim().min(5, "Title needs 5+ characters.").max(160),
  body: z.string().trim().min(20, "Explanations need at least 20 characters.").max(12000),
  stability: z.enum(["TERM_STABLE", "TERM_SPECIFIC"]),
});

/** Direct contributions from established members count as community-verified; others start unverified. */
export async function contributeEntry(courseId: string, _: FormState, form: FormData) {
  return handle(async () => {
    const user = await requireUser();
    await assertCanContribute(user, courseId);
    const input = EntryInput.parse({ title: str(form, "title"), body: str(form, "body"), stability: str(form, "stability") || "TERM_STABLE" });
    const offeringId = optStr(form, "offeringId");
    await assertBelongsToCourse(courseId, { topicIds: [optStr(form, "topicId")], offeringId });
    validateEntryVersioning({ stability: input.stability as KnowledgeStability, offeringId });
    const rep = await db.courseReputation.findUnique({ where: { userId_courseId: { userId: user.id, courseId } } });
    const trusted = (rep?.score ?? 0) >= config.promotion.trustedResolverReputation;
    const supersedesId = optStr(form, "supersedesId");
    let version = 1;
    if (supersedesId) {
      const prev = await db.knowledgeEntry.findUniqueOrThrow({ where: { id: supersedesId }, include: { supersededBy: true } });
      if (prev.courseId !== courseId) throw new UserError("Entry not found.");
      if (prev.supersededBy) throw new UserError("There's already a newer version of this entry.");
      version = prev.version + 1;
    }
    await db.knowledgeEntry.create({
      data: {
        courseId,
        topicId: optStr(form, "topicId"),
        ...input,
        offeringId: input.stability === "TERM_SPECIFIC" ? offeringId : null,
        origin: "COMMUNITY",
        verification: trusted ? "COMMUNITY_VERIFIED" : "UNVERIFIED",
        source: "DIRECT_CONTRIBUTION",
        contributorId: user.id,
        supersedesId,
        version,
      },
    });
    await runJob("reputation.recompute", { userId: user.id, courseId });
    revalidatePath(`/courses/${courseId}/knowledge`);
    return { ok: supersedesId ? "New version published. The previous one is kept in history." : "Added to the study guide." };
  });
}

export async function recordEntryView(entryId: string) {
  const user = await requireUser();
  await db.knowledgeEntryView.create({ data: { userId: user.id, entryId } });
}
