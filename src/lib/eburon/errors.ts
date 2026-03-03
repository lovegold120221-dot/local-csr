/**
 * Eburon Error Layer
 *
 * Two-layer error system:
 * - Public: minimal, non-sensitive, actionable (shown in UI)
 * - Backend: structured JSON log event with full context (never raw secrets)
 */

// ---------------------------------------------------------------------------
// Error code registry
// ---------------------------------------------------------------------------

export interface EburonErrorDef {
  code: string;
  http: number;
  uiText: string;
  remediation?: string;
}

export const EBURON_ERRORS: Record<string, EburonErrorDef> = {
  EBRN_KEY_MISSING:   { code: 'EBRN_KEY_MISSING',   http: 401, uiText: 'API Key Missing',      remediation: 'Set the required API key in your environment or dashboard.' },
  EBRN_KEY_INVALID:   { code: 'EBRN_KEY_INVALID',   http: 401, uiText: 'Invalid Key',          remediation: 'Check your API key value and regenerate if needed.' },
  EBRN_ALIAS_UNKNOWN: { code: 'EBRN_ALIAS_UNKNOWN', http: 400, uiText: 'Unknown Model',        remediation: 'Use a valid Eburon alias like codemax-v3 or echo_multilingual-v2.' },
  EBRN_WL_NO_MATCH:   { code: 'EBRN_WL_NO_MATCH',   http: 403, uiText: 'Not Allowed',          remediation: 'This model is not enabled for your workspace. Contact your admin.' },
  EBRN_WL_DENY:       { code: 'EBRN_WL_DENY',       http: 403, uiText: 'Not Allowed',          remediation: 'A whitelist rule explicitly denies this request.' },
  EBRN_RATE_LIMIT:    { code: 'EBRN_RATE_LIMIT',    http: 429, uiText: 'Rate Limited',         remediation: 'Slow down. Try again after the rate-limit window resets.' },
  EBRN_UPSTREAM_4XX:  { code: 'EBRN_UPSTREAM_4XX',  http: 502, uiText: 'Provider Error',       remediation: 'The upstream provider returned a client error. Check your request.' },
  EBRN_UPSTREAM_5XX:  { code: 'EBRN_UPSTREAM_5XX',  http: 502, uiText: 'Provider Unavailable', remediation: 'The upstream provider is temporarily unavailable. Retry shortly.' },
  EBRN_TIMEOUT:       { code: 'EBRN_TIMEOUT',       http: 504, uiText: 'Timeout',              remediation: 'The request timed out. Try a smaller payload or retry.' },
  EBRN_CONTEXT_LIMIT: { code: 'EBRN_CONTEXT_LIMIT', http: 400, uiText: 'Request Too Large',    remediation: 'Reduce input size or choose a model with a larger context window.' },
  EBRN_INTERNAL:      { code: 'EBRN_INTERNAL',      http: 500, uiText: 'Server Error',         remediation: 'An unexpected error occurred. Please try again or contact support.' },
} as const;

// ---------------------------------------------------------------------------
// Public (UI-safe) error shape
// ---------------------------------------------------------------------------

export interface EburonPublicError {
  eburon_model: string | null;
  message: string;
  allowed_models_hint: string[];
}

// ---------------------------------------------------------------------------
// Backend log event shape
// ---------------------------------------------------------------------------

export interface EburonLogEvent {
  ts: string;
  lvl: 'INFO' | 'WARN' | 'ERROR';
  event: string;
  env?: string;
  tenant_id?: string;
  workspace_id?: string;
  user_id?: string;
  request_id?: string;
  correlation_id?: string;
  alias_requested?: string;
  alias_canonical?: string | null;
  rule_applied?: { rule_id: string; name?: string } | null;
  route?: {
    provider_vendor: string | null;
    provider_model: string | null;
    endpoint: string | null;
  } | null;
  capabilities?: {
    requested: string[];
    granted: string[];
  };
  limits_effective?: Record<string, unknown> | null;
  telemetry?: Record<string, unknown>;
  error?: {
    code: string;
    message: string;
    detail?: Record<string, unknown>;
  } | null;
  http?: { status: number };
  latency_ms?: number;
  redaction?: {
    no_secrets_logged: boolean;
    no_prompt_content_logged: boolean;
  };
}

