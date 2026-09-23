import { aiEnabled } from "../features";
import { AnthropicProvider } from "./anthropic";
import type { AIProvider } from "./types";

let provider: AIProvider | null = null;

/** The AI provider, or null when AI features are disabled (the default). */
export function getAI(): AIProvider | null {
  if (!aiEnabled()) return null;
  return (provider ??= new AnthropicProvider());
}

export type * from "./types";
