import { NextResponse } from "next/server";
import {
  AITimeoutError,
  AIRateLimitError,
  AIProviderUnavailableError,
  AIProviderConfigError,
  AIMalformedResponseError,
  AIQuotaExceededError,
  AIUnauthenticatedError,
} from "./errors";

// error_code values are stable strings the frontend switches on for copy/UI
// state - never the raw err.message, which could contain internal details
// (a stack fragment, a raw provider error body) that should not reach the client.
export function aiErrorToResponse(err: unknown): NextResponse {
  if (err instanceof AIUnauthenticatedError) {
    return NextResponse.json({ error_code: "unauthenticated" }, { status: 401 });
  }
  if (err instanceof AIQuotaExceededError) {
    return NextResponse.json({ error_code: "quota_exceeded" }, { status: 429 });
  }
  if (err instanceof AIRateLimitError) {
    return NextResponse.json({ error_code: "provider_rate_limited" }, { status: 503 });
  }
  if (err instanceof AITimeoutError) {
    return NextResponse.json({ error_code: "timeout" }, { status: 504 });
  }
  if (err instanceof AIProviderUnavailableError) {
    return NextResponse.json({ error_code: "provider_unavailable" }, { status: 503 });
  }
  if (err instanceof AIProviderConfigError) {
    return NextResponse.json({ error_code: "provider_not_configured" }, { status: 503 });
  }
  if (err instanceof AIMalformedResponseError) {
    return NextResponse.json({ error_code: "malformed_response" }, { status: 502 });
  }

  return NextResponse.json({ error_code: "unknown_error" }, { status: 500 });
}
