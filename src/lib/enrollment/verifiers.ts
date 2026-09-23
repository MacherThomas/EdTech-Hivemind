/**
 * Pluggable, per-institution enrollment verification. Launch is
 * self-reported only; a school opts into a verifier via School.enrollmentVerifier
 * (e.g. "lms:blackboard", "sso:saml"). A verifier may only confirm *that* a
 * student is enrolled in a course — it must never pull grades or other
 * academic records (GDPR/LOPDGDD; see docs/ARCHITECTURE.md).
 */
export interface EnrollmentVerifier {
  readonly key: string;
  /** Returns true if the institution confirms the enrollment. */
  verify(input: { email: string; courseCode: string; termCode: string | null }): Promise<boolean>;
}

const registry = new Map<string, EnrollmentVerifier>();

export function registerVerifier(v: EnrollmentVerifier) {
  registry.set(v.key, v);
}

/** Null means "self-report only" — the launch default for every school. */
export function verifierFor(school: { enrollmentVerifier: string | null }): EnrollmentVerifier | null {
  return school.enrollmentVerifier ? registry.get(school.enrollmentVerifier) ?? null : null;
}
