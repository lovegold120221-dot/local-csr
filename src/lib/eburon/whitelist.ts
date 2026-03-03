/**
 * Eburon Whitelist Engine
 *
 * Rule ID format: wl.<scope>.<subject>.<resource>.<action>.<target>.<mode>
 * Evaluation: most-specific-wins → deny-overrides-allow → default-deny.
 */

import { aliasMatchesPattern } from './alias-registry';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WhitelistScope = 'global' | 'ws' | 'env' | 'app' | 'tenant';
export type WhitelistEffect = 'allow' | 'deny';

export interface WhitelistLimits {
  rpm?: number;
  tpm?: number;
  max_input_tokens?: number;
  max_output_tokens?: number;
  max_session_seconds?: number;
}

export interface WhitelistMatch {
  env?: string;
  workspace_id?: string;
  tenant_id?: string;
  subject?: string;          // "any" | "role:<name>" | "user:<id>" | "key:<id>"
  capability?: string;       // "llm" | "vision" | "tts" | "stt" | "embed"
  action?: string;           // "chat" | "complete" | "stream" | "synth" | "transcribe"
  model?: string;            // alias pattern, supports trailing *
}

export interface WhitelistRule {
  rule_id: string;
  name?: string;
  enabled: boolean;
  scope?: WhitelistScope;
  priority?: number;
  match: WhitelistMatch;
  effect: WhitelistEffect;
  alias_patterns?: string[];
  capabilities_allow?: string[];
  limits?: WhitelistLimits;
  reason?: string;
  audit?: {
    created_at?: string;
    created_by?: string;
  };
}

export interface WhitelistRequest {
  env?: string;
  tenant_id?: string;
  workspace_id?: string;
  user_id?: string;
  role?: string;
  capability: string;
  action: string;
  alias_id: string;
}

export interface WhitelistDecision {
  effect: WhitelistEffect | 'deny_default';
  matched_rule: WhitelistRule | null;
  limits: WhitelistLimits | null;
}

// ---------------------------------------------------------------------------
// Scope specificity (higher = more specific)
// ---------------------------------------------------------------------------

const SCOPE_SPECIFICITY: Record<string, number> = {
  global: 0,
  env: 10,
  app: 20,
  tenant: 30,
  ws: 40,
};

function subjectSpecificity(subject: string | undefined): number {
  if (!subject || subject === 'any') return 0;
  if (subject.startsWith('role:')) return 10;
  if (subject.startsWith('key:')) return 20;
  if (subject.startsWith('user:')) return 30;
  return 0;
}

// ---------------------------------------------------------------------------
// Matching helpers
// ---------------------------------------------------------------------------

function matchesSubject(ruleSubject: string | undefined, req: WhitelistRequest): boolean {
  if (!ruleSubject || ruleSubject === 'any') return true;
  if (ruleSubject.startsWith('user:') && req.user_id) {
    return ruleSubject === `user:${req.user_id}`;
  }
  if (ruleSubject.startsWith('role:') && req.role) {
    return ruleSubject === `role:${req.role}`;
  }
  return false;
}

function matchesField(ruleValue: string | undefined, reqValue: string | undefined): boolean {
  if (!ruleValue) return true; // rule doesn't constrain this field
  return ruleValue === reqValue;
}

function ruleMatchesRequest(rule: WhitelistRule, req: WhitelistRequest): boolean {
  if (!rule.enabled) return false;

  const m = rule.match;
  if (!matchesField(m.env, req.env)) return false;
  if (!matchesField(m.workspace_id, req.workspace_id)) return false;
  if (!matchesField(m.tenant_id, req.tenant_id)) return false;
  if (!matchesSubject(m.subject, req)) return false;
  if (!matchesField(m.capability, req.capability)) return false;
  if (!matchesField(m.action, req.action)) return false;

  // Model pattern matching
  if (m.model) {
    if (!aliasMatchesPattern(req.alias_id, m.model)) return false;
  }

  // alias_patterns (array form — any pattern match suffices)
  if (rule.alias_patterns && rule.alias_patterns.length > 0) {
    const matched = rule.alias_patterns.some((p) => aliasMatchesPattern(req.alias_id, p));
    if (!matched) return false;
  }

  // capabilities_allow
  if (rule.capabilities_allow && rule.capabilities_allow.length > 0) {
    if (!rule.capabilities_allow.includes(req.capability)) return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

/**
 * Evaluate whitelist rules against a request.
 *
 * 1. Filter to matching rules
 * 2. Sort by specificity (scope + subject + explicit priority)
 * 3. Most specific wins; deny overrides allow at same specificity
 * 4. Default is deny if no rules match
 */
export function evaluate(rules: WhitelistRule[], req: WhitelistRequest): WhitelistDecision {
  const matching = rules.filter((r) => ruleMatchesRequest(r, req));

  if (matching.length === 0) {
    return { effect: 'deny_default', matched_rule: null, limits: null };
  }

  // Sort: highest specificity first; deny wins ties
  matching.sort((a, b) => {
    const prioA = a.priority ?? 0;
    const prioB = b.priority ?? 0;
    if (prioA !== prioB) return prioB - prioA;

    const scopeA = SCOPE_SPECIFICITY[a.scope ?? 'global'] ?? 0;
    const scopeB = SCOPE_SPECIFICITY[b.scope ?? 'global'] ?? 0;
    if (scopeA !== scopeB) return scopeB - scopeA;

    const subjA = subjectSpecificity(a.match.subject);
    const subjB = subjectSpecificity(b.match.subject);
    if (subjA !== subjB) return subjB - subjA;

    // Deny wins at same specificity
    if (a.effect !== b.effect) return a.effect === 'deny' ? -1 : 1;
    return 0;
  });

  const winner = matching[0];
  return {
    effect: winner.effect,
    matched_rule: winner,
    limits: winner.limits ?? null,
  };
}

/**
 * Collect alias IDs that would be allowed for a given request context.
 * Useful for the `allowed_models_hint` field in deny responses.
 */
export function allowedModelsForContext(
  rules: WhitelistRule[],
  activeAliasIds: string[],
  req: Omit<WhitelistRequest, 'alias_id'>,
): string[] {
  return activeAliasIds.filter((id) => {
    const decision = evaluate(rules, { ...req, alias_id: id });
    return decision.effect === 'allow';
  });
}
