# Product Requirements Document — BharatM3
## AI-Driven National Material Master Harmonization Platform for CPSEs
### SIH Problem Statement 26099 — Ministry of Petroleum & Natural Gas / CPCL

**Document purpose:** This PRD is written to be read and executed by an autonomous coding agent (e.g. an "Antigravity"-style build agent). It contains everything needed to scaffold, implement, and self-verify the project without further clarification. Where a decision has been made, it is stated as a rule, not a suggestion. Where the agent must make a judgment call, that is explicitly flagged as "AGENT DISCRETION."

**Tagline:** "AI recommends. Domain experts approve. Every legacy code remains traceable."

---

## 1. Problem Statement (source of truth)

Central Public Sector Enterprises (CPSEs — e.g. CPCL, ONGC, IOCL, NTPC, Coal India, SAIL) each run independent SAP/ERP instances. The same physical material is assigned different codes, descriptions, units of measurement, and classifications across CPSEs, causing duplicate material masters, fragmented procurement data, higher inventory carrying costs, and zero collaborative procurement power.

**Goal:** Build an AI-powered platform that ingests material records from multiple CPSEs, standardizes and harmonizes descriptions, detects exact duplicates / near-duplicates / functionally equivalent materials, recommends a **Common National Material Code (CNMC)**, and maintains a reversible mapping back to every CPSE's legacy code — without requiring any CPSE to change its existing ERP.

**This platform must never silently auto-merge production data.** Every equivalence recommendation is reviewed and approved by a human "Data Steward" before it becomes authoritative. This is a governance product wrapped around an AI matching engine, not an AI product with a UI bolted on.

---

## 2. Non-negotiable Design Principles

The agent must treat these as hard constraints, not preferences:

1. **Never destructive.** Legacy CPSE material codes are never deleted, edited, or overwritten. All harmonization happens through an additive mapping table.
2. **Every AI decision is explainable.** No match recommendation may be shown to a user without a `reason_codes` array and a plain-language explanation of which attributes matched and which conflicted.
3. **Hard exclusion rules override similarity scores.** If two materials differ on a safety-critical attribute (voltage, pressure class, material grade, certification), they must never be recommended as equivalent, regardless of how high the text/semantic similarity score is. This is implemented as a rules layer that runs *after* scoring and can veto a match.
4. **Category-aware, not generic.** Matching logic must use different attribute schemas for different material families (bearings, valves, cables, fasteners, pumps at minimum). A single generic "similarity score" for all material types is explicitly rejected as an approach.
5. **Confidence-tiered routing, not one-size-fits-all.** High-confidence matches auto-queue for lightweight approval; medium-confidence go to full review; low-confidence are marked `INSUFFICIENT_DATA` or `NOT_MATCHED`, never forced into a bucket.
6. **No live external dependency in the critical path.** No step required for the core demo may depend on a live SAP sandbox, a paid LLM API with no fallback, or a GPU service that isn't guaranteed available. Use local/open-weight models or deterministic fallbacks.
7. **The frontend must not look AI-generated.** See Section 8 in full — this is a strict, detailed requirement, not a footnote.

---

## 3. Required Technology Stack

Do not substitute without a documented reason in `/docs/decisions.md`. This is a **single Next.js application** — no separate backend service, no containers. Optimized to be buildable and deployable with minimal moving parts.

### Application
- **Framework:** Next.js 14+ (App Router), TypeScript throughout
- **API layer:** Next.js Route Handlers / Server Actions — this replaces a standalone backend entirely. Structure route handlers under `/app/api/*` so the matching engine, ingestion, and governance logic are still cleanly separated modules (`/lib/matching`, `/lib/ingestion`, `/lib/governance`), just not a separate deployable service.
- **Validation:** Zod (schema validation on both client and server)
- **Data processing:** plain TypeScript/JS for CSV/Excel parsing (`papaparse` for CSV, `xlsx`/SheetJS for Excel)

