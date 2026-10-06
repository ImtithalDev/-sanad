export type GenerateTextParams = {
  system: string;
  prompt: string;
  maxTokens?: number;
};

// Any AI vendor can be plugged in behind this one method. Nothing in
// lib/ai/service.ts or any route handler imports a provider-specific type —
// they only ever see this interface, so swapping providers later means
// writing one new class, not touching the features that use AI.
export interface AIProvider {
  readonly name: string;
  generateText(params: GenerateTextParams): Promise<string>;
}
