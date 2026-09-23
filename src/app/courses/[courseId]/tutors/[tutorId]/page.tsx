import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { config } from "@/lib/config";
import { formatDateTime, formatMoney } from "@/lib/format";
import { tutorEligibility } from "@/lib/tutors";
import { generateSlots, sessionEnd } from "@/lib/tutoring";
import { loadCourse } from "../../data";
import { bookSession } from "../../../../actions/tutoring";
import { ActionForm } from "@/components/ActionForm";
import { Notice } from "@/components/Badges";
import { SubmitButton } from "@/components/SubmitButton";

export default async function BookTutorPage({ params }: { params: Promise<{ courseId: string; tutorId: string }> }) {
  const { courseId, tutorId } = await params;
  const { user } = await loadCourse(courseId);
  const tutor = await db.tutorProfile.findUnique({
    where: { id: tutorId },
    include: { user: { select: { displayName: true } }, rates: { where: { courseId, active: true } }, availability: true },
  });
  const rate = tutor?.rates[0];
  if (!tutor || !rate || !tutor.active || tutor.payoutStatus !== "ACTIVE" || !(await tutorEligibility(tutor.userId, courseId)).eligible) notFound();

  const booked = await db.tutoringSession.findMany({
    where: { tutorId, status: { in: ["REQUESTED", "CONFIRMED"] }, scheduledStart: { gte: new Date(Date.now() - 86_400_000) } },
  });
  const slots = generateSlots({
    windows: tutor.availability,
    timezone: tutor.timezone,
    durationMinutes: rate.sessionMinutes,
    booked: booked.map((b) => ({ start: b.scheduledStart, end: sessionEnd(b) })),
  }).slice(0, 40);

  return (
    <div className="stack" style={{ maxWidth: 720 }}>
      <p className="small"><Link href={`/courses/${courseId}/tutors`}>← Tutors</Link></p>
      <h2>Book {tutor.user.displayName}</h2>
      <p>
        <strong>{formatMoney(rate.priceCents, rate.currency)}</strong> for {rate.sessionMinutes} minutes. Times shown in Madrid time.
      </p>
      <Notice>
        Payment is handled by the payment processor. This platform never sees or stores card or bank details. Your payment is held
        until the session happens. Free cancellation up to {config.tutoring.freeCancellationHours} h before the start. Either of you can
        open a dispute up to {config.tutoring.disputeWindowDays} days after the session.
      </Notice>
      {process.env.PAYMENTS_PROVIDER !== "stripe_connect" && (
        <Notice kind="warning" title="Test mode.">Payments are simulated in this build. No money moves.</Notice>
      )}
      {tutor.userId === user.id ? (
        <p>This is you.</p>
      ) : slots.length === 0 ? (
        <p className="muted">No open times in the next {config.tutoring.bookingHorizonDays} days.</p>
      ) : (
        <div className="card">
          <ActionForm action={bookSession.bind(null, courseId, tutorId)}>
            <fieldset className="field">
              <legend>Pick a time</legend>
              <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 200px), 1fr))", gap: 8 }}>
                {slots.map((s) => (
                  <label key={s.toISOString()} className="radio-row" style={{ fontWeight: 400 }}>
                    <input type="radio" name="slot" value={s.toISOString()} required /> {formatDateTime(s)}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="field">
              <label htmlFor="note">What do you want to cover? (optional)</label>
              <textarea id="note" name="note" maxLength={1000} style={{ minHeight: 80 }} />
            </div>
            <SubmitButton pendingLabel="Requesting…">Request session &amp; authorise {formatMoney(rate.priceCents, rate.currency)}</SubmitButton>
          </ActionForm>
        </div>
      )}
    </div>
  );
}
