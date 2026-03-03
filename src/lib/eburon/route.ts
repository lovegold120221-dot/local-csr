/**
 * Eburon Route Evaluator
 *
 * Ties alias resolution + whitelist evaluation + error production into a
 * single `evaluateRoute()` function. Matches the few-shot I/O contract.
 */

import {
  type AliasModelEntry,
  canonicalize,
  resolveAlias,
  validateAliasFamily,
  listActiveAliases,
  loadAliasRegistry,
} from './alias-registry';
import {
  type WhitelistRule,
  type WhitelistLimits,
  evaluate as evaluateWhitelist,
  allowedModelsForContext,
} from './whitelist';
import {
  type EburonPublicError,
  type EburonLogEvent,
  buildLogEvent,
} from './errors';

// ---------------------------------------------------------------------------
// Input / Output shapes (match the spec examples)
// ---------------------------------------------------------------------------

export interface RouteInput {
  env?: string;
  tenant_id?: string;
  workspace_id?: string;
  user_id?: string;
  role?: string;
  request_id?: string;
  correlation_id?: string;
  alias_model: string;
  task_type?: string;
  requested_capabilities?: string[];
  limits?: {
    max_input_tokens?: number;
    max_output_tokens?: number;
  };
  telemetry?: {
    input_token_estimate?: number;
    has_images?: boolean;
    has_audio?: boolean;
  };
  whitelist_rules: WhitelistRule[];
  model_registry?: AliasModelEntry[];
}

export interface RouteOutput {
  status: 'ALLOW' | 'DENY' | 'ERROR';
  public: EburonPublicError;
  internal: {
    route: {
      provider_vendor: string | null;
      provider_model: string | null;
      endpoint: string | null;
      params: Record<string, unknown> | null;
    } | null;
    error: {
      code: string;
      message: string;
      detail?: Record<string, unknown>;
    } | null;
  };
  log_event: EburonLogEvent;
}

// ---------------------------------------------------------------------------
// Core evaluator
// ---------------------------------------------------------------------------

