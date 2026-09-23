import { config } from "../config";

export type EmailCheck =
  | { ok: true; email: string; localPart: string; domain: string }
  | { ok: false; reason: string };

const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;

/**
 * Pure syntactic + policy checks. Whether the domain belongs to a school is
 * decided against the SchoolDomain table, not here.
 */
export function checkEmailShape(raw: string): EmailCheck {
  const email = raw.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { ok: false, reason: "Enter a valid email address." };
  const [localPart, domain] = email.split("@");
  const base = localPart.split("+")[0];
  const blocked = config.auth.blockedLocalParts as readonly string[];
  if (blocked.includes(base) || blocked.some((b) => base === `${b}s`)) {
    return {
      ok: false,
      reason: "Departmental or shared mailboxes can't sign up. Use your personal university email.",
    };
  }
  return { ok: true, email, localPart, domain };
}