### Database
- **Primary store:** Neon (serverless Postgres) — connect via `@neondatabase/serverless` driver for edge/serverless compatibility.
- **ORM:** Drizzle ORM (lighter than Prisma, pairs cleanly with Neon's serverless driver, and its SQL-like query builder makes the matching engine's scoring queries easy to reason about).
- **Migrations:** Drizzle Kit.
- **Vector search:** `pgvector` extension, enabled directly on the Neon instance — do **not** introduce a separate vector database. One connection string, one schema, easiest possible setup for a judge or agent to verify end-to-end.
- **Search/fuzzy:** PostgreSQL `pg_trgm` extension for trigram fuzzy matching, supplemented by application-level fuzzy scoring (see AI/ML below).

### AI / ML
- **Embeddings:** call an embeddings API at ingestion/matching time (e.g. OpenAI `text-embedding-3-small`, or a free-tier alternative) and store the resulting vector in Postgres via `pgvector`. No local model hosting, no GPU dependency.
- **Attribute extraction:** rule-based extraction in TypeScript — regex + a category-specific keyword/synonym dictionary per material category (BEARING, VALVE, CABLE, FASTENER, PUMP). No Python, no spaCy — this is fully achievable in TS for the MVP's structured, abbreviation-heavy input strings.
- **Fuzzy string scoring:** `fastest-levenshtein` and/or `string-similarity` npm packages for Jaro-Winkler/Levenshtein-style scoring, combined with the semantic embedding score.
- **LLM use (optional, non-blocking):** only for (a) generating human-readable canonical description drafts for steward review, and (b) explaining a match in natural language. Never used to make the equivalence decision itself. Gate behind a feature flag/env var so the demo never breaks if the API is unavailable.

### Frontend (same Next.js app)
- **Styling:** Tailwind CSS with a **custom design token file** (see Section 8) — not default Tailwind palette, not shadcn defaults left unstyled.
- **Component base:** shadcn/ui as an unstyled primitive layer is acceptable **only** if every component is re-themed through the design tokens in Section 8 — never left at shadcn defaults.
- **Data tables:** TanStack Table for the large record grids — not a generic `<table>`, not AG-Grid.
- **Charts:** Recharts
- **State/data fetching:** TanStack Query for client-side data, Server Actions/Route Handlers for mutations
- **Animation/micro-interactions:** Framer Motion for transitions, state changes, and interactive feedback — see Section 8 for exactly where this matters and where it must stay restrained.

### Design tooling
- **Stitch MCP server:** already available as an MCP connector inside the Antigravity coding-agent environment. Use it during the design/UI phase (Section 8) to generate and iterate on screen layouts and visual design direction before implementing them as real Tailwind/React components — do not hand-roll every layout from scratch without first exploring options through Stitch. Treat its output as a design draft to translate into production code, not as final shippable markup — it must still be re-implemented with the real design tokens, real data, and real interactivity from this PRD.

### Testing
- Vitest + React Testing Library for unit/component tests
- Playwright for end-to-end smoke tests (the flows in Section 12)
- `tsc --noEmit` for typechecking, ESLint for linting — runnable as `npm run test`, `npm run typecheck`, `npm run lint`

### Deployment
- Vercel (pairs natively with Next.js) + Neon connection string as an environment variable. No servers to manage, no containers to build.

### Explicitly out of scope for MVP (document as roadmap only, do not implement)
Docker/containerization, Celery/Redis job queues, Kafka, Spark, Airflow, Neo4j, federated learning, real SAP OData/RFC integration, Kubernetes, a separate Python backend. These belong in a `/docs/scale-roadmap.md` file only.

---

## 4. System Architecture

