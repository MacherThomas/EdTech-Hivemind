import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { recomputeAggregates } from "./aggregates";
import { aiAnswerThread } from "./chat";
import { reviewFlags } from "./moderation";
import { evaluatePromotion } from "./promotion";
import { recomputeReputation } from "./reputation";
import { buildTopicStructure } from "./topics";
import { adaptStudyPlan } from "./study";

/**
 * Background job boundary. Request handlers never call job logic directly;
 * they go through runJob/enqueue so the transport can become a real queue
 * (pg-boss, SQS, …) later without touching callers.
 */
const handlers = {
  "chat.aiAnswer": aiAnswerThread,
  "hivemind.evaluatePromotion": evaluatePromotion,
  "moderation.reviewFlags": reviewFlags,
  "reputation.recompute": recomputeReputation,
  "aggregates.recompute": recomputeAggregates,
  "guide.buildTopics": buildTopicStructure,
  "guide.adaptPlan": adaptStudyPlan,
} as const;

type Handlers = typeof handlers;
export type JobName = keyof Handlers;
export type JobPayload<N extends JobName> = Parameters<Handlers[N]>[0];

/** Runs a job now and waits for it. */
export async function runJob<N extends JobName>(name: N, payload: JobPayload<N>) {
  const started = Date.now();
  try {
    const result = await (handlers[name] as (p: JobPayload<N>) => Promise<unknown>)(payload);
    await log(name, payload, "ok", null, started);
    return result;
  } catch (err) {
    await log(name, payload, "error", err instanceof Error ? err.message : String(err), started);
    throw err;
  }
}

/**
 * Fire-and-forget. Today this runs in-process after the response; swap the
 * body for a queue publish when usage requires it.
 */
export function enqueue<N extends JobName>(name: N, payload: JobPayload<N>) {
  void runJob(name, payload).catch((err) => console.error(`[job:${name}]`, err));
}

async function log(name: string, payload: unknown, status: string, error: string | null, started: number) {
  await db.jobRun
    .create({ data: { name, payload: payload as Prisma.InputJsonValue, status, error, durationMs: Date.now() - started } })
    .catch(() => undefined);
}
