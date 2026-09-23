"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { startEmailChallenge, verifyEmailChallenge } from "@/lib/auth/challenge";
import { createSession, destroySession, getCurrentUser } from "@/lib/auth/session";

export type SignInState = { step: "email" | "code"; email?: string; error?: string; info?: string };

export async function signInAction(prev: SignInState, form: FormData): Promise<SignInState> {
  if (form.get("intent") === "restart") return { step: "email" };
  if (prev.step === "email" || form.get("intent") === "resend") {
    const email = String(form.get("email") ?? prev.email ?? "");
    const res = await startEmailChallenge(email);
    if (!res.ok) return { step: "email", email, error: res.error };
    return { step: "code", email: res.email, info: `We sent a 6-digit code to ${res.email}.` };
  }
  const code = String(form.get("code") ?? "");
  const res = await verifyEmailChallenge(prev.email ?? "", code);
  if (!res.ok) return { ...prev, error: res.error, info: undefined };
  await createSession(res.user.id);
  redirect(res.user.displayName ? "/" : "/welcome");
}

export async function signOut() {
  await destroySession();
  redirect("/signin");
}

export async function saveDisplayName(_: unknown, form: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/signin");
  const parsed = z.string().trim().min(2).max(40).safeParse(form.get("displayName"));
  if (!parsed.success) return { error: "Choose a display name between 2 and 40 characters." };
  await db.user.update({ where: { id: user.id }, data: { displayName: parsed.data } });
  redirect(String(form.get("next") ?? "/"));
}
