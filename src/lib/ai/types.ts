/**
 * AI provider contract. Everything the AI produces is stored with
 * origin = AI_DRAFTED by the caller — providers never decide provenance.
 */

export type GroundingEntry = { id: string; title: string; body: string; origin: string; verification: string };

export type AnswerInput = {
  courseName: string;
  topics: string[];
  question: string;
  entries: GroundingEntry[];
  /** Text from materials that passed the integrity gate. */
  materialExcerpts: string[];
  /** True when the question may concern a live assessment: method-only answers. */
  liveRisk: boolean;
};

export type AnswerOutput = { answer: string; usedEntryIds: string[]; topic: string | null };

export type TopicDraft = { name: string; summary: string; prerequisites: string[] };

export type TopicInput = { courseName: string; courseDescription?: string | null; syllabusText?: string | null; materialSnippets: string[] };

export type QuestionDraft = {
  type: "MULTIPLE_CHOICE" | "SHORT_ANSWER" | "NUMERIC";
  prompt: string;
  choices: string[] | null;
  answer: string;
  explanation: string;
  difficulty: number;
};

export type QuestionInput = {
  courseName: string;
  topic: { name: string; summary: string | null };
  count: number;
  targetDifficulty: number;
  entries: GroundingEntry[];
  /** Only from RETIRED, ungated materials — for style, never copied verbatim. */
  retiredExamples: string[];
  avoidPrompts: string[];
};

export type ReteachInput = {
  courseName: string;
  topic: { name: string; summary: string | null };
  mistake: { prompt: string; response: string; correctAnswer: string } | null;
  /** Explanations the student has already seen; the new one must differ in approach. */
  alreadySeen: string[];
};

export type GradeInput = { prompt: string; expected: string; response: string };

export interface AIProvider {
  readonly name: string;
  answerQuestion(input: AnswerInput): Promise<AnswerOutput>;
  extractTopics(input: TopicInput): Promise<TopicDraft[]>;
  generateQuestions(input: QuestionInput): Promise<QuestionDraft[]>;
  reteach(input: ReteachInput): Promise<string>;
  gradeShortAnswer(input: GradeInput): Promise<boolean>;
  suggestTopicTags(input: { title: string; text: string; topics: string[] }): Promise<string[]>;
}