```
CPSE Data Sources (CSV/Excel/API/mock-SAP JSON)
        │
        ▼
[1] Ingestion Layer  ──────────────► raw_material_records (Neon Postgres)
        │  - schema detection, column mapping UI, validation report
        ▼
[2] Normalization Layer
        │  - unit standardization (UOM lookup table)
        │  - abbreviation expansion (curated dictionary, 100+ terms, versioned)
        │  - tokenization, casing, punctuation cleanup
        ▼
[3] Category Classifier
        │  - routes record to one of: BEARING | VALVE | CABLE | FASTENER | PUMP | UNCLASSIFIED
        ▼
[4] Attribute Extraction (category-specific)
        │  - TypeScript regex + keyword/synonym dictionary per category schema
        │  - outputs structured JSON attributes + confidence per field
        ▼
[5] Hybrid Matching Engine
        │  Stage A: Blocking (candidate reduction by category + key attributes)
        │  Stage B: Deterministic rules (exact manufacturer part no., exact attribute hash)
        │  Stage C: Fuzzy string scoring (Levenshtein/Jaro-Winkler npm libs / pg_trgm)
        │  Stage D: Semantic scoring (pgvector cosine similarity on embeddings)
        │  Stage E: Weighted fusion → raw_score
        ▼
[6] Hard Exclusion Rules Layer
        │  - safety-critical attribute mismatch → veto, regardless of raw_score
        ▼
[7] Match Classification
        │  - IDENTICAL / DUPLICATE / NEAR_DUPLICATE / FUNCTIONALLY_EQUIVALENT /
        │    RELATED_BUT_NOT_EQUIVALENT / NOT_MATCHED / INSUFFICIENT_DATA
        ▼
[8] Confidence Routing
        │  - ≥0.95 auto-queue (still logged) | 0.75–0.95 human review | <0.75 flagged unresolved
        ▼
[9] Human Approval Workflow (Data Steward UI)
        │  - approve / reject / edit / request-more-info
        ▼
[10] Canonical Material Generator
        │  - dual ID: human-readable CNMC + immutable UUID
        │  - template-generated description (not free-text LLM output)
        │  - UNSPSC category mapping
        ▼
[11] Legacy Mapping Table  (many-to-one, reversible, never destructive)
        ▼
[12] Governance Layer
        │  - immutable audit_events log (hash-chained, append-only)
        ▼
[13] Outputs
        - Analytics Dashboard
        - Mapping API (REST, for CPSE lookup)
        - Mock SAP/ERP export adapter (JSON payload shaped like a real SAP IDoc/OData material object)
```

---

## 5. Data Model

Implement these tables (Postgres, via SQLAlchemy models + Alembic migrations). Use UUID primary keys throughout.

```
organizations            -- CPSE entities (CPCL, IOCL, NTPC, ...)
source_systems            -- SAP ECC / S4HANA / Oracle / CSV per org
raw_material_records       -- as-ingested, untouched
normalized_material_records -- post normalization pipeline
material_categories        -- BEARING, VALVE, CABLE, FASTENER, PUMP, ...
category_attribute_schemas -- JSON schema per category (what fields matter)
material_attributes        -- extracted key/value pairs per record, with confidence
canonical_materials        -- the harmonized "golden record"
material_mappings          -- legacy_code <-> canonical_material_id, many-to-one, with match_type + confidence + status
match_recommendations      -- every AI suggestion, approved or not, with reason_codes
approval_tasks             -- steward queue items, status, assignee
users / roles               -- data_entry, data_steward, admin, auditor
audit_events                -- immutable, append-only, hash-chained
uom_master                  -- canonical unit list + conversion factors
synonym_master               -- abbreviation/synonym dictionary, versioned
classification_master        -- UNSPSC mapping table
model_versions                -- which matcher/embedding version produced which recommendation
```

**Key relationship rule:** one `canonical_materials` row has many `material_mappings` rows (one per CPSE legacy code). Never model this as a destructive merge — always additive mapping.

