import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { enroll } from "../actions/courses";
import { SubmitButton } from "@/components/SubmitButton";

export const metadata = { title: "Courses" };

export default async function CoursesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireUser();
  const { q = "" } = await searchParams;
  const query = q.trim();
  const courses = await db.course.findMany({
    where: {
      schoolId: user.schoolId,
      ...(query ? { OR: [{ code: { contains: query, mode: "insensitive" } }, { name: { contains: query, mode: "insensitive" } }] } : {}),
    },
    include: {
      enrollments: { where: { userId: user.id }, select: { id: true } },
      _count: { select: { enrollments: true, threads: true, materials: true } },
    },
    orderBy: { code: "asc" },
    take: 60,
  });
  return (
    <div className="stack">
      <div className="between">
        <h1>Courses at {user.school.name}</h1>
        <Link href="/courses/new" className="btn btn-secondary">Add a missing course</Link>
      </div>
      <form role="search" className="cluster" action="/courses">
        <label htmlFor="q" className="visually-hidden">Search courses</label>
        <input id="q" name="q" type="search" placeholder="Course code or name" defaultValue={query} style={{ maxWidth: 420 }} />
        <button className="btn btn-primary" type="submit">Search</button>
      </form>
      {courses.length === 0 ? (
        <p>
          No courses match. <Link href="/courses/new">Add it</Link>, and you&apos;ll be the first one there.
        </p>
      ) : (
        <ul className="grid list-plain" style={{ gap: 16 }}>
          {courses.map((c) => (
            <li key={c.id} className="card stack-s" style={{ marginTop: 0 }}>
              <p className="small muted" style={{ margin: 0 }}>{c.code}</p>
              <h2 style={{ fontSize: "var(--type-h4-size)", lineHeight: "var(--type-h4-lh)", fontWeight: 700 }}>
                <Link href={`/courses/${c.id}/chat`}>{c.name}</Link>
              </h2>
              <p className="small muted">
                {c._count.enrollments} students · {c._count.threads} threads · {c._count.materials} materials
              </p>
              {c.enrollments.length ? (
                <span className="badge badge-verified"><span aria-hidden="true">✓</span> In your courses</span>
              ) : (
                <form action={enroll.bind(null, c.id)}>
                  <SubmitButton variant="secondary" small>Add to my courses</SubmitButton>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
