/**
 * Eburon Alias Model Registry
 *
 * Canonical ID format: <capability>/<alias>_<family>-<version>
 * Vendor model strings never leave the backend.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Capability = 'llm' | 'vision' | 'tts' | 'stt' | 'embed';

export interface UpstreamProvider {
  vendor: string;
  model: string;
  endpoint?: string;
}

export interface AliasModelEntry {
  /** e.g. "llm/codemax_4o-mini" */
  id: string;
  capability: Capability;
  /** Eburon brand alias, e.g. "codemax" */
  alias: string;
  /** Short function label, e.g. "4o-mini" */
  family: string;
  /** Version string (semver-ish, date, or "latest") */
  version: string;
  upstream: UpstreamProvider;
  capabilities?: string[];
  defaultParams?: Record<string, unknown>;
  status: 'active' | 'deprecated' | 'disabled';
}

// ---------------------------------------------------------------------------
// Known alias families (extend as needed)
// ---------------------------------------------------------------------------

const KNOWN_FAMILIES = new Set([
  'codemax', 'orbit', 'echo', 'vision', 'scribe',
]);

// ---------------------------------------------------------------------------
// Canonical ID helpers
// ---------------------------------------------------------------------------

const CANONICAL_RE =
  /^(llm|vision|tts|stt|embed)\/([a-z][a-z0-9]*)_([a-z0-9][a-z0-9._-]*)-([a-z0-9][a-z0-9._-]*)$/;

/** Validate that an alias ID matches the canonical format. */
export function isValidCanonicalId(id: string): boolean {
  return CANONICAL_RE.test(id);
}

/** Parse a canonical alias ID into its components, or null if invalid. */
export function parseCanonicalId(id: string) {
  const m = CANONICAL_RE.exec(id);
  if (!m) return null;
  return {
    capability: m[1] as Capability,
    alias: m[2],
    family: m[3],
    version: m[4],
  };
}

/** Build a canonical alias ID from parts. */
export function buildCanonicalId(
  capability: Capability,
  alias: string,
  family: string,
  version: string,
): string {
  return `${capability}/${alias}_${family}-${version}`;
}

// ---------------------------------------------------------------------------
// Registry (in-memory, loaded from config)
// ---------------------------------------------------------------------------

let _registry: Map<string, AliasModelEntry> = new Map();

/** Load alias entries into the registry. Idempotent — replaces existing. */
export function loadAliasRegistry(entries: AliasModelEntry[]): void {
  const map = new Map<string, AliasModelEntry>();
  for (const entry of entries) {
    map.set(entry.id.toLowerCase(), entry);
  }
  _registry = map;
}

/** Resolve an alias ID (case-insensitive) to a registry entry, or null. */
export function resolveAlias(aliasId: string): AliasModelEntry | null {
  return _registry.get(aliasId.toLowerCase()) ?? null;
}

/** Canonicalize a user-supplied alias string (lowercase + trim). */
export function canonicalize(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Validate that a user-supplied alias string refers to a known family.
 * Returns an error code string or null if OK.
 */
export function validateAliasFamily(raw: string): 'EBU.ALIAS.UNKNOWN_FAMILY' | null {
  const parsed = parseCanonicalId(canonicalize(raw));
  if (!parsed) {
    // Try to extract family from a loose format
    const parts = raw.split(/[/_-]/);
    const hasKnown = parts.some((p) => KNOWN_FAMILIES.has(p.toLowerCase()));
    return hasKnown ? null : 'EBU.ALIAS.UNKNOWN_FAMILY';
  }
  return KNOWN_FAMILIES.has(parsed.alias) ? null : 'EBU.ALIAS.UNKNOWN_FAMILY';
}

/** List all active entries in the registry. */
export function listActiveAliases(): AliasModelEntry[] {
  return [..._registry.values()].filter((e) => e.status === 'active');
}

/** List aliases by capability. */
export function listAliasesByCapability(cap: Capability): AliasModelEntry[] {
  return listActiveAliases().filter((e) => e.capability === cap);
}

/** Check if an alias ID matches a glob-like pattern (supports trailing *). */
export function aliasMatchesPattern(aliasId: string, pattern: string): boolean {
  const a = aliasId.toLowerCase();
  const p = pattern.toLowerCase();
  if (p === '*' || p === a) return true;
  if (p.endsWith('*')) {
    return a.startsWith(p.slice(0, -1));
  }
  return false;
}
