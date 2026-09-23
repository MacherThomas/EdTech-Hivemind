import Link from "next/link";
import { db } from "@/lib/db";
import { config } from "@/lib/config";
import { formatMoney } from "@/lib/format";
import { courseTutors, tutorEligibility } from "@/lib/tutors";
import { loadCourse } from "../data";
import { saveCourseRate } from "../../../actions/tutoring";
import { ActionForm } from "@/components/ActionForm";
import { Notice } from "@/components/Badges";
import { SubmitButton } from "@/components/SubmitButton";

export const metadata = { title: "Tutors" };

export default async function TutorsPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const { user, enrolled } = await loadCourse(courseId);
  const [tutors, mine, profile] = await Promise.all([
    courseTutors(courseId),
    tutorEligibility(user.id, courseId),
    db.tutorProfile.findUnique({ where: { userId: user.id }, include: { rates: { where: { courseId } }, availability: true } }),
  ]);
  const myRate = profile?.rates[0];

  return (
    <div className="two-col">
      <section className="stack" aria-labelledby="tutors-h">
        <h2 id="tutors-h">Tutors for this course</h2>
        <p className="muted">
          Nobody applies to be a tutor. Students show up here once their answers, resolved threads and knowledge-base contributions in this
          course earn enough reputation. Tutors set their own prices.
        </p>
        {tutors.length === 0 ? (
          <Notice title="No tutors yet.">
            Tutors emerge as people help in chat. Answer questions and write explanations, and you could be the first.
          </Notice>
        ) : (
          <ol className="list-plain">
            {tutors.map((t, i) => (
              <li key={t.userId} className="card stack-s">
                <div className="between">
                  <h3 style={{ margin: 0 }}>
                    <span className="visually-hidden">Rank {i + 1}: </span>
                    {t.displayName}
                  </h3>
                  <span className="badge badge-tutor"><span aria-hidden="true">★</span> {t.rep.score} course reputation</span>
                </div>
                <p className="small" style={{ margin: 0 }}>
                  {t.rep.resolvedAnswers} resolved answers · {t.rep.entriesContributed} knowledge-base entries · {t.rep.upvotesReceived} upvotes
                  {t.rep.sessionsCompleted > 0 && ` · ${t.rep.sessionsCompleted} sessions`}
                  {t.avgRating != null && ` · ${t.avgRating.toFixed(1)}/5 from ${t.rep.ratingCount} ratings`}
                </p>
                {t.profile?.bio && <p style={{ margin: 0 }}>{t.profile.bio}</p>}
                {t.bookable && t.rate && t.profile ? (
                  <div className="cluster">
                    <strong>{formatMoney(t.rate.priceCents, t.rate.currency)}</strong>
                    <span className="small muted">per {t.rate.sessionMinutes}-min session</span>
                    {t.userId !== user.id && (
                      <Link className="btn btn-primary btn-small" href={`/courses/${courseId}/tutors/${t.profile.id}`}>See times &amp; book</Link>
                    )}
                  </div>
                ) : (
                  <p className="small muted" style={{ margin: 0 }}>Top helper. Not taking paid sessions right now.</p>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      <aside className="stack-s" aria-labelledby="me-h">
        <h2 id="me-h">Tutor in this course</h2>
        {!enrolled ? (
          <p className="muted">Add this course to your courses to build reputation here.</p>
        ) : mine.eligible ? (
          <div className="card stack-s">
            <p className="small" style={{ margin: 0 }}>You&apos;ve earned tutor status here ({mine.rep.score} reputation).</p>
            {(!profile || profile.payoutStatus !== "ACTIVE" || profile.availability.length === 0) && (
              <Notice kind="warning">
                Before students can book you, finish payout setup and add weekly availability on your <Link href="/profile">profile</Link>.
              </Notice>
            )}
            <ActionForm action={saveCourseRate.bind(null, courseId)}>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="price">Price per session (€)</label>
                  <input id="price" name="price" type="number" step="0.5" min={config.tutoring.minPriceCents / 100} max={config.tutoring.maxPriceCents / 100} required defaultValue={myRate ? myRate.priceCents / 100 : 20} />
                </div>
                <div className="field">
                  <label htmlFor="sessionMinutes">Session length</label>
                  <select id="sessionMinutes" name="sessionMinutes" defaultValue={String(myRate?.sessionMinutes ?? 60)}>
                    {[30, 45, 60, 90].map((m) => <option key={m} value={m}>{m} minutes</option>)}
                  </select>
                </div>
              </div>
              <label className="radio-row" style={{ fontWeight: 400 }}>
                <input type="checkbox" name="active" defaultChecked={myRate?.active ?? true} /> List me as a tutor for this course
              </label>
              <SubmitButton small>Save</SubmitButton>
            </ActionForm>
          </div>
        ) : (
          <div className="card stack-s">
            <p className="small" style={{ margin: 0 }}>
              Your reputation here: <strong>{mine.rep.score}</strong>. Tutoring opens at {config.tutors.minCourseReputation} with at least{" "}
              {config.tutors.minValidatedContributions} resolved answers or knowledge-base entries.
            </p>
            <div className="meter" role="progressbar" aria-label="Progress toward tutor status" aria-valuemin={0} aria-valuemax={config.tutors.minCourseReputation} aria-valuenow={Math.min(mine.rep.score, config.tutors.minCourseReputation)}>
              <span style={{ width: `${Math.min(100, (mine.rep.score / config.tutors.minCourseReputation) * 100)}%` }} />
            </div>
            <p className="small muted" style={{ margin: 0 }}>
              {mine.needs.score > 0 && `${mine.needs.score} more reputation. `}
              {mine.needs.validated > 0 && `${mine.needs.validated} more resolved answer(s) or entries.`}
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}
