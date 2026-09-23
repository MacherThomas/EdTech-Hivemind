import { db } from "../db";
import { config } from "../config";
import { sendEmail } from "../email";
import { checkEmailShape } from "./email-rules";
import { hmac, newCode, safeEqualHex } from "./crypto";

export async function resolveSchoolForEmail(email: string) {
  const domain = email.split("@")[1];
  const row = await db.schoolDomain.findFirst({
    where: { domain, active: true },
    include: { school: true },
  });
  return row?.school ?? null;
}

export async function startEmailChallenge(rawEmail: string): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  const check = checkEmailShape(rawEmail);
  if (!check.ok) return { ok: false, error: check.reason };
  const school = await resolveSchoolForEmail(check.email);
  if (!school) {
    const known = await db.schoolDomain.findUnique({ where: { domain: check.domain }, include: { school: true } });
    if (known) {
      const active = await db.schoolDomain.findMany({ where: { schoolId: known.schoolId, active: true }, select: { domain: true } });
      return {
        ok: false,
        error: `Only ${known.school.name} student addresses can sign up right now${active.length ? ` (${active.map((d) => `@${d.domain}`).join(", ")})` : ""}.`,
      };
    }
    return { ok: false, error: "That email domain isn't on the list of participating universities." };
  }

  // Housekeeping: expired challenges never linger.
  await db.emailChallenge.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  const recent = await db.emailChallenge.count({ where: { email: check.email } });
  if (recent >= 3) return { ok: false, error: "Too many codes requested. Wait a few minutes and try again." };

  const code = newCode();
  await db.emailChallenge.create({
    data: {
      email: check.email,
      codeHash: hmac(`${check.email}:${code}`),
      expiresAt: new Date(Date.now() + config.auth.codeTtlMinutes * 60_000),
    },
  });
  await sendEmail(
    check.email,
    `Your ${school.name} study hub sign-in code`,
    `Your sign-in code is ${code}. It expires in ${config.auth.codeTtlMinutes} minutes.\n\nIf you didn't request this, you can ignore this email.`,
  );
  return { ok: true, email: check.email };
}

/**
 * Verifies a code. On success, deletes all challenges for the email and
 * returns the user (creating it on first sign-in). Only the verified email and
 * school are stored.
 */
export async function verifyEmailChallenge(rawEmail: string, code: string) {
  const email = rawEmail.trim().toLowerCase();
  const challenges = await db.emailChallenge.findMany({
    where: { email, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (challenges.length === 0) return { ok: false as const, error: "That code has expired. Request a new one." };

  const expected = hmac(`${email}:${code.trim()}`);
  const match = challenges.find((c) => c.attempts < config.auth.maxCodeAttempts && safeEqualHex(c.codeHash, expected));
  if (!match) {
    await db.emailChallenge.updateMany({ where: { email }, data: { attempts: { increment: 1 } } });
    return { ok: false as const, error: "That code isn't right. Check the email and try again." };
  }
  await db.emailChallenge.deleteMany({ where: { email } });

  const school = await resolveSchoolForEmail(email);
  if (!school) return { ok: false as const, error: "That email domain is no longer accepted." };

  const user = await db.user.upsert({
    where: { email },
    update: {},
    create: { email, emailVerifiedAt: new Date(), schoolId: school.id, displayName: "" },
  });
  return { ok: true as const, user };
}
