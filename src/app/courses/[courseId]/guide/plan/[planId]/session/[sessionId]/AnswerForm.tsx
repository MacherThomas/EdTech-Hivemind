"use client";

import { useActionState } from "react";
import { answerQuestion, type AnswerState } from "@/app/actions/guide";
import { Notice } from "@/components/Badges";
import { SubmitButton } from "@/components/SubmitButton";

export function AnswerForm({
  sessionId,
  questionId,
  type,
  choices,
  previous,
}: {
  sessionId: string;
  questionId: string;
  type: "MULTIPLE_CHOICE" | "SHORT_ANSWER" | "NUMERIC";
  choices: string[] | null;
  previous: { correct: boolean; response: string; answer: string; explanation: string } | null;
}) {
  const [state, action] = useActionState<AnswerState, FormData>(answerQuestion.bind(null, sessionId, questionId), null);
  const result = state && !("error" in state) ? state : null;
  const shown = result ?? (previous ? { ...previous, reteach: null } : null);
  const id = `q-${questionId}`;

  return (
    <div className="stack-s">
      {!shown && (
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
              {type === "NUMERIC" ? <input id={id} name="response" type="text" inputMode="decimal" required /> : <textarea id={id} name="response" required style={{ minHeight: 80 }} />}
            </div>
          )}
          <SubmitButton small pendingLabel="Checking…">Check answer</SubmitButton>
        </form>
      )}
      {shown && (
        <>
          <Notice kind={shown.correct ? "success" : "error"} title={shown.correct ? "Correct." : "Not quite."}>
            {!shown.correct && <>Expected: {shown.answer}. </>}
            {shown.explanation}
          </Notice>
          {result?.reteach && (
            <div className="card stack-s" aria-live="polite">
              <div className="cluster">
                <strong>Here&apos;s another way to think about it</strong>
                {result.reteach.source === "community" ? (
                  <span className="badge badge-community"><span aria-hidden="true">●</span> From the community{result.reteach.entryTitle ? `: ${result.reteach.entryTitle}` : ""}</span>
                ) : (
                  <span className="badge badge-ai"><span aria-hidden="true">✦</span> AI-drafted</span>
                )}
              </div>
              <div className="prose">{result.reteach.text}</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
