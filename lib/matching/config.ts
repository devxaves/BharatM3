import type { EngineConfig } from './types';

/** Matcher implementation version — recorded on every recommendation via model_versions. */
export const MATCHER_VERSION = 'hybrid-matcher-1.3.0';

/**
 * Default engine configuration (PRD §6). Seeded into `app_config` / `model_versions`;
 * the engine always receives config as a parameter so it is demonstrably tunable.
 */
export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  weights: {
    semantic: 0.3,
    attribute: 0.25,
    specification: 0.15,
    dimension: 0.1,
    classification: 0.08,
    uom: 0.07,
    procurement: 0.05,
  },
  thresholds: {
    duplicate: 0.95,
    nearDuplicate: 0.85,
    functional: 0.7,
    related: 0.45,
    autoQueue: 0.95,
    review: 0.75,
  },
  semanticCalibration: { floor: 0.25, ceil: 0.8 },
  missingHistoryPolicy: 'renormalize',
  knnCandidates: 8,
};
