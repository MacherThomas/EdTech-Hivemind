import Link from "next/link";
import { db } from "@/lib/db";
import { config } from "@/lib/config";
import { requireUser } from "@/lib/auth/session";
import { formatDateTime, formatMoney } from "@/lib/format";
import { canComplete, canDispute, cancellationTerms } from "@/lib/tutoring";
import { cancelSession, completeTutoring, confirmSession, openDispute, rateSession, resolveDispute } from "../actions/tutoring";
import { ActionForm } from "@/components/ActionForm";
import { Notice } from "@/components/Badges";
import { SubmitButton } from "@/components/SubmitButton";

export const metadata = { title: "Tutoring" };

const STATUS: Record<string, string> = { REQUESTED: "Requested", CONFIRMED: "Confirmed", COMPLETED: "Completed", CANCELLED: "Cancelled", DISPUTED: "Disputed" };

export default async function TutoringPage({ searchParams }: { searchParams: Promise<{ booked?: string }> }) {
  const user = await requireUser();
  const { booked } = await searchParams;
  const sessions = await db.tutoringSession.findMany({
    where: { OR: [{ studentId: user.id }, { tutor: { userId: user.id } }] },
    include: {
      course: true,
      payment: true,
      student: { select: { displayName: true } },
      tutor: { include: { user: { select: { displayName: true } } } },
    },
    orderBy: { scheduledStart: "desc" },
    take: 100,
  });

  return (
    <div className="stack" style={{ maxWidth: 900 }}>
      <h1>Tutoring</h1>
      {booked && <Notice kind="success">Session requested. The tutor will confirm it. Your payment is held until the session happens.</Notice>}
      {sessions.length === 0 && (
        <p className="muted">No sessions yet. Find tutors in each course&apos;s <strong>Tutors</strong> tab.</p>
      )}
      <ul className="list-plain">
        {sessions.map((s) => {
          const role = s.studentId === user.id ? "student" : "tutor";
          const other = role === "student" ? s.tutor.user.displayName : s.student.displayName;
          const terms = cancellationTerms({ status: s.status, scheduledStart: s.scheduledStart, by: role });
          return (
            <li key={s.id} className="card stack-s">
              <div className="between">
                <h2 style={{ fontSize: "var(--type-h4-size)", lineHeight: "var(--type-h4-lh)", fontWeight: 700, margin: 0 }}>
                  <Link href={`/courses/${s.courseId}/tutors`}>{s.course.code}</Link> · {role === "student" ? `with ${other}` : `tutoring ${other}`}
                </h2>
                <span className="badge">{STATUS[s.status]}</span>
              </div>
              <p className="small" style={{ margin: 0 }}>
                {formatDateTime(s.scheduledStart)} · {s.durationMinutes} min · {formatMoney(s.priceCents, s.currency)}
                {s.payment && ` · payment ${s.payment.status.toLowerCase()}`}
              </p>
              {s.studentNote && <p className="small" style={{ margin: 0 }}><strong>Student&apos;s note:</strong> {s.studentNote}</p>}
              {s.status === "CANCELLED" && (
                <p className="small" style={{ margin: 0 }}>
                  Cancelled{s.cancellationReason ? `: ${s.cancellationReason}` : ""}. {s.refundEligible ? "Refunded in full." : "Not refunded (late cancellation)."}
                </p>
              )}
              {s.status === "DISPUTED" && (
                <Notice kind="warning" title="Dispute open.">
                  {s.disputeReason} Both of you can see this. The tutor can refund, or the student can withdraw the dispute. If it isn&apos;t resolved
                  within {config.tutoring.disputeWindowDays} days it goes to platform support.
                </Notice>
              )}
              {s.disputeResolution && <p className="small" style={{ margin: 0 }}>Dispute resolved: {s.disputeResolution}</p>}
              {s.rating != null && <p className="small" style={{ margin: 0 }}>Rated {s.rating}/5{s.review ? `: “${s.review}”` : ""}</p>}

              <div className="cluster">
                {role === "tutor" && s.status === "REQUESTED" && (
                  <form action={confirmSession.bind(null, s.id)}>
                    <SubmitButton small>Confirm</SubmitButton>
                  </form>
                )}
                {canComplete(s) && (
                  <form action={completeTutoring.bind(null, s.id)}>
                    <SubmitButton small variant="secondary">Mark as completed</SubmitButton>
                  </form>
                )}
                {s.status === "DISPUTED" && role === "tutor" && (
                  <form action={resolveDispute.bind(null, s.id, "refund")}>
                    <SubmitButton small variant="secondary">Issue full refund</SubmitButton>
                  </form>
                )}
                {s.status === "DISPUTED" && role === "student" && (
                  <form action={resolveDispute.bind(null, s.id, "withdraw")}>
                    <SubmitButton small variant="secondary">Withdraw dispute</SubmitButton>
                  </form>
                )}
                {(s.status === "REQUESTED" || s.status === "CONFIRMED") && (
                  <details>
                    <summary className="btn btn-ghost btn-small">{role === "tutor" && s.status === "REQUESTED" ? "Decline" : "Cancel"}</summary>
                    <ActionForm action={cancelSession.bind(null, s.id)} className="stack-s">
                      <p className="small" style={{ margin: 0 }}>{terms.explanation}</p>
                      <div className="field">
                        <label htmlFor={`cr-${s.id}`}>Reason (optional)</label>
                        <input id={`cr-${s.id}`} name="reason" type="text" maxLength={300} />
                      </div>
                      <SubmitButton small variant="secondary">Confirm cancellation</SubmitButton>
                    </ActionForm>
                  </details>
                )}
                {canDispute(s) && (
                  <details>
                    <summary className="btn btn-ghost btn-small">Open a dispute</summary>
                    <ActionForm action={openDispute.bind(null, s.id)} className="stack-s">
                      <div className="field">
                        <label htmlFor={`dr-${s.id}`}>What went wrong?</label>
                        <textarea id={`dr-${s.id}`} name="reason" required minLength={10} style={{ minHeight: 80 }} />
                      </div>
                      <SubmitButton small variant="secondary">Open dispute</SubmitButton>
                    </ActionForm>
                  </details>
                )}
                {role === "student" && s.status === "COMPLETED" && s.rating == null && (
                  <details>
                    <summary className="btn btn-ghost btn-small">Rate this session</summary>
                    <ActionForm action={rateSession.bind(null, s.id)} className="stack-s">
                      <fieldset className="field">
                        <legend>Rating</legend>
                        <div className="cluster">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <label key={n} className="radio-row" style={{ fontWeight: 400 }}>
                              <input type="radio" name="rating" value={n} required /> {n}
                            </label>
                          ))}
                        </div>
                      </fieldset>
                      <div className="field">
                        <label htmlFor={`rv-${s.id}`}>Review (optional)</label>
                        <textarea id={`rv-${s.id}`} name="review" maxLength={2000} style={{ minHeight: 80 }} />
                      </div>
                      <SubmitButton small>Submit rating</SubmitButton>
                    </ActionForm>
                  </details>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
