/**
 * Model pricing table for Claude Code JSONL-derived cost calculations.
 *
 * Per-million-token prices in USD. Source: docs.anthropic.com/en/docs/about-claude/pricing.
 * Keys are the `model` string Claude Code writes into the JSONL `message.model` field.
 *
 * Update this table when:
 *   - A new model is released
 *   - Anthropic adjusts pricing
 *
 * Cache pricing is per Anthropic prompt-caching docs:
 *   - cache_creation: same as input × 1.25 (5min) or × 2 (1h)
 *   - cache_read: input × 0.10
 *
 * Centralised here so realtime polling (jsonl-usage-tracker) and startup backfill
 * (cost-backfill) share a single source of truth.
 */
import { logger } from '../utils/logger';

export interface ModelPricing {
  input: number;
  output: number;
  cacheCreate5m: number;
  cacheCreate1h: number;
  cacheRead: number;
}

export const PRICING: Record<string, ModelPricing> = {
  // Sonnet family
  'claude-sonnet-4-6': {
    input: 3, output: 15,
    cacheCreate5m: 3.75, cacheCreate1h: 6, cacheRead: 0.30,
  },
  'claude-sonnet-4-5': {
    input: 3, output: 15,
    cacheCreate5m: 3.75, cacheCreate1h: 6, cacheRead: 0.30,
  },
  'claude-sonnet-4': {
    input: 3, output: 15,
    cacheCreate5m: 3.75, cacheCreate1h: 6, cacheRead: 0.30,
  },
  // Opus family
  'claude-opus-4-7': {
    input: 15, output: 75,
    cacheCreate5m: 18.75, cacheCreate1h: 30, cacheRead: 1.50,
  },
  'claude-opus-4-6': {
    input: 15, output: 75,
    cacheCreate5m: 18.75, cacheCreate1h: 30, cacheRead: 1.50,
  },
  'claude-opus-4-5': {
    input: 15, output: 75,
    cacheCreate5m: 18.75, cacheCreate1h: 30, cacheRead: 1.50,
  },
  'claude-opus-4-1': {
    input: 15, output: 75,
    cacheCreate5m: 18.75, cacheCreate1h: 30, cacheRead: 1.50,
  },
  'claude-opus-4': {
    input: 15, output: 75,
    cacheCreate5m: 18.75, cacheCreate1h: 30, cacheRead: 1.50,
  },
  // Haiku family
  'claude-haiku-4-5': {
    input: 1, output: 5,
    cacheCreate5m: 1.25, cacheCreate1h: 2, cacheRead: 0.10,
  },
  'claude-haiku-3-5': {
    input: 0.80, output: 4,
    cacheCreate5m: 1.00, cacheCreate1h: 1.60, cacheRead: 0.08,
  },
};

/** Default pricing applied when an unknown model string is seen (sonnet-4-6 baseline). */
export const DEFAULT_PRICING: ModelPricing = PRICING['claude-sonnet-4-6'];

export function resolvePricing(model: string): ModelPricing {
  if (PRICING[model]) return PRICING[model];
  // Try prefix match — e.g. "claude-sonnet-4-6-20250101"
  for (const key of Object.keys(PRICING)) {
    if (model.startsWith(key)) return PRICING[key];
  }
  // Family fallback (e.g. unknown sonnet variant)
  if (model.includes('opus')) return PRICING['claude-opus-4-1'];
  if (model.includes('haiku')) return PRICING['claude-haiku-4-5'];
  if (model.includes('sonnet')) return PRICING['claude-sonnet-4-6'];
  logger.warn(`Unknown model '${model}' — falling back to sonnet-4-6 pricing`);
  return DEFAULT_PRICING;
}
