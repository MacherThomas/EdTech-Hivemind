"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { config } from "@/lib/config";
import { requireUser } from "@/lib/auth/session";
import { assertCanContribute, canViewCourse } from "@/lib/permissions";
import { getPayments } from "@/lib/payments";
import { tutorEligibility } from "@/lib/tutors";
import { canComplete, canDispute, canTransition, cancellationTerms, generateSlots, platformFee, sessionEnd } from "@/lib/tutoring";
import { runJob } from "@/jobs";
import { handle, optStr, str, UserError } from "./util";
import type { FormState } from "@/components/ActionForm";

async function ensureProfile(userId: string) {
  return db.tutorProfile.upsert({ where: { userId }, create: { userId }, update: {} });
}

export async function saveTutorProfile(_: FormState, form: FormData) {
  return handle(async () => {
    const user = await requireUser();
    const bio = z.string().trim().max(1000).parse(str(form, "bio"));
    const timezone = str(form, "timezone") || "Europe/Madrid";
    try {
      new Intl.DateTimeFormat("en", { timeZone: timezone });
    } catch {
      throw new UserError("Unknown timezone.");
    }
    await db.tutorProfile.upsert({
      where: { userId: user.id },
      create: { userId: user.id, bio, timezone, active: form.get("active") === "on" },
      update: { bio, timezone, active: form.get("active") === "on" },
    });
    revalidatePath("/profile");
    return { ok: "Tutor profile saved." };
  });
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
};

export async function saveAvailability(_: FormState, form: FormData) {
  return handle(async () => {
    const user = await requireUser();
    const profile = await ensureProfile(user.id);
    const windows: { weekday: number; startMinute: number; endMinute: number }[] = [];
    for (let d = 0; d < 7; d++) {
      const s = str(form, `start-${d}`);
      const e = str(form, `end-${d}`);
      if (!s && !e) continue;
      if (!s || !e) throw new UserError(`Give both a start and end time for ${DAYS[d]}.`);
      const startMinute = toMin(s);
      const endMinute = toMin(e);
      if (endMinute - startMinute < 30) throw new UserError(`${DAYS[d]}: the window must be at least 30 minutes.`);
      windows.push({ weekday: d, startMinute, endMinute });
    }
    await db.$transaction([
      db.tutorAvailability.deleteMany({ where: { tutorId: profile.id } }),
      db.tutorAvailability.createMany({ data: windows.map((w) => ({ ...w, tutorId: profile.id })) }),
    ]);
    revalidatePath("/profile");
    return { ok: windows.length ? "Availability saved." : "Availability cleared. You won't receive bookings." };
  });
}

/** Processor-hosted onboarding. The platform stores only the returned account reference. */
export async function setupPayouts() {
  const user = await requireUser();
  const profile = await ensureProfile(user.id);
  const payments = getPayments();
  const res = await payments.ensurePayoutAccount({ tutorProfileId: profile.id, existingRef: profile.payoutAccountRef });
  await db.tutorProfile.update({
    where: { id: profile.id },
    data: { payoutProvider: payments.name, payoutAccountRef: res.accountRef, payoutStatus: res.status },
  });
  if (res.onboardingUrl) redirect(res.onboardingUrl);
  revalidatePath("/profile");
}

export async function saveCourseRate(courseId: string, _: FormState, form: FormData) {
  return handle(async () => {
    const user = await requireUser();
    await assertCanContribute(user, courseId);
    const elig = await tutorEligibility(user.id, courseId);
    if (!elig.eligible) throw new UserError("Tutoring opens up once your reputation in this course passes the threshold.");
    const euros = z.coerce.number({ message: "Enter a price." }).parse(str(form, "price"));
    const priceCents = Math.round(euros * 100);
    if (priceCents < config.tutoring.minPriceCents || priceCents > config.tutoring.maxPriceCents) {
      throw new UserError(`Set a price between €${config.tutoring.minPriceCents / 100} and €${config.tutoring.maxPriceCents / 100}.`);
    }
    const sessionMinutes = z.coerce.number().int().refine((n) => [30, 45, 60, 90].includes(n), "Pick a session length.").parse(str(form, "sessionMinutes"));
    const profile = await ensureProfile(user.id);
    const active = form.get("active") === "on";
    await db.tutorCourseRate.upsert({
      where: { tutorId_courseId: { tutorId: profile.id, courseId } },
      create: { tutorId: profile.id, courseId, priceCents, sessionMinutes, active },
      update: { priceCents, sessionMinutes, active },
    });
    revalidatePath(`/courses/${courseId}/tutors`);
    return { ok: active ? "You're listed as a tutor for this course." : "Rate saved (not listed)." };
  });
}

