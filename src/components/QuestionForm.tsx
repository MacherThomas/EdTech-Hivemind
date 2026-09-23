"use client";

import { useState } from "react";
import { contributeQuestion } from "@/app/actions/guide";
import { ActionForm } from "./ActionForm";
import { SubmitButton } from "./SubmitButton";

type Opt = { id: string; name: string };

/** Lets a student add a practice question to the course question bank. */
export function QuestionForm({
  courseId,
  topics,
  retiredMaterials,
  fixedTopicId,
  idPrefix = "qf",
}: {
  courseId: string;
  topics: Opt[];
  /** Only materials that pass the integrity gate may be cited as a source. */
  retiredMaterials: { id: string; title: string }[];
  fixedTopicId?: string;
  idPrefix?: string;
}) {
  const [type, setType] = useState<"MULTIPLE_CHOICE" | "SHORT_ANSWER" | "NUMERIC">("MULTIPLE_CHOICE");
  const f = (s: string) => `${idPrefix}-${s}`;
  return (
    <ActionForm action={contributeQuestion.bind(null, courseId)}>
      {fixedTopicId ? (
        <input type="hidden" name="topicId" value={fixedTopicId} />
      ) : (
        <div className="field">
          <label htmlFor={f("topic")}>Topic</label>
          <select id={f("topic")} name="topicId" required defaultValue="">
            <option value="" disabled>Choose a topic</option>
            {topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      )}
      <div className="form-grid">
        <div className="field">
          <label htmlFor={f("type")}>Question type</label>
          <select id={f("type")} name="type" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            <option value="MULTIPLE_CHOICE">Multiple choice</option>
            <option value="NUMERIC">Numeric answer</option>
            <option value="SHORT_ANSWER">Written answer (self-marked)</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor={f("difficulty")}>Difficulty</label>
          <select id={f("difficulty")} name="difficulty" defaultValue="2">
            {[1, 2, 3, 4, 5].map((d) => <option key={d} value={d}>{d} of 5{d === 1 ? " (easy)" : d === 5 ? " (hard)" : ""}</option>)}
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor={f("prompt")}>Question</label>
        <textarea id={f("prompt")} name="prompt" required minLength={10} style={{ minHeight: 80 }} />
      </div>
      {type === "MULTIPLE_CHOICE" ? (
        <fieldset className="field">
          <legend>Options: select the correct one</legend>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="radio-row">
              <input type="radio" name="correct" value={i} id={f(`correct-${i}`)} required aria-label={`Option ${i + 1} is correct`} />
              <label htmlFor={f(`choice-${i}`)} className="visually-hidden">Option {i + 1}</label>
              <input type="text" id={f(`choice-${i}`)} name={`choice-${i}`} required={i < 2} placeholder={i < 2 ? `Option ${i + 1}` : `Option ${i + 1} (optional)`} />
            </div>
          ))}
        </fieldset>
      ) : (
        <div className="field">
          <label htmlFor={f("answer")}>{type === "NUMERIC" ? "Correct number" : "Model answer"}</label>
          {type === "NUMERIC" && <span className="hint">Answers within 1% count as correct.</span>}
          <input id={f("answer")} name="answer" type="text" inputMode={type === "NUMERIC" ? "decimal" : undefined} required />
        </div>
      )}
      <div className="field">
        <label htmlFor={f("explanation")}>Explanation (shown after answering)</label>
        <textarea id={f("explanation")} name="explanation" style={{ minHeight: 80 }} />
      </div>
      <div className="field">
        <label htmlFor={f("source")}>Taken from a past exam or problem set?</label>
        <span className="hint">Only retired assessments from finished terms can be used.</span>
        <select id={f("source")} name="sourceMaterialId" defaultValue="">
          <option value="">No, I wrote it myself</option>
          {retiredMaterials.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
        </select>
      </div>
      <SubmitButton small pendingLabel="Adding…">Add question</SubmitButton>
    </ActionForm>
  );
}
