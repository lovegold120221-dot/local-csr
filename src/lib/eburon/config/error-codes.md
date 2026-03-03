# Eburon Error Codes

Error codes used across the Eburon platform. Each code maps to a UI-safe message and a remediation hint.

| Code | HTTP | UI Text | Remediation |
|------|-----:|---------|-------------|
| `EBRN_KEY_MISSING` | 401 | API Key Missing | Set the required API key in your environment or dashboard. |
| `EBRN_KEY_INVALID` | 401 | Invalid Key | Check your API key value and regenerate if needed. |
| `EBRN_ALIAS_UNKNOWN` | 400 | Unknown Model | Use a valid Eburon alias like `codemax-v3` or `echo_multilingual-v2`. |
| `EBRN_WL_NO_MATCH` | 403 | Not Allowed | This model is not enabled for your workspace. Contact your admin. |
| `EBRN_WL_DENY` | 403 | Not Allowed | A whitelist rule explicitly denies this request. |
| `EBRN_RATE_LIMIT` | 429 | Rate Limited | Slow down. Try again after the rate-limit window resets. |
| `EBRN_UPSTREAM_4XX` | 502 | Provider Error | The upstream provider returned a client error. Check your request. |
| `EBRN_UPSTREAM_5XX` | 502 | Provider Unavailable | The upstream provider is temporarily unavailable. Retry shortly. |
| `EBRN_CONTEXT_LIMIT` | 400 | Request Too Large | Reduce input size or choose a model with a larger context window. |
| `EBRN_TIMEOUT` | 504 | Timeout | The request timed out. Try a smaller payload or retry. |
| `EBRN_INTERNAL` | 500 | Server Error | An unexpected error occurred. Please try again or contact support. |

## Route-level codes (used in `internal.error.code`)

| Code | Meaning |
|------|---------|
| `EBU.ALIAS.UNKNOWN_FAMILY` | The alias family prefix is not recognized (e.g. `gpt`, `claude`). |
| `EBU.ALIAS.NOT_FOUND` | The alias is well-formed but not in the registry. |
| `EBU.WL.DENY` | A whitelist rule explicitly denied the request. |
| `EBU.WL.NO_MATCH` | No allow rule matched — default deny applies. |
| `EBU.TOKENS.CONTEXT_LIMIT` | Input token estimate exceeds the effective `max_input_tokens`. |

## Two-layer logging

- **UI layer**: Only shows the `UI Text` column above. Never exposes vendor names, model IDs, or secrets.
- **Backend layer**: Structured JSON log events with full context. See `EburonLogEvent` type in `errors.ts`.

### Backend log event fields

| Field | Description |
|-------|-------------|
| `ts` | ISO 8601 timestamp |
| `lvl` | `INFO` / `WARN` / `ERROR` |
| `event` | `eburon.route.allowed` / `eburon.route.denied` / `eburon.route.error` |
| `alias_requested` | Raw alias string from the user |
| `alias_canonical` | Normalized alias (lowercase) or `null` |
| `rule_applied` | `{ rule_id, name }` of the winning whitelist rule |
| `route` | `{ provider_vendor, provider_model, endpoint }` — backend only |
| `error` | `{ code, message, detail }` |
| `redaction` | `{ no_secrets_logged, no_prompt_content_logged }` — always `true` |

### Secret safety

- Never log raw API keys (only `key_id` or fingerprint)
- Never log full prompts unless in explicit debug mode with redaction
- Never surface provider/vendor/model strings in UI — only alias IDs
