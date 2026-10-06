export class AIError extends Error {}
export class AITimeoutError extends AIError {}
export class AIRateLimitError extends AIError {}
export class AIProviderUnavailableError extends AIError {}
export class AIProviderConfigError extends AIError {}
export class AIMalformedResponseError extends AIError {}
export class AIQuotaExceededError extends AIError {}
export class AIUnauthenticatedError extends AIError {}
