import type { TutoringSessionStatus } from "@prisma/client";
import { config } from "./config";
import { localDate, zonedTime } from "./tz";

/**
 * Tutoring policy — pure and unit-tested. Status flow:
 *
 *   REQUESTED ──tutor confirms──▶ CONFIRMED ──after end──▶ COMPLETED ──▶ (rating)
 *       │                             │                        │
 *       └────── cancel ──────▶ CANCELLED ◀── cancel ───────────┘ (not allowed)
 *                                                              │
 *                           CONFIRMED/COMPLETED ──dispute──▶ DISPUTED ──resolve──▶ COMPLETED
 */
const TRANSITIONS: Record<TutoringSessionStatus, TutoringSessionStatus[]> = {
  REQUESTED: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["COMPLETED", "CANCELLED", "DISPUTED"],
  COMPLETED: ["DISPUTED"],
  DISPUTED: ["COMPLETED"],
  CANCELLED: [],
};

export function canTransition(from: TutoringSessionStatus, to: TutoringSessionStatus) {
  return TRANSITIONS[from].includes(to);
}

/**
 * Cancellation policy:
 *  - tutor cancels (or declines) at any time → full refund to the student
 *  - student cancels ≥ freeCancellationHours before start → full refund
 *  - student cancels later than that → no refund (tutor is paid)
 *  - a REQUESTED (unconfirmed) session can always be cancelled with full refund
 */
export function cancellationTerms(input: {
  status: TutoringSessionStatus;
  scheduledStart: Date;
  by: "student" | "tutor";
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const hours = (input.scheduledStart.getTime() - now.getTime()) / 3_600_000;
  if (input.status === "REQUESTED") return { refundEligible: true, explanation: "Not yet confirmed, so there's a full refund." };
  if (input.by === "tutor") return { refundEligible: true, explanation: "Cancelled by the tutor, so the student gets a full refund." };
  if (hours >= config.tutoring.freeCancellationHours) {
    return { refundEligible: true, explanation: `More than ${config.tutoring.freeCancellationHours} h before the start, so there's a full refund.` };
  }
  return {
    refundEligible: false,
    explanation: `Less than ${config.tutoring.freeCancellationHours} h before the start, so no refund. The tutor had reserved this time.`,
  };
}

export function sessionEnd(s: { scheduledStart: Date; durationMinutes: number }) {
  return new Date(s.scheduledStart.getTime() + s.durationMinutes * 60_000);
}

export function canComplete(s: { status: TutoringSessionStatus; scheduledStart: Date; durationMinutes: number }, now = new Date()) {
  return s.status === "CONFIRMED" && now >= s.scheduledStart;
}

export function canDispute(s: { status: TutoringSessionStatus; scheduledStart: Date; durationMinutes: number }, now = new Date()) {
  if (s.status !== "CONFIRMED" && s.status !== "COMPLETED") return false;
  if (now < s.scheduledStart) return false;
  return now.getTime() <= sessionEnd(s).getTime() + config.tutoring.disputeWindowDays * 86_400_000;
}

export type AvailabilityWindow = { weekday: number; startMinute: number; endMinute: number };

/** Concrete bookable start times from weekly windows, minus already-booked sessions. */
export function generateSlots(input: {
  windows: AvailabilityWindow[];
  timezone: string;
  durationMinutes: number;
  booked: { start: Date; end: Date }[];
  from?: Date;
  days?: number;
  /** Minimum notice before a slot can be booked. */
  leadHours?: number;
}) {
  const from = input.from ?? new Date();
  const days = input.days ?? config.tutoring.bookingHorizonDays;
  const earliest = from.getTime() + (input.leadHours ?? 12) * 3_600_000;
  const slots: Date[] = [];
  for (let i = 0; i <= days; i++) {
    const d = localDate(new Date(from.getTime() + i * 86_400_000), input.timezone);
    for (const w of input.windows.filter((w) => w.weekday === d.weekday)) {
      for (let m = w.startMinute; m + input.durationMinutes <= w.endMinute; m += input.durationMinutes) {
        const start = zonedTime(d.year, d.month, d.day, m, input.timezone);
        const end = new Date(start.getTime() + input.durationMinutes * 60_000);
        if (start.getTime() < earliest) continue;
        if (input.booked.some((b) => start < b.end && end > b.start)) continue;
        if (!slots.some((s) => s.getTime() === start.getTime())) slots.push(start);
      }
    }
  }
  return slots.sort((a, b) => a.getTime() - b.getTime());
}

export function platformFee(priceCents: number) {
  return Math.round((priceCents * config.tutoring.platformFeeBps) / 10_000);
}
