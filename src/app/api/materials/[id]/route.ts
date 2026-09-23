import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { canDownload } from "@/lib/integrity";
import { getObject } from "@/lib/storage";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Sign in required", { status: 401 });
  const m = await db.material.findUnique({ where: { id }, include: { course: true, offering: { include: { term: true } } } });
  if (!m || m.course.schoolId !== user.schoolId || m.moderation === "HIDDEN") return new NextResponse("Not found", { status: 404 });
  if (!canDownload({ kind: m.kind, assessmentStatus: m.assessmentStatus, termEndsOn: m.offering?.term.endsOn })) {
    return new NextResponse("Solutions to possibly-live assessments are withheld until the assessment is retired.", { status: 403 });
  }
  const data = await getObject(m.storageKey);
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": m.mimeType,
      "Content-Disposition": `attachment; filename="${m.fileName.replace(/[^\w.\- ]/g, "_")}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
