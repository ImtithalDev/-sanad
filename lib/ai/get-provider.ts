import type { AIProvider } from "./types";
import { AnthropicProvider } from "./providers/anthropic";
import { AIProviderConfigError } from "./errors";

// Switching AI vendors later is changing AI_PROVIDER and adding one case
// here (plus the new provider class) — nothing else in the codebase
// references "anthropic" by name.
export function getAIProvider(): AIProvider {
  const providerName = process.env.AI_PROVIDER || "anthropic";

  switch (providerName) {
    case "anthropic":
      return new AnthropicProvider();
    default:
      throw new AIProviderConfigError(`Unknown AI_PROVIDER: "${providerName}"`);
  }
}
