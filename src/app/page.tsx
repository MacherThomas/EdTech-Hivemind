import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { formatDate, formatDateTime, timeAgo } from "@/lib/format";

/**
 * Cross-course home dashboard — a view over data that already exists:
 * upcoming study sessions and deadlines, the user's own weak topics (private),
 * tutoring sessions, and recent activity in their courses.
 */
export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/signin");
  if (!user.displayName) redirect("/welcome");

  const enrollments = await db.enrollment.findMany({ where: { userId: user.id }, include: { course: true }, orderBy: { createdAt: "asc" } });
  const courseIds = enrollments.map((e) => e.courseId);
  const [plans, weak, tutoring, activity] = await Promise.all([
    db.studyPlan.findMany({
      where: { userId: user.id, status: "ACTIVE" },
      include: {
        course: true,
        sessions: { where: { status: { in: ["UPCOMING", "IN_PROGRESS"] } }, orderBy: { position: "asc" }, take: 1 },
      },
      orderBy: { anchorDate: "asc" },
    }),
    db.userTopicProgress.findMany({
      where: { userId: user.id, status: "STRUGGLING", plan: { status: "ACTIVE" } },
      include: { topic: { include: { course: true } } },
      take: 6,
    }),
    db.tutoringSession.findMany({
      where: {
        OR: [{ studentId: user.id }, { tutor: { userId: user.id } }],
        status: { in: ["REQUESTED", "CONFIRMED", "DISPUTED"] },
      },
      include: { course: true, student: { select: { displayName: true } }, tutor: { include: { user: { select: { displayName: true } } } } },
      orderBy: { scheduledStart: "asc" },
      take: 5,
    }),
    db.chatThread.findMany({
      where: { courseId: { in: courseIds }, moderation: { not: "HIDDEN" } },
      include: { course: true, _count: { select: { messages: true } } },
      orderBy: { lastActivityAt: "desc" },
      take: 8,
    }),
  ]);

  return (
    <div className="stack">
      <h1>Hi, {user.displayName}</h1>
      {enrollments.length === 0 ? (
        <div className="card stack-s">
          <h2>Add your courses</h2>
          <p>Each course has its own chat, study guide, materials and tutors, all built by the students taking it.</p>
          <Link href="/courses" className="btn btn-primary">Find your courses</Link>
        </div>
      ) : (
        <>
          <section aria-labelledby="my-courses" className="stack-s">
            <div className="between">
              <h2 id="my-courses">My courses</h2>
              <Link href="/courses">Add a course</Link>
            </div>
            <div className="grid">
              {enrollments.map((e) => (
                <Link key={e.id} href={`/courses/${e.courseId}/chat`} className="card-link">
                  <div className="card">
                    <p className="small muted" style={{ marginBottom: 4 }}>{e.course.code}</p>
                    <h3>{e.course.name}</h3>
                  </div>
                </Link>
              ))}
            </div>
          </section>

          <div className="two-col">
            <section aria-labelledby="study" className="stack-s">
              <h2 id="study">Study plans</h2>
              {plans.length === 0 ? (
                <p className="muted">No active study plans. Open a course&apos;s study guide and set an exam date to get one.</p>
              ) : (
                <ul className="list-plain">
                  {plans.map((p) => (
                    <li key={p.id} className="card">
                      <div className="between">
                        <h3 style={{ margin: 0 }}>
                          <Link href={`/courses/${p.courseId}/guide/plan/${p.id}`}>{p.course.code}: {p.anchorLabel}</Link>
                        </h3>
                        <span className="small muted">{formatDate(p.anchorDate)}</span>
                      </div>
                      {p.sessions[0] ? (
                        <p className="small" style={{ margin: "8px 0 0" }}>Next: {p.sessions[0].title} · {formatDate(p.sessions[0].scheduledFor)}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
              {weak.length > 0 && (
                <>
                  <h3>Topics to focus on</h3>
                  <p className="small muted">Only you can see this.</p>
                  <ul>
                    {weak.map((w) => (
                      <li key={w.id}>
                        {w.topic.name} <span className="muted small">({w.topic.course.code}, {Math.round(w.mastery * 100)}%)</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>

            <section aria-labelledby="tutoring" className="stack-s">
              <h2 id="tutoring">Tutoring</h2>
              {tutoring.length === 0 ? (
                <p className="muted">No upcoming sessions.</p>
              ) : (
                <ul className="list-plain">
                  {tutoring.map((t) => (
                    <li key={t.id} className="card small">
                      <strong>{t.course.code}</strong> · {formatDateTime(t.scheduledStart)}
                      <br />
                      {t.studentId === user.id ? `with ${t.tutor.user.displayName}` : `tutoring ${t.student.displayName}`} ·{" "}
                      <span className="badge">{t.status.toLowerCase()}</span>
                    </li>
                  ))}
                </ul>
              )}
              <Link href="/tutoring">All tutoring sessions</Link>
            </section>
          </div>

          <section aria-labelledby="activity" className="stack-s">
            <h2 id="activity">Recent activity</h2>
            {activity.length === 0 ? (
              <p className="muted">Nothing yet. Ask the first question in one of your courses.</p>
            ) : (
              <ul className="list-plain">
                {activity.map((t) => (
                  <li key={t.id}>
                    <Link href={`/courses/${t.courseId}/chat/${t.id}`}>{t.title}</Link>{" "}
                    <span className="small muted">
                      {t.course.code} · {t._count.messages} replies · {timeAgo(t.lastActivityAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