export function evaluateRoute(input: RouteInput): RouteOutput {
  const {
    env, tenant_id, workspace_id, user_id, role,
    request_id, correlation_id,
    alias_model, task_type,
    requested_capabilities = [],
    limits,
    telemetry,
    whitelist_rules,
    model_registry,
  } = input;

  // If caller provided a model_registry, load it transiently
  if (model_registry) {
    loadAliasRegistry(model_registry);
  }

  const baseLog: Partial<EburonLogEvent> = {
    env, tenant_id, workspace_id, user_id, request_id, correlation_id,
    alias_requested: alias_model,
    telemetry,
  };

  // ── Step 1: Canonicalize & validate alias ────────────────────────────
  const canonical = canonicalize(alias_model);
  const familyErr = validateAliasFamily(canonical);

  if (familyErr) {
    return {
      status: 'ERROR',
      public: {
        eburon_model: null,
        message: 'Invalid Eburon model name. Use a valid alias like codemax-v3 or vision-pro-v2.',
        allowed_models_hint: [],
      },
      internal: {
        route: null,
        error: { code: 'EBU.ALIAS.UNKNOWN_FAMILY', message: 'Family not recognized', detail: { family: alias_model } },
      },
      log_event: buildLogEvent({
        ...baseLog,
        event: 'eburon.route.error',
        lvl: 'ERROR',
        alias_canonical: null,
        error: { code: 'EBU.ALIAS.UNKNOWN_FAMILY', message: 'Family not recognized', detail: { family: alias_model } },
      }),
    };
  }

  // ── Step 2: Resolve alias to registry entry ──────────────────────────
  const entry = resolveAlias(canonical);
  if (!entry) {
    return {
      status: 'ERROR',
      public: {
        eburon_model: canonical,
        message: 'Unknown Eburon model. Check the alias and try again.',
        allowed_models_hint: [],
      },
      internal: {
        route: null,
        error: { code: 'EBU.ALIAS.NOT_FOUND', message: 'Alias not in registry', detail: { alias: canonical } },
      },
      log_event: buildLogEvent({
        ...baseLog,
        event: 'eburon.route.error',
        lvl: 'ERROR',
        alias_canonical: canonical,
        error: { code: 'EBU.ALIAS.NOT_FOUND', message: 'Alias not in registry', detail: { alias: canonical } },
      }),
    };
  }

  // ── Step 3: Evaluate whitelist ───────────────────────────────────────
  const wlReq = {
    env, tenant_id, workspace_id, user_id, role,
    capability: entry.capability,
    action: task_type ?? 'chat',
    alias_id: entry.id,
  };

  const decision = evaluateWhitelist(whitelist_rules, wlReq);

  if (decision.effect !== 'allow') {
    const activeIds = listActiveAliases().map((a) => a.id);
    const hints = allowedModelsForContext(whitelist_rules, activeIds, {
      env, tenant_id, workspace_id, user_id, role,
      capability: entry.capability,
      action: task_type ?? 'chat',
    });

    const code = decision.effect === 'deny' ? 'EBU.WL.DENY' : 'EBU.WL.NO_MATCH';
    const message = decision.effect === 'deny'
      ? 'Explicitly denied by whitelist rule'
      : 'No allow rule matched for alias';

    return {
      status: 'DENY',
      public: {
        eburon_model: entry.id,
        message: "This Eburon model isn't enabled for your workspace. Choose an allowed Eburon model or contact your admin.",
        allowed_models_hint: hints,
      },
      internal: {
        route: null,
        error: { code, message, detail: { env, tenant_id } },
      },
      log_event: buildLogEvent({
        ...baseLog,
        event: 'eburon.route.denied',
        lvl: 'WARN',
        alias_canonical: entry.id,
        rule_applied: decision.matched_rule
          ? { rule_id: decision.matched_rule.rule_id, name: decision.matched_rule.name }
          : null,
        error: { code, message },
      }),
    };
  }

  // ── Step 4: Check token limits ───────────────────────────────────────
  const effectiveLimits: WhitelistLimits = { ...decision.limits };
  if (limits?.max_input_tokens) {
    effectiveLimits.max_input_tokens = Math.min(
      limits.max_input_tokens,
      decision.limits?.max_input_tokens ?? Infinity,
    );
  }
  if (limits?.max_output_tokens) {
    effectiveLimits.max_output_tokens = Math.min(
      limits.max_output_tokens,
      decision.limits?.max_output_tokens ?? Infinity,
    );
  }

  if (
    telemetry?.input_token_estimate &&
    effectiveLimits.max_input_tokens &&
    telemetry.input_token_estimate > effectiveLimits.max_input_tokens
  ) {
    return {
      status: 'ERROR',
      public: {
        eburon_model: entry.id,
        message: 'Request too large for the selected Eburon model limits. Reduce input size or choose a larger Eburon model.',
        allowed_models_hint: [],
      },
      internal: {
        route: null,
        error: {
          code: 'EBU.TOKENS.CONTEXT_LIMIT',
          message: 'input_token_estimate exceeds max_input_tokens',
          detail: {
            input_token_estimate: telemetry.input_token_estimate,
            max_input_tokens: effectiveLimits.max_input_tokens,
          },
        },
      },
      log_event: buildLogEvent({
        ...baseLog,
        event: 'eburon.route.error',
        lvl: 'ERROR',
        alias_canonical: entry.id,
        error: {
          code: 'EBU.TOKENS.CONTEXT_LIMIT',
          message: 'input_token_estimate exceeds max_input_tokens',
          detail: {
            input_token_estimate: telemetry.input_token_estimate,
            max_input_tokens: effectiveLimits.max_input_tokens,
          },
        },
      }),
    };
  }

  // ── Step 5: Build route (ALLOW) ──────────────────────────────────────
  const routeParams: Record<string, unknown> = { ...entry.defaultParams };
  if (effectiveLimits.max_output_tokens) {
    routeParams.max_output_tokens = effectiveLimits.max_output_tokens;
  }

  const grantedCaps = requested_capabilities.length > 0
    ? requested_capabilities.filter((c) => entry.capabilities?.includes(c) ?? true)
    : entry.capabilities ?? [];

  return {
    status: 'ALLOW',
    public: {
      eburon_model: entry.id,
      message: 'Approved. Routing request using the selected Eburon model.',
      allowed_models_hint: [],
    },
    internal: {
      route: {
        provider_vendor: entry.upstream.vendor,
        provider_model: entry.upstream.model,
        endpoint: entry.upstream.endpoint ?? null,
        params: routeParams,
      },
      error: null,
    },
    log_event: buildLogEvent({
      ...baseLog,
      event: 'eburon.route.allowed',
      lvl: 'INFO',
      alias_canonical: entry.id,
      rule_applied: decision.matched_rule
        ? { rule_id: decision.matched_rule.rule_id, name: decision.matched_rule.name }
        : null,
      route: {
        provider_vendor: entry.upstream.vendor,
        provider_model: entry.upstream.model,
        endpoint: entry.upstream.endpoint ?? null,
      },
      capabilities: {
        requested: requested_capabilities,
        granted: grantedCaps,
      },
      limits_effective: effectiveLimits as Record<string, unknown>,
      error: null,
    }),
  };
}
