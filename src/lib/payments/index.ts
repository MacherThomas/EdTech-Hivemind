import { randomBytes } from "crypto";

/**
 * Payment processor boundary. The platform only ever stores processor-side
 * references (account / payment ids) — never card numbers or bank details.
 *
 * Students are the sellers here, so the real adapter needs a marketplace /
 * connected-accounts flow (e.g. Stripe Connect). It is deliberately NOT wired
 * until IE legal/finance confirm how payouts to student tutors must be
 * structured (docs/CHECKPOINTS.md #2). Until then the mock provider simulates
 * the flow and no real money moves.
 */
export interface PaymentProvider {
  readonly name: string;
  /** Starts (or resumes) processor-hosted payout onboarding for a tutor. */
  ensurePayoutAccount(input: { tutorProfileId: string; existingRef: string | null }): Promise<{ accountRef: string; status: "PENDING" | "ACTIVE"; onboardingUrl: string | null }>;
  /** Places a hold on the student's payment method (processor-hosted checkout). */
  authorize(input: { sessionId: string; amountCents: number; currency: string; payoutAccountRef: string; platformFeeCents: number }): Promise<{ paymentRef: string }>;
  capture(paymentRef: string): Promise<void>;
  refund(paymentRef: string): Promise<void>;
  /** Releases a hold that was never captured. */
  voidHold(paymentRef: string): Promise<void>;
}

class MockPaymentProvider implements PaymentProvider {
  readonly name = "mock";
  async ensurePayoutAccount(input: { existingRef: string | null }) {
    return { accountRef: input.existingRef ?? `mock_acct_${randomBytes(6).toString("hex")}`, status: "ACTIVE" as const, onboardingUrl: null };
  }
  async authorize() {
    return { paymentRef: `mock_pi_${randomBytes(8).toString("hex")}` };
  }
  async capture() {}
  async refund() {}
  async voidHold() {}
}

let provider: PaymentProvider | null = null;

export function getPayments(): PaymentProvider {
  if (provider) return provider;
  const name = process.env.PAYMENTS_PROVIDER ?? "mock";
  if (name === "mock") return (provider = new MockPaymentProvider());
  throw new Error(
    `Payments provider "${name}" is not available. A real processor adapter is pending the payout-structure decision with IE legal/finance.`,
  );
}