export async function bookSession(courseId: string, tutorId: string, _: FormState, form: FormData) {
  return handle(async () => {
    const user = await requireUser();
    if (!(await canViewCourse(user, courseId))) throw new UserError("Course not found.");
    const tutor = await db.tutorProfile.findUniqueOrThrow({
      where: { id: tutorId },
      include: { rates: { where: { courseId, active: true } }, availability: true },
    });
    if (tutor.userId === user.id) throw new UserError("You can't book yourself.");
    const rate = tutor.rates[0];
    if (!rate || !tutor.active || tutor.payoutStatus !== "ACTIVE" || !tutor.payoutAccountRef) {
      throw new UserError("This tutor isn't taking bookings right now.");
    }
    const elig = await tutorEligibility(tutor.userId, courseId);
    if (!elig.eligible) throw new UserError("This tutor isn't currently listed for this course.");

    const start = new Date(str(form, "slot"));
    if (Number.isNaN(start.getTime())) throw new UserError("Pick a time slot.");
    const booked = await db.tutoringSession.findMany({
      where: { tutorId, status: { in: ["REQUESTED", "CONFIRMED"] }, scheduledStart: { gte: new Date(Date.now() - 86_400_000) } },
    });
    const slots = generateSlots({
      windows: tutor.availability,
      timezone: tutor.timezone,
      durationMinutes: rate.sessionMinutes,
      booked: booked.map((b) => ({ start: b.scheduledStart, end: sessionEnd(b) })),
    });
    if (!slots.some((s) => s.getTime() === start.getTime())) throw new UserError("That slot was just taken. Pick another one.");

    const session = await db.tutoringSession.create({
      data: {
        tutorId,
        studentId: user.id,
        courseId,
        scheduledStart: start,
        durationMinutes: rate.sessionMinutes,
        priceCents: rate.priceCents,
        currency: rate.currency,
        studentNote: optStr(form, "note"),
      },
    });
    const payments = getPayments();
    const fee = platformFee(rate.priceCents);
    const hold = await payments.authorize({
      sessionId: session.id,
      amountCents: rate.priceCents,
      currency: rate.currency,
      payoutAccountRef: tutor.payoutAccountRef,
      platformFeeCents: fee,
    });
    await db.payment.create({
      data: {
        sessionId: session.id,
        provider: payments.name,
        providerPaymentRef: hold.paymentRef,
        status: "AUTHORIZED",
        amountCents: rate.priceCents,
        platformFeeCents: fee,
        currency: rate.currency,
      },
    });
    redirect(`/tutoring?booked=${session.id}`);
  });
}

async function loadSession(sessionId: string, userId: string) {
  const s = await db.tutoringSession.findUniqueOrThrow({ where: { id: sessionId }, include: { tutor: true, payment: true } });
  const role = s.studentId === userId ? "student" : s.tutor.userId === userId ? "tutor" : null;
  if (!role) throw new UserError("Session not found.");
  return { s, role: role as "student" | "tutor" };
}

export async function confirmSession(sessionId: string) {
  const user = await requireUser();
  const { s, role } = await loadSession(sessionId, user.id);
  if (role !== "tutor" || !canTransition(s.status, "CONFIRMED")) return;
  await db.tutoringSession.update({ where: { id: sessionId }, data: { status: "CONFIRMED", confirmedAt: new Date() } });
  revalidatePath("/tutoring");
}

