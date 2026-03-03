// cspell:ignore EBRN codemax normalise normalisation normalised
/**
 * Eburon Alias Router — single source of truth for all LLM/TTS alias IDs.
 *
 * Rules:
 *  - Canonical alias IDs follow the format `<capability>/<alias>_<family>-<version>`
 *  - Vendor / upstream model strings are NEVER exposed to the frontend.
 *  - All validation, normalisation, and routing decisions flow through `resolveEchoAlias()`.
 *
 * Error codes follow the Eburon error set (EBRN_*).
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type EburonCapability = 'llm' | 'tts' | 'stt' | 'embed' | 'vision';

export interface AliasRegistryEntry {
  /** Canonical Eburon ID, e.g. "tts/echo_flash-v2.5" */
  id: string;
  capability: EburonCapability;
  /** Eburon brand alias (echo, codemax, orbit, …) */
  alias: string;
  /** Short function label (flash, multilingual, turbo, …) */
  family: string;
  /** Version string (v2.5, v2, latest, …) */
  version: string;
  upstream: {
    /** Never sent to the client */
    provider: string;
    /** Actual model ID sent to the provider */
    model: string;
  };
  status: 'active' | 'deprecated';
}

export type RouteStatus = 'ALLOW' | 'DENY' | 'ERROR';

export interface RouteDecision {
  status: RouteStatus;
  /** Canonical alias ID after normalisation (null on ERROR before lookup) */
  canonicalId: string | null;
  /** Upstream provider model string — NEVER expose to client (null on error) */
  upstreamModelId: string | null;
  /** UI-safe error message */
  publicMessage: string | null;
  /** Machine-readable error code */
  errorCode: string | null;
}

// ─── Alias Registry ───────────────────────────────────────────────────────────

/**
 * All known Echo (TTS) alias models.
 * Add new rows here — nowhere else needed.
 */
export const ECHO_ALIAS_REGISTRY: AliasRegistryEntry[] = [
  {
    id: 'tts/echo_flash-v2.5',
    capability: 'tts',
    alias: 'echo',
    family: 'flash',
    version: 'v2.5',
    upstream: { provider: 'elevenlabs', model: 'eleven_flash_v2_5' },
    status: 'active',
  },
  {
    id: 'tts/echo_multilingual-v2',
    capability: 'tts',
    alias: 'echo',
    family: 'multilingual',
    version: 'v2',
    upstream: { provider: 'elevenlabs', model: 'eleven_multilingual_v2' },
    status: 'active',
  },
  {
    id: 'tts/echo_turbo-v2.5',
    capability: 'tts',
    alias: 'echo',
    family: 'turbo',
    version: 'v2.5',
    upstream: { provider: 'elevenlabs', model: 'eleven_turbo_v2_5' },
    status: 'active',
  },
];

/** Default alias used when no explicit model is specified. */
export const DEFAULT_ECHO_ALIAS = 'tts/echo_flash-v2.5';

// ─── Normalisation helpers ────────────────────────────────────────────────────

/**
 * Build a fast lookup map: normalised key → registry entry.
 * Normalisation: lowercase, collapse dots → underscores, strip leading "tts/"
 * so all of these resolve to the same entry:
 *   echo_flash_v2.5  |  echo_flash-v2.5  |  tts/echo_flash-v2.5  |  Echo_Flash_V2.5
 */
function buildLookupMap(registry: AliasRegistryEntry[]): Map<string, AliasRegistryEntry> {
  const map = new Map<string, AliasRegistryEntry>();
  for (const entry of registry) {
    map.set(normaliseKey(entry.id), entry);
    // Also index without the capability prefix
    map.set(normaliseKey(entry.id.replace(/^[^/]+\//, '')), entry);
  }
  return map;
}

function normaliseKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\./g, '_')   // dots → underscores for version separators
    .replace(/-/g, '_')    // hyphens → underscores for family separators
    .replace(/^[a-z]+\//, ''); // strip capability prefix (tts/, llm/, …)
}

const ECHO_LOOKUP = buildLookupMap(ECHO_ALIAS_REGISTRY);

// ─── Router ───────────────────────────────────────────────────────────────────

/**
 * Resolve an Echo (TTS) alias ID supplied by the client.
 *
 * Returns a `RouteDecision` — the caller must check `status`:
 *  - `ALLOW`:  `upstreamModelId` is safe to send to the provider.
 *  - `ERROR`:  `errorCode` + `publicMessage` describe what went wrong.
 *
 * Vendor model strings are only present inside `upstreamModelId` and must
 * never be included in API responses or frontend state.
 *
 * @example
 * const decision = resolveEchoAlias("echo_flash_v2.5");
 * // { status: "ALLOW", canonicalId: "tts/echo_flash-v2.5", upstreamModelId: "eleven_flash_v2_5", … }
 *
 * const bad = resolveEchoAlias("gpt-4o");
 * // { status: "ERROR", errorCode: "EBRN_ALIAS_UNKNOWN", publicMessage: "Unknown Model", … }
 */
export function resolveEchoAlias(rawAliasId: string): RouteDecision {
  if (!rawAliasId || typeof rawAliasId !== 'string') {
    return {
      status: 'ERROR',
      canonicalId: null,
      upstreamModelId: null,
      errorCode: 'EBRN_ALIAS_UNKNOWN',
      publicMessage: 'Unknown Model',
    };
  }

  // Block raw vendor model IDs from being passed directly
  const lower = rawAliasId.toLowerCase();
  if (lower.startsWith('eleven_') || lower.startsWith('gpt-') || lower.startsWith('claude-')) {
    return {
      status: 'ERROR',
      canonicalId: null,
      upstreamModelId: null,
      errorCode: 'EBRN_ALIAS_UNKNOWN',
      publicMessage: 'Unknown Model',
    };
  }

  const key = normaliseKey(rawAliasId);
  const entry = ECHO_LOOKUP.get(key);

  if (!entry) {
    return {
      status: 'ERROR',
      canonicalId: null,
      upstreamModelId: null,
      errorCode: 'EBRN_ALIAS_UNKNOWN',
      publicMessage: 'Unknown Model',
    };
  }

  if (entry.status === 'deprecated') {
    // Still route it, but callers can inspect status for warnings
    return {
      status: 'ALLOW',
      canonicalId: entry.id,
      upstreamModelId: entry.upstream.model,
      errorCode: null,
      publicMessage: null,
    };
  }

  return {
    status: 'ALLOW',
    canonicalId: entry.id,
    upstreamModelId: entry.upstream.model,
    errorCode: null,
    publicMessage: null,
  };
}

/**
 * Returns all active canonical alias IDs for a given capability.
 * Use this to populate UI dropdowns — vendor model IDs are never included.
 */
export function listActiveAliases(capability: EburonCapability): string[] {
  return ECHO_ALIAS_REGISTRY
    .filter(e => e.capability === capability && e.status === 'active')
    .map(e => e.id);
}
