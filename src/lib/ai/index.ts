import { AnthropicProvider } from "./anthropic";
import { OfflineProvider } from "./offline";
import type { AIProvider } from "./types";

let provider: AIProvider | null = null;

/** Claude when credentials are configured, otherwise the offline stub. */
export function getAI(): AIProvider {
  if (!provider) {
    provider = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN ? new AnthropicProvider() : new OfflineProvider();
  }
  return provider;
}

export type * from "./types";