export async function cancelSession(sessionId: string, _: FormState, form: FormData) {
  return handle(async () => {
    const user = await requireUser();
    const { s, role } = await loadSession(sessionId, user.id);
    if (!canTransition(s.status, "CANCELLED")) throw new UserError("This session can't be cancelled.");
    const terms = cancellationTerms({ status: s.status, scheduledStart: s.scheduledStart, by: role });
    const payments = getPayments();
    if (s.payment?.providerPaymentRef) {
      if (terms.refundEligible) await payments.voidHold(s.payment.providerPaymentRef);
      else await payments.capture(s.payment.providerPaymentRef);
    }
    await db.$transaction([
      db.tutoringSession.update({
        where: { id: sessionId },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
          cancelledById: user.id,
          cancellationReason: optStr(form, "reason"),
          refundEligible: terms.refundEligible,
        },
      }),
      ...(s.payment ? [db.payment.update({ where: { id: s.payment.id }, data: { status: terms.refundEligible ? "REFUNDED" : "CAPTURED" } })] : []),
    ]);
    revalidatePath("/tutoring");
    return { ok: `Cancelled. ${terms.explanation}` };
  });
}

export async function completeTutoring(sessionId: string) {
  const user = await requireUser();
  const { s } = await loadSession(sessionId, user.id);
  if (!canComplete(s)) return;
  if (s.payment?.providerPaymentRef) await getPayments().capture(s.payment.providerPaymentRef);
  await db.$transaction([
    db.tutoringSession.update({ where: { id: sessionId }, data: { status: "COMPLETED", completedAt: new Date() } }),
    ...(s.payment ? [db.payment.update({ where: { id: s.payment.id }, data: { status: "CAPTURED" } })] : []),
  ]);
  await runJob("reputation.recompute", { userId: s.tutor.userId, courseId: s.courseId });
  revalidatePath("/tutoring");
}

export async function openDispute(sessionId: string, _: FormState, form: FormData) {
  return handle(async () => {
    const user = await requireUser();
    const { s } = await loadSession(sessionId, user.id);
    if (!canDispute(s)) throw new UserError(`Disputes can be opened from the session start until ${config.tutoring.disputeWindowDays} days after it ends.`);
    const reason = z.string().trim().min(10, "Describe what went wrong (10+ characters).").max(2000).parse(str(form, "reason"));
    await db.tutoringSession.update({
      where: { id: sessionId },
      data: { status: "DISPUTED", disputeOpenedAt: new Date(), disputeOpenedById: user.id, disputeReason: reason },
    });
    revalidatePath("/tutoring");
    return { ok: "Dispute opened. Both of you can now see it and resolve it here." };
  });
}

/**
 * Peer resolution — there's no staff role. The tutor can refund; the student
 * can withdraw. Unresolved disputes are escalated to platform support (the
 * support process itself is a launch checkpoint).
 */
export async function resolveDispute(sessionId: string, outcome: "refund" | "withdraw") {
  const user = await requireUser();
  const { s, role } = await loadSession(sessionId, user.id);
  if (s.status !== "DISPUTED") return;
  if (outcome === "refund" && role !== "tutor") return;
  if (outcome === "withdraw" && role !== "student") return;
  if (outcome === "refund" && s.payment?.providerPaymentRef) await getPayments().refund(s.payment.providerPaymentRef);
  await db.$transaction([
    db.tutoringSession.update({
      where: { id: sessionId },
      data: {
        status: "COMPLETED",
        completedAt: s.completedAt ?? new Date(),
        disputeResolvedAt: new Date(),
        disputeResolution: outcome === "refund" ? "Tutor issued a full refund." : "Student withdrew the dispute.",
      },
    }),
    ...(outcome === "refund" && s.payment ? [db.payment.update({ where: { id: s.payment.id }, data: { status: "REFUNDED" } })] : []),
  ]);
  revalidatePath("/tutoring");
}

export async function rateSession(sessionId: string, _: FormState, form: FormData) {
  return handle(async () => {
    const user = await requireUser();
    const { s, role } = await loadSession(sessionId, user.id);
    if (role !== "student" || s.status !== "COMPLETED") throw new UserError("You can rate a session after it's completed.");
    if (s.rating != null) throw new UserError("You've already rated this session.");
    const rating = z.coerce.number().int().min(1, "Pick a rating.").max(5).parse(str(form, "rating"));
    await db.tutoringSession.update({
      where: { id: sessionId },
      data: { rating, review: optStr(form, "review")?.slice(0, 2000) ?? null, reviewedAt: new Date() },
    });
    await runJob("reputation.recompute", { userId: s.tutor.userId, courseId: s.courseId });
    revalidatePath("/tutoring");
    return { ok: "Thanks for the feedback." };
  });
}
