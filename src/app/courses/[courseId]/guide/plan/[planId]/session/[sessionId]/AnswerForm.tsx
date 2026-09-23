"use client";

import Link from "next/link";
import { useActionState } from "react";
import { answerQuestion, type AnswerState } from "@/app/actions/guide";
import { Notice } from "@/components/Badges";
import { SubmitButton } from "@/components/SubmitButton";

export function AnswerForm({
  courseId,
  sessionId,
  questionId,
  type,
  choices,
  previous,
}: {
  courseId: string;
  sessionId: string;
  questionId: string;
  type: "MULTIPLE_CHOICE" | "SHORT_ANSWER" | "NUMERIC";
  choices: string[] | null;
  previous: { correct: boolean; answer: string; explanation: string } | null;
}) {
  const [state, action] = useActionState<AnswerState, FormData>(answerQuestion.bind(null, sessionId, questionId), null);
  const result = state && "status" in state ? state : null;
  const graded = result?.status === "graded" ? result : previous ? { ...previous, status: "graded" as const, reteach: null } : null;
  const id = `q-${questionId}`;

  // Written answers are self-marked against the model answer.
  if (!graded && result?.status === "self-grade") {
    return (
      <form action={action} className="stack-s">
        <input type="hidden" name="response" value={result.response} />
        <div className="card stack-s">
          <p className="small" style={{ margin: 0 }}><strong>Your answer:</strong> {result.response}</p>
          <p className="small" style={{ margin: 0 }}><strong>Model answer:</strong> {result.answer}</p>
          {result.explanation && <p className="small" style={{ margin: 0 }}>{result.explanation}</p>}
        </div>
        <fieldset className="field">
          <legend>Compare with the model answer. Did you get it?</legend>
          <div className="cluster">
            <SubmitButton small name="selfGrade" value="correct" pendingLabel="Saving…">Yes, I got it</SubmitButton>
            <SubmitButton small variant="secondary" name="selfGrade" value="incorrect" pendingLabel="Saving…">No, not quite</SubmitButton>
          </div>
        </fieldset>
      </form>
    );
  }

  if (!graded) {
    return (
      <form action={action} className="stack-s">
        {state && "error" in state && <Notice kind="error">{state.error}</Notice>}
        {type === "MULTIPLE_CHOICE" && choices ? (
          <fieldset>
            <legend className="visually-hidden">Choose an answer</legend>
            {choices.map((c, i) => (
              <label key={i} className="radio-row" style={{ fontWeight: 400 }}>
                <input type="radio" name="response" value={c} required /> {c}
              </label>
            ))}
          </fieldset>
        ) : (
          <div className="field">
            <label htmlFor={id}>Your answer</label>
            {type === "NUMERIC" ? (
              <input id={id} name="response" type="text" inputMode="decimal" required />
            ) : (
              <textarea id={id} name="response" required style={{ minHeight: 80 }} />
            )}
          </div>
        )}
        <SubmitButton small pendingLabel="Checking…">{type === "SHORT_ANSWER" ? "Show model answer" : "Check answer"}</SubmitButton>
      </form>
    );
  }

  const fresh = result?.status === "graded" ? result : null;
  return (
    <div className="stack-s">
      <Notice kind={graded.correct ? "success" : "error"} title={graded.correct ? "Correct." : "Not quite."}>
        {!graded.correct && type !== "SHORT_ANSWER" && <>Expected: {graded.answer}. </>}
        {type === "SHORT_ANSWER" && <>Model answer: {graded.answer} </>}
        {graded.explanation}
      </Notice>
      {fresh && !fresh.correct &&
        (fresh.reteach ? (
          <div className="card stack-s" aria-live="polite">
            <div className="cluster">
              <strong>Here&apos;s another way to think about it</strong>
              {fresh.reteach.source === "community" ? (
                <span className="badge badge-community">
                  <span aria-hidden="true">●</span> From the community{fresh.reteach.entryTitle ? `: ${fresh.reteach.entryTitle}` : ""}
                </span>
              ) : (
                <span className="badge badge-ai"><span aria-hidden="true">✦</span> AI-drafted</span>
              )}
            </div>
            <div className="prose">{fresh.reteach.text}</div>
          </div>
        ) : (
          <p className="small" style={{ margin: 0 }}>
            No other explanation of this topic yet. <Link href={`/courses/${courseId}/chat`}>Ask in the course chat</Link>, and good answers get added to the knowledge base.
          </p>
        ))}
    </div>
  );
}
