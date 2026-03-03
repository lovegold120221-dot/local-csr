/**
 * Eburon Standard — barrel export
 *
 * Usage:
 *   import { evaluateRoute, EburonError, toEburonError, eburonJsonResponse } from '@/lib/eburon';
 */

// Alias registry
export {
  type Capability,
  type AliasModelEntry,
  type UpstreamProvider,
  isValidCanonicalId,
  parseCanonicalId,
  buildCanonicalId,
  loadAliasRegistry,
  resolveAlias,
  canonicalize,
  validateAliasFamily,
  listActiveAliases,
  listAliasesByCapability,
  aliasMatchesPattern,
} from './alias-registry';

// Whitelist engine
export {
  type WhitelistScope,
  type WhitelistEffect,
  type WhitelistLimits,
  type WhitelistMatch,
  type WhitelistRule,
  type WhitelistRequest,
  type WhitelistDecision,
  evaluate as evaluateWhitelist,
  allowedModelsForContext,
} from './whitelist';

// Error layer
export {
  type EburonErrorDef,
  type EburonPublicError,
  type EburonLogEvent,
  EBURON_ERRORS,
  EburonError,
  publicError,
  buildLogEvent,
  sanitizeErrorMessage,
  toEburonError,
  eburonJsonResponse,
} from './errors';

// Route evaluator
export {
  type RouteInput,
  type RouteOutput,
  evaluateRoute,
} from './route';
