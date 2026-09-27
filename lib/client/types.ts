import type { AttrComparison, AttributeMap, ComponentScores, ScoringWeights, VetoResult } from '@/lib/matching/types';

export interface QueueItem {
  id: string;
  category: string;
  matchType: string;
  score: number;
  rawScore: number;
  vetoed: boolean;
  routing: string;
  status: string;
  reasonCodes: string[];
  proposedCnmc: string | null;
  decidedAt: string | null;
  createdAt: string;
  aCode: string;
  aDesc: string;
  aOrg: string;
  bCode: string;
  bDesc: string;
  bOrg: string;
  queue: string | null;
  priority: number | null;
  taskStatus: string | null;
  decidedBy: string | null;
}

export interface RecordView {
  id: string;
  org: { code: string; name: string; sector: string };
  legacyCode: string;
  rawDescription: string;
  rawLongText: string | null;
  rawUom: string | null;
  manufacturer: string | null;
  partNumber: string | null;
  materialGroup: string | null;
  lastPoPriceInr: number | null;
  annualQty: number | null;
  normalized: string;
  expansions: { term: string; expansion: string; kind: string }[];
  category: string;
  categoryConfidence: number;
  classifierReasons: string[];
  attributes: AttributeMap;
  baseUom: string | null;
  uomDimension: string;
  completeness: number;
  flags: string[];
  missingRequired: string[];
  mapping: { id: string; canonicalId: string; cnmc: string; description: string } | null;
}

export interface AuditEvent {
  seq: number;
  id: string;
  occurredAt: string;
  actorName: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  reason: string | null;
  payload: Record<string, unknown>;
  prevHash: string;
  hash: string;
}

export interface RecommendationDetail {
  id: string;
  categoryCode: string;
  matchType: string;
  rawScore: number;
  finalScore: number;
  componentScores: ComponentScores;
  effectiveWeights: ScoringWeights;
  deterministicRule: string | null;
  vetoed: boolean;
  vetoes: VetoResult[];
  substitutions: string[];
  attributeDiff: AttrComparison[];
  reasonCodes: string[];
  explanation: string;
  routing: string;
  status: string;
  proposedCnmc: string | null;
  proposedDescription: string | null;
  decisionNote: string | null;
  decidedAt: string | null;
  decidedByName: string | null;
  createdAt: string;
  task: { queue: string; priority: number; status: string } | null;
  modelVersion: { matcherVersion: string; embeddingModel: string } | null;
  a: RecordView;
  b: RecordView;
  cluster: { legacyCode: string; org: string; description: string; rawId: string }[];
  history: AuditEvent[];
}
