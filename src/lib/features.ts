/**
 * Feature flags. AI features are OFF by default: the product runs entirely on
 * community content. Turning AI on needs AI_ENABLED=true *and* credentials,
 * and should wait for the DPO sign-off in docs/CHECKPOINTS.md (#4).
 */
export function aiEnabled() {
  return process.env.AI_ENABLED === "true" && !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}