**Example canonical record (for the agent's reference when building serializers):**
```json
{
  "cnmc": "IN-MAT-BRG-DGBB-6205-C3-25X52X15",
  "internal_uuid": "8f41c2a9-...",
  "canonical_description": "BEARING, BALL, DEEP GROOVE, 6205, C3 CLEARANCE",
  "category": "BEARING",
  "unspsc_code": "31171505",
  "attributes": { "bore_mm": 25, "outer_diameter_mm": 52, "width_mm": 15, "clearance": "C3" },
  "base_uom": "EA",
  "status": "APPROVED",
  "version": 1
}
```

---

## 6. Matching Engine — Scoring Detail

Weighted score (category weights are configurable per `category_attribute_schemas`, these are MVP defaults):

```
FinalScore =
    0.30 × semantic_similarity
  + 0.25 × attribute_similarity
  + 0.15 × specification_similarity
  + 0.10 × dimension_similarity
  + 0.08 × classification_similarity
  + 0.07 × UOM_compatibility
  + 0.05 × historical_procurement_similarity (default 0 if no history available — do not fabricate)
```

**Hard exclusion rule examples (implement as a discrete, testable function, not inline in the scorer):**
- Different voltage rating → block
- Different pressure class → block
- Different material grade (e.g. SS304 vs SS316) → block, unless an explicit interchangeability rule exists in a `substitution_rules` table
- Different safety/hazardous-area certification → block
- Different thread specification (fasteners) → block

**Classification thresholds (MVP defaults, must be configurable, not hardcoded magic numbers):**
```
score >= 0.95                       → IDENTICAL or DUPLICATE (deterministic rule decides which)
0.85 <= score < 0.95                → NEAR_DUPLICATE
0.70 <= score < 0.85 AND no veto    → FUNCTIONALLY_EQUIVALENT (candidate, needs review)
score < 0.70 with some overlap      → RELATED_BUT_NOT_EQUIVALENT
veto triggered regardless of score  → RELATED_BUT_NOT_EQUIVALENT (never higher)
missing required attributes         → INSUFFICIENT_DATA
```

---

## 7. Feature List (in build-priority order)

### Phase 1 — Ingestion & Normalization
1. CSV/Excel upload with column-mapping UI (drag columns to target schema fields)
2. Data quality preview: missing-field report, detected abbreviations, detected UOM inconsistencies
3. Abbreviation dictionary CRUD (seed with 100+ real industrial terms: SS→Stainless Steel, VLV→Valve, NB→Nominal Bore, SCH→Schedule, etc.)
4. UOM normalization table + conversion logic

### Phase 2 — Matching Engine
5. Category classifier (rule-based keyword classifier is acceptable for MVP; ML classifier is a stretch goal)
6. Attribute extraction per category (start with BEARING and VALVE fully implemented, CABLE/FASTENER/PUMP can be partial but must not be empty stubs — at least 3 real attributes each)
7. Full hybrid scoring pipeline (Stages A–E from Section 4)
8. Hard exclusion rule engine with a small seeded `substitution_rules` table
9. Match classification + confidence routing

### Phase 3 — Governance
10. Data Steward review queue UI: side-by-side record comparison, highlighted matching/conflicting attributes, approve/reject/edit/request-info actions
11. Immutable audit trail (every state change writes an event; expose a read-only audit log view)
12. Role-based access (data_entry, data_steward, admin, auditor) — can be a simple role field + route guards for MVP, does not need full OAuth/Keycloak

### Phase 4 — Canonicalization & Output
13. CNMC generator (dual ID: semantic code + UUID) using the template pattern in Section 5, not free-text generation
14. Legacy mapping table view + search (look up any CPSE code, see its canonical material and sibling codes)
15. Mock SAP/ERP export adapter: a documented REST endpoint returning a JSON payload shaped like a realistic SAP material master object, plus a one-page markdown doc describing the production IDoc/OData integration path

### Phase 5 — Analytics Dashboard
16. Summary metrics: total ingested, canonical groups formed, duplicates found, pending review count, insufficient-data count, UOM inconsistencies found
17. Category-wise breakdown chart
18. "Procurement opportunity" view: canonical materials with 3+ CPSE mappings, sorted by potential consolidation value (use a placeholder/estimated value field, clearly labeled as illustrative, not real pricing data)

### Explicitly deferred (do not build, note as roadmap)
Federated learning, live SAP OData integration, multilingual OCR, blockchain audit log, Kafka-based streaming ingestion.

---

## 8. Frontend / UI Requirements — READ CAREFULLY, THIS IS A HARD REQUIREMENT

The agent must actively avoid the visual signature of default AI-generated UI. Concretely:

**Banned patterns:**
- Default shadcn/ui components left unstyled with no custom theme applied
- Generic purple-to-blue gradient hero sections
- Centered emoji icons as the primary visual language
- Default system font stack with no typographic hierarchy decisions
- Uniform 8px-everything spacing with no rhythm or intentional density variation
- Glassmorphism/frosted-panel effects used decoratively rather than functionally

**Required instead:**
- **Typography:** pick one serif or distinctive sans for headings (e.g. a grotesque like Söhne/Inter Tight/IBM Plex Sans at weight 600+) paired with a highly legible body font (Inter or IBM Plex Sans Regular). Define a real type scale (e.g. 12/14/16/20/28/36px) in the Tailwind config as design tokens, not ad hoc classes per component.
- **Density:** this is a data-heavy enterprise tool (material records, attribute tables, audit logs) — the UI should read as information-dense and functional, like a professional ERP/admin tool, not a marketing landing page. Generous whitespace is wrong here; purposeful density is right.
- **Data tables are the primary UI surface**, not cards. Build the record grid, the match-review screen, and the mapping table as real dense tables with sorting, filtering, and inline expand-for-detail — this is where the product lives.
- **The match-review screen is the single most important screen in the product** — invest disproportionate design effort here: side-by-side record comparison, a clear visual diff of matching vs. conflicting attributes (not just a percentage badge), and one-click approve/reject/edit actions.
- Every screen must be reachable and usable with real seeded data — no screen should be a static mockup with lorem ipsum.

### 8.1 Color Palette (fixed — not agent discretion)

Use a **professional deep blue + teal system with white/light grey neutrals and amber accents.** This combination is deliberate: deep blue/teal signals government trust and industrial data seriousness, while amber (used sparingly) signals AI-assisted intelligence and draws the eye to things that need human attention.

Define these as CSS variables / Tailwind theme extension — never inline hex values in components:

- **Primary (deep blue):** the dominant brand/structural color — headers, primary nav, primary buttons, active states. AGENT DISCRETION on exact hex, but anchor around a deep navy-blue (roughly `#0B2545`–`#12345C` range), not a bright/default blue.
- **Secondary (teal):** used for secondary actions, links, in-progress/informational states, and to differentiate AI-driven elements (e.g. "semantic match" indicators) from purely structural UI. Roughly a muted teal in the `#0E7C7B`–`#127475` range.
- **Neutrals (white/light grey):** the base canvas — white/near-white backgrounds for content areas, a light-grey scale (3–4 steps) for borders, table zebra-striping, disabled states, and card backgrounds. Keep this restrained and consistent; this is what gives the dense data screens breathing room without looking sparse.
- **Amber accent:** reserved *exclusively* for things that need attention or represent AI-generated suggestions awaiting human judgment — medium-confidence match badges, "pending review" states, warning banners, the steward-queue notification indicator. Never use amber decoratively or for purely structural elements — its meaning must stay consistent everywhere it appears.
- **Semantic confidence colors** (for match classification, layered on top of the above, not replacing it): a clear high/medium/low visual language — e.g. teal-leaning green for high-confidence/auto-queue, the amber accent for medium-confidence/needs-review, and a muted red-adjacent tone (used only for this purpose) for vetoed/excluded/rejected matches. Define once in the token file, reuse everywhere a confidence or status badge appears.

**AGENT DISCRETION:** exact hex values, precise shade steps, and spacing scale are left to the agent's judgment within the above constraints, but must be defined once as tokens and applied consistently — never per-component ad hoc styling.

### 8.2 Micro-interactions & Animation

This is a functional requirement, not decoration — motion should communicate system state and make the AI pipeline feel legible, not just "smooth."

- **Use Framer Motion** for all transitions, list/table row enter-exit animations, and interactive feedback. Keep durations short (150–250ms) and easing consistent across the app via a shared motion config, not per-component magic numbers.
- **Where micro-interactions matter most:**
  - The match-review screen: animate the reveal of matching vs. conflicting attributes when a steward opens a record comparison, so the explanation feels like it's being "shown," not just dumped on screen.
  - Confidence badges and status changes (pending → approved/rejected): animate the state transition (color/label change) so an approval action feels acknowledged, not just a page refresh.
  - Data table interactions: row hover states, sort-column transitions, and inline row expansion should all be animated, not instant snaps.
  - Upload/ingestion flow: a real progress indicator (not a spinner alone) showing ingestion → normalization → classification → matching as discrete animated steps, since this pipeline *is* the product's story and should be visible, not hidden behind a loading screen.
  - Dashboard metrics: animate number count-ups and chart entrance on load — this is the one place a bit of polish-for-its-own-sake is appropriate, since it's the "wow" screen for judges.
- **Where to stay restrained:** dense data tables and the audit log should not have decorative animation on every cell — motion here should only ever communicate a state change, never run just for visual flourish, or it will undermine the "serious enterprise tool" read from Section 8's density requirement.
- **UI libraries:** shadcn/ui primitives (re-themed per Section 8.1) plus Framer Motion cover essentially everything needed — avoid pulling in additional heavy animation/UI libraries beyond these unless a specific gap appears (document any addition in `/docs/decisions.md`).

---

## 9. Seed / Demo Data Requirements

Do not wait for real CPSE data. Generate a synthetic dataset before building the matching engine so it can be tested against realistic noise:

- ~500–1000 material records (not 10,000 — keep the demo dataset small enough to page through live)
- 4–5 fictional CPSE organizations
- 5 categories: BEARING, VALVE, CABLE, FASTENER, PUMP
- Deliberately include: abbreviation variants, reordered words, missing fields, mixed UOMs, near-duplicates that are NOT equivalent (different pressure class/grade — this must be present so the hard-exclusion demo works), and at least one clean multi-CPSE duplicate cluster of 3+ records for the "procurement opportunity" demo screen.
- Store as a `seed/` directory with a script (`seed/generate_seed_data.py`) that populates the database — must be re-runnable, not a one-off manual SQL dump.

---

## 10. Non-Functional Requirements

- **Explainability:** every `match_recommendations` row must serialize `reason_codes: string[]` and a human-readable `explanation: string`. No exceptions.
- **Auditability:** every state-changing action (approve/reject/edit/generate-code) writes to `audit_events`. Audit events are append-only at the application layer (no UPDATE/DELETE routes exposed for that table).
- **Idempotency:** re-running ingestion on the same file must not create duplicate `raw_material_records`.
- **Performance target (MVP, not national scale):** matching pipeline should process the ~500–1000 record seed set in under 2 minutes end-to-end on a normal dev machine.
- **Config, not hardcoding:** thresholds, weights, and category schemas live in database tables or a config file, not hardcoded in matching logic, so they're demonstrably tunable.

---

## 11. Build Plan for the Coding Agent

Execute in this order. After each phase, run the verification checklist before moving on.

1. **Scaffold:** single Next.js (App Router, TypeScript) app. Directory structure: `/app` (routes/pages/API handlers), `/lib/ingestion`, `/lib/matching`, `/lib/governance`, `/lib/db` (Drizzle schema + client), `/components`, `/seed`, `/docs`. `.env.local` for the Neon connection string and any API keys. `npm run dev`, `npm run test`, `npm run lint`, `npm run typecheck` targets.
2. **Design exploration (before coding screens):** use the Stitch MCP server to explore layout/visual direction for the core screens (upload, record grid, match-review, mapping lookup, dashboard) against the Section 8 requirements. Treat outputs as drafts to reimplement in real Tailwind/React with the fixed token system from 8.1 — do not ship Stitch output as-is.
3. **Data model:** implement all tables from Section 5 as Drizzle schema, connected to Neon. Run `drizzle-kit` migrations, confirm schema in the Neon console.
4. **Seed data:** write and run `seed/generate-seed-data.ts` (a Node/TS script, run via `tsx` or similar). Confirm record counts match Section 9.
5. **Ingestion + normalization:** build the upload route/server action, column mapper UI, abbreviation/UOM normalization (`papaparse`/`xlsx` for parsing). Verify against seed data — spot-check that known abbreviations expand correctly.
6. **Attribute extraction:** implement category classifier + per-category regex/dictionary extractors for BEARING and VALVE fully, partial for the other three. Write unit tests asserting extraction on 10+ hand-checked example strings per category.
7. **Matching engine:** implement Stages A–E, hard exclusion rules, classification thresholds. Write unit tests that assert: (a) a known duplicate pair scores IDENTICAL/DUPLICATE, (b) a known false-friend pair (same text similarity, different pressure class) is correctly vetoed to RELATED_BUT_NOT_EQUIVALENT — this test is mandatory and must be named explicitly (e.g. `hard-exclusion-blocks-pressure-class-mismatch.test.ts`) since it's the platform's core credibility claim.
8. **Governance workflow:** approval routes/server actions, audit event writes, role guards.
9. **Canonicalization:** CNMC generator, mapping table.
10. **Frontend:** build per Section 8, screen by screen — ingestion/upload, record grid, match-review queue, mapping lookup, dashboard. Apply the color tokens (8.1) and micro-interactions (8.2) as each screen is built, not as a separate polish pass. Wire to real data, no mocked frontend state once the routes exist.
11. **Mock SAP adapter + export:** implement, document.
12. **End-to-end verification pass:** see Section 12.

---

## 12. Self-Verification Checklist (agent must run and report results, not just claim completion)

Before declaring the build complete, the agent must:

- [ ] `npm run dev` starts the app cleanly with no errors, connected to Neon
- [ ] `npm run test` and `npm run typecheck` pass, including the mandatory hard-exclusion test from Step 7
- [ ] Seed script runs cleanly and produces the documented record counts
- [ ] Upload a CSV through the actual UI (not just the API) and confirm records appear in the grid
- [ ] Run the matching pipeline against seed data and confirm at least one of each match type (IDENTICAL, NEAR_DUPLICATE, FUNCTIONALLY_EQUIVALENT, RELATED_BUT_NOT_EQUIVALENT, INSUFFICIENT_DATA) appears in results — if any category is empty, the seed data or scoring logic has a bug, fix before proceeding
- [ ] Approve one recommendation through the UI and confirm: (a) a canonical material is created, (b) the mapping table shows the legacy code linked, (c) an audit event was written
- [ ] Reject one recommendation and confirm no canonical material was created and the reasoning is logged
- [ ] View the audit log screen and confirm both the approval and rejection appear with correct actor/timestamp/reason
- [ ] Load the dashboard and confirm the summary metrics reflect the actual seeded/processed data, not placeholder zeros
- [ ] Hit the mock SAP export endpoint and confirm it returns a well-formed payload for an approved canonical material
- [ ] Visually review every screen against Section 8's banned-patterns list — flag and fix any screen that still reads as default/unstyled
- [ ] Confirm the color palette matches 8.1 exactly (deep blue/teal/white-grey/amber, amber used only for attention/AI-suggestion states) and that no arbitrary hex values were used outside the token file
- [ ] Confirm micro-interactions from 8.2 are present on the match-review screen, status transitions, table interactions, and the ingestion progress flow — and that the audit log/dense tables were *not* over-animated
- [ ] Confirm no screen shows lorem ipsum, "Coming Soon," or disconnected mock data

Report results of this checklist explicitly, item by item, in `/docs/verification-report.md` — do not simply state "everything works."

---

## 13. Deliverables Summary

```
/app            Next.js App Router — pages + API routes/server actions
/lib
  /db             Drizzle schema + Neon client
  /ingestion       CSV/Excel parsing, normalization, abbreviation/UOM logic
  /matching        hybrid scoring engine, hard exclusion rules, classification
  /governance      approval workflow, audit trail
/components     shared React components, Tailwind theme tokens, Framer Motion configs
/seed           generate-seed-data.ts + generated fixtures
/docs
  decisions.md          any deviation from this PRD, with reasoning
  scale-roadmap.md       Docker/Kafka/Spark/Neo4j/federated-learning/live-SAP future path
  verification-report.md the completed Section 12 checklist with evidence
.env.local.example   Neon connection string + optional embedding/LLM API key placeholders
package.json
README.md        setup + run instructions (npm install, npm run dev)
```
