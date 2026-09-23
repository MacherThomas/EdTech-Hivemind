import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "../db";
import { config } from "../config";
import { hmac, newToken } from "./crypto";

const COOKIE = "hm_session";

export async function createSession(userId: string) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + config.auth.sessionTtlDays * 86_400_000);
  await db.authSession.create({ data: { tokenHash: hmac(token), userId, expiresAt } });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await db.authSession.deleteMany({ where: { tokenHash: hmac(token) } });
  jar.delete(COOKIE);
}

export const getCurrentUser = cache(async () => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const session = await db.authSession.findUnique({
    where: { tokenHash: hmac(token) },
    include: { user: { include: { school: true } } },
  });
  if (!session || session.expiresAt < new Date()) return null;
  return session.user;
});

/** For pages/actions that require a signed-in user with a display name. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/signin");
  if (!user.displayName) redirect("/welcome");
  return user;
}

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;
