import type { AIProvider, GenerateTextParams } from "../types";
import { AITimeoutError, AIRateLimitError, AIProviderUnavailableError, AIProviderConfigError } from "../errors";

const REQUEST_TIMEOUT_MS = 20_000; // AI is an enhancement, not a blocking dependency — fail fast rather than hang a request

export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic";

  async generateText({ system, prompt, maxTokens = 1024 }: GenerateTextParams): Promise<string> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      // Fails loudly at call time rather than silently returning empty text —
      // a missing key is a deployment/config bug, not a "no AI today" state.
      throw new AIProviderConfigError("ANTHROPIC_API_KEY is not configured");
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
          max_tokens: maxTokens,
          system,
          messages: [{ role: "user", content: prompt }],
        }),
        signal: controller.signal,
      });

      if (res.status === 429) {
        throw new AIRateLimitError("Anthropic API rate limit exceeded");
      }
      if (res.status >= 500) {
        throw new AIProviderUnavailableError(`Anthropic API returned ${res.status}`);
      }
      if (!res.ok) {
        // 4xx other than 429: almost certainly a request-shape bug on our
        // side, not something the user did — surfaced distinctly for logs.
        const body = await res.text().catch(() => "");
        throw new Error(`Anthropic API request error ${res.status}: ${body.slice(0, 200)}`);
      }

      const data = await res.json();
      const text = Array.isArray(data.content)
        ? data.content.map((block: any) => (block.type === "text" ? block.text : "")).join("")
        : "";
      return text;
    } catch (err: any) {
      if (err?.name === "AbortError") {
        throw new AITimeoutError("Anthropic API request timed out");
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
