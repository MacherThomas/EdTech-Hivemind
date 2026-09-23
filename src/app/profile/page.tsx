import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { saveDisplayName } from "../actions/auth";
import { saveAvailability, saveTutorProfile, setupPayouts } from "../actions/tutoring";
import { ActionForm } from "@/components/ActionForm";
import { Notice } from "@/components/Badges";
import { SubmitButton } from "@/components/SubmitButton";

export const metadata = { title: "Profile" };

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export default async function ProfilePage() {
  const user = await requireUser();
  const [profile, reps] = await Promise.all([
    db.tutorProfile.findUnique({ where: { userId: user.id }, include: { availability: true } }),
    db.courseReputation.findMany({ where: { userId: user.id }, include: { course: true }, orderBy: { score: "desc" } }),
  ]);
  const byDay = new Map(profile?.availability.map((a) => [a.weekday, a]) ?? []);

  return (
    <div className="stack" style={{ maxWidth: 760 }}>
      <h1>Profile</h1>
      <section className="card stack-s" aria-labelledby="acct-h">
        <h2 id="acct-h" style={{ fontSize: "var(--type-h3-size)", lineHeight: "var(--type-h3-lh)" }}>Account</h2>
        <p className="small" style={{ margin: 0 }}>
          Verified email: {user.email} ({user.school.name}). That, your display name and your activity is all this platform stores about you.
        </p>
        <ActionForm action={saveDisplayName}>
          <input type="hidden" name="next" value="/profile" />
          <div className="field">
            <label htmlFor="displayName">Display name</label>
            <input id="displayName" name="displayName" type="text" required minLength={2} maxLength={40} defaultValue={user.displayName} />
          </div>
          <SubmitButton small variant="secondary">Save name</SubmitButton>
        </ActionForm>
      </section>

      <section className="card stack-s" aria-labelledby="rep-h">
        <h2 id="rep-h" style={{ fontSize: "var(--type-h3-size)", lineHeight: "var(--type-h3-lh)" }}>Reputation</h2>
        <p className="small" style={{ margin: 0 }}>Total: <strong>{user.reputation}</strong></p>
        {reps.length === 0 ? (
          <p className="small muted">Answer questions and share explanations to build reputation in your courses.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th scope="col">Course</th><th scope="col">Score</th><th scope="col">Upvotes</th><th scope="col">Resolved</th><th scope="col">Entries</th></tr>
              </thead>
              <tbody>
                {reps.map((r) => (
                  <tr key={r.courseId}>
                    <td>{r.course.code}</td><td>{r.score}</td><td>{r.upvotesReceived}</td><td>{r.resolvedAnswers}</td><td>{r.entriesContributed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card stack-s" aria-labelledby="tutor-h">
        <h2 id="tutor-h" style={{ fontSize: "var(--type-h3-size)", lineHeight: "var(--type-h3-lh)" }}>Tutoring</h2>
        <p className="small" style={{ margin: 0 }}>
          You appear as a tutor in a course automatically once your reputation there is high enough. Set your price in that course&apos;s
          Tutors tab. The settings below apply to all your courses.
        </p>
        <ActionForm action={saveTutorProfile}>
          <div className="field">
            <label htmlFor="bio">Short bio</label>
            <textarea id="bio" name="bio" maxLength={1000} defaultValue={profile?.bio ?? ""} style={{ minHeight: 80 }} />
          </div>
          <div className="field">
            <label htmlFor="timezone">Timezone</label>
            <input id="timezone" name="timezone" type="text" defaultValue={profile?.timezone ?? "Europe/Madrid"} />
          </div>
          <label className="radio-row" style={{ fontWeight: 400 }}>
            <input type="checkbox" name="active" defaultChecked={profile?.active ?? true} /> Accepting bookings
          </label>
          <SubmitButton small variant="secondary">Save tutor profile</SubmitButton>
        </ActionForm>

        <h3>Weekly availability</h3>
        <ActionForm action={saveAvailability}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th scope="col">Day</th><th scope="col">From</th><th scope="col">To</th></tr>
              </thead>
              <tbody>
                {DAYS.map((d, i) => (
                  <tr key={d}>
                    <th scope="row">{d}</th>
                    <td>
                      <label htmlFor={`start-${i}`} className="visually-hidden">{d} from</label>
                      <input id={`start-${i}`} name={`start-${i}`} type="time" step={900} defaultValue={byDay.has(i) ? hhmm(byDay.get(i)!.startMinute) : ""} />
                    </td>
                    <td>
                      <label htmlFor={`end-${i}`} className="visually-hidden">{d} to</label>
                      <input id={`end-${i}`} name={`end-${i}`} type="time" step={900} defaultValue={byDay.has(i) ? hhmm(byDay.get(i)!.endMinute) : ""} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <SubmitButton small variant="secondary">Save availability</SubmitButton>
        </ActionForm>

        <h3>Payouts</h3>
        <p className="small" style={{ margin: 0 }}>
          Payouts are set up on the payment processor&apos;s own pages. This platform never collects your bank details or ID documents.
        </p>
        {profile?.payoutStatus === "ACTIVE" ? (
          <p className="badge badge-verified"><span aria-hidden="true">✓</span> Payout account connected</p>
        ) : (
          <form action={setupPayouts}>
            <SubmitButton small>Set up payouts</SubmitButton>
          </form>
        )}
        {process.env.PAYMENTS_PROVIDER !== "stripe_connect" && (
          <Notice kind="warning" title="Test mode.">Payouts are simulated in this build. How payouts to student tutors are structured is still being confirmed with IE.</Notice>
        )}
      </section>
    </div>
  );
}
