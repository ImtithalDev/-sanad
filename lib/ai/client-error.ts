import { getDictionary, type Locale } from "@/lib/i18n";

export function aiErrorCodeToMessage(errorCode: string | undefined, locale: Locale): string {
  const t = getDictionary(locale);
  switch (errorCode) {
    case "quota_exceeded":
      return t.aiErrorQuota;
    case "timeout":
      return t.aiErrorTimeout;
    case "provider_unavailable":
    case "provider_rate_limited":
    case "provider_not_configured":
      return t.aiErrorProvider;
    default:
      return t.aiErrorGeneric;
  }
}

export async function parseAIErrorResponse(res: Response, locale: Locale): Promise<string> {
  try {
    const body = await res.json();
    return aiErrorCodeToMessage(body?.error_code, locale);
  } catch {
    return aiErrorCodeToMessage(undefined, locale);
  }
}
