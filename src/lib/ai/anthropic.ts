import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod/v4";
import { SYSTEM_PROMPT, entriesBlock } from "./prompts";
import type { AIProvider, AnswerInput, GradeInput, QuestionInput, ReteachInput, TopicInput } from "./types";

type Effort = "low" | "medium" | "high";

/**
 * Claude-backed provider. Uses structured outputs so every response is
 * schema-validated, and server-side refusal fallbacks ("default" routing) so
 * a classifier decline is retried on Anthropic's recommended fallback model.
 */
export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic";
  private client = new Anthropic();
  private model = process.env.AI_MODEL || "claude-opus-5";

  private async structured<T extends z.ZodType>(schema: T, user: string, effort: Effort): Promise<z.infer<T>> {
    const res = await this.client.beta.messages.parse({
      model: this.model,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort, format: betaZodOutputFormat(schema) },
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: user }],
    });
    if (res.stop_reason === "refusal") throw new AIRefusalError(res.stop_details?.explanation ?? "The AI declined this request.");
    if (!res.parsed_output) throw new Error(`AI response did not match schema (stop_reason=${res.stop_reason})`);
    return res.parsed_output;
  }

  async answerQuestion(i: AnswerInput) {
    const out = await this.structured(
      z.object({ answer: z.string(), usedEntryIds: z.array(z.string()), topic: z.string().nullable() }),
      `Course: ${i.courseName}
Known topics: ${i.topics.join("; ") || "(none yet)"}
liveRisk: ${i.liveRisk}

${entriesBlock(i.entries)}

${i.materialExcerpts.map((m) => `<material>${m}</material>`).join("\n")}

<question>${i.question}</question>

Answer the student's question for the course chat. Set topic to the best matching known topic name, or null.`,
      "medium",
    );
    const known = new Set(i.entries.map((e) => e.id));
    return { ...out, usedEntryIds: out.usedEntryIds.filter((id) => known.has(id)) };
  }

  async extractTopics(i: TopicInput) {
    const out = await this.structured(
      z.object({
        topics: z.array(z.object({ name: z.string(), summary: z.string(), prerequisites: z.array(z.string()) })),
      }),
      `Course: ${i.courseName}
${i.courseDescription ? `Description: ${i.courseDescription}\n` : ""}${i.syllabusText ? `<material kind="syllabus">${i.syllabusText}</material>` : "No syllabus is available."}
${i.materialSnippets.map((m) => `<material>${m}</material>`).join("\n")}

List the course's topics in teaching order (6-15 topics). Names should be short (2-6 words). prerequisites must reference other topic names from your list.`,
      "high",
    );
    return out.topics;
  }

  async generateQuestions(i: QuestionInput) {
    const out = await this.structured(
      z.object({
        questions: z.array(
          z.object({
            type: z.enum(["MULTIPLE_CHOICE", "SHORT_ANSWER", "NUMERIC"]),
            prompt: z.string(),
            choices: z.array(z.string()).nullable(),
            answer: z.string(),
            explanation: z.string(),
            difficulty: z.number().int(),
          }),
        ),
      }),
      `Course: ${i.courseName}
Topic: ${i.topic.name}${i.topic.summary ? ` — ${i.topic.summary}` : ""}
Target difficulty (1-5): ${i.targetDifficulty}

${entriesBlock(i.entries)}
${i.retiredExamples.map((m) => `<material kind="retired-example">${m}</material>`).join("\n")}
${i.avoidPrompts.length ? `Do not repeat these existing questions:\n${i.avoidPrompts.map((p) => `- ${p}`).join("\n")}` : ""}

Write ${i.count} original practice questions. For MULTIPLE_CHOICE give 4 choices and set answer to the exact text of the correct choice. For others set choices to null. Keep difficulty between 1 and 5.`,
      "medium",
    );
    return out.questions.map((q) => ({ ...q, difficulty: Math.min(5, Math.max(1, q.difficulty)) }));
  }

  async reteach(i: ReteachInput) {
    const out = await this.structured(
      z.object({ explanation: z.string() }),
      `Course: ${i.courseName}
Topic: ${i.topic.name}${i.topic.summary ? ` — ${i.topic.summary}` : ""}
${i.mistake ? `<question>${i.mistake.prompt}</question>\nThe student answered: <question>${i.mistake.response}</question>\nCorrect answer: ${i.mistake.correctAnswer}` : ""}
Explanations the student already saw (use a different approach, e.g. a concrete example, an analogy, a visual description or a step-by-step derivation):
${i.alreadySeen.map((s) => `<entry>${s.slice(0, 1500)}</entry>`).join("\n") || "(none)"}

Write a short re-explanation of the topic (under 250 words) that targets the likely misconception.`,
      "medium",
    );
    return out.explanation;
  }

  async gradeShortAnswer(i: GradeInput) {
    const out = await this.structured(
      z.object({ correct: z.boolean() }),
      `<question>${i.prompt}</question>\nReference answer: ${i.expected}\nStudent answer: <question>${i.response}</question>\nIs the student's answer substantively correct?`,
      "low",
    );
    return out.correct;
  }

  async suggestTopicTags(i: { title: string; text: string; topics: string[] }) {
    if (i.topics.length === 0) return [];
    const out = await this.structured(
      z.object({ topics: z.array(z.string()) }),
      `Topics: ${i.topics.join("; ")}\n<material><title>${i.title}</title>${i.text.slice(0, 6000)}</material>\nWhich of the listed topics does this material cover? Return exact names only.`,
      "low",
    );
    return out.topics.filter((t) => i.topics.includes(t));
  }
}

export class AIRefusalError extends Error {}