// ---------------------------------------------------------------------------
// EburonError class
// ---------------------------------------------------------------------------

export class EburonError extends Error {
  public readonly code: string;
  public readonly http: number;
  public readonly uiText: string;
  public readonly detail: Record<string, unknown>;

  constructor(
    code: keyof typeof EBURON_ERRORS | string,
    detail?: Record<string, unknown>,
    overrideMessage?: string,
  ) {
    const def = EBURON_ERRORS[code];
    const uiText = def?.uiText ?? 'Server Error';
    const http = def?.http ?? 500;
    super(overrideMessage ?? def?.code ?? code);
    this.code = code;
    this.http = http;
    this.uiText = uiText;
    this.detail = detail ?? {};
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a UI-safe public error object. */
export function publicError(
  code: string,
  aliasModel: string | null = null,
  message?: string,
  allowedHint: string[] = [],
): EburonPublicError {
  const def = EBURON_ERRORS[code];
  return {
    eburon_model: aliasModel,
    message: message ?? def?.uiText ?? 'Server Error',
    allowed_models_hint: allowedHint,
  };
}

/** Build a structured backend log event. */
export function buildLogEvent(
  overrides: Partial<EburonLogEvent> & { event: string; lvl: EburonLogEvent['lvl'] },
): EburonLogEvent {
  return {
    ts: new Date().toISOString(),
    redaction: { no_secrets_logged: true, no_prompt_content_logged: true },
    ...overrides,
  };
}

/**
 * Sanitize a raw error message — strip provider names, keys, URLs.
 * Extends the existing "stealth mode" pattern from echo.ts.
 */
export function sanitizeErrorMessage(raw: string): string {
  return raw
    .replace(/elevenlabs|11labs/gi, 'Eburon AI')
    .replace(/openai/gi, 'provider')
    .replace(/vapi/gi, 'provider')
    .replace(/deepgram/gi, 'provider')
    .replace(/sk-[A-Za-z0-9_-]{20,}/g, '[REDACTED_KEY]')
    .replace(/Bearer\s+[A-Za-z0-9_-]{20,}/g, 'Bearer [REDACTED]');
}

/**
 * Convert any caught error into an EburonError.
 * If it's already an EburonError, return as-is.
 */
export function toEburonError(err: unknown): EburonError {
  if (err instanceof EburonError) return err;
  const raw = err instanceof Error ? err.message : String(err);
  const sanitized = sanitizeErrorMessage(raw);

  // Heuristic mapping for common upstream failures
  if (/timeout|ETIMEDOUT|AbortError/i.test(raw)) {
    return new EburonError('EBRN_TIMEOUT', { raw: sanitized });
  }
  if (/rate.?limit|429/i.test(raw)) {
    return new EburonError('EBRN_RATE_LIMIT', { raw: sanitized });
  }
  if (/Missing.*(?:key|api)/i.test(raw)) {
    return new EburonError('EBRN_KEY_MISSING', { raw: sanitized });
  }
  if (/unauthorized|invalid.*key|401/i.test(raw)) {
    return new EburonError('EBRN_KEY_INVALID', { raw: sanitized });
  }

  return new EburonError('EBRN_INTERNAL', { raw: sanitized });
}

/**
 * Produce a NextResponse-compatible JSON body + status for an EburonError.
 * Usage: `return NextResponse.json(...eburonJsonResponse(err))`
 */
export function eburonJsonResponse(err: EburonError): [{ error: string; code: string }, { status: number }] {
  return [
    { error: err.uiText, code: err.code },
    { status: err.http },
  ];
}
