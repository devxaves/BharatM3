# UniMat — UI/UX Overhaul Decisions & Architecture

## Overview
This document records the architectural and UI/UX design decisions made during the comprehensive UI/UX overhaul pass for **UniMat**.

---

## 1. Design Token System & Anti-Slop Discipline
- **Palette**: Strictly adhered to the enterprise deep-blue + teal + clean grey/white neutrals + amber accent token system defined in `components/theme/tokens.css` and `tailwind.config.ts`.
  - **Primary (`primary-950` .. `primary-50`)**: Deep industrial navy (`#0B2545`, `#12345C`) for dominant structural elements, top navigation, headers, and primary buttons.
  - **Teal (`teal-800` .. `teal-50`)**: Secondary signals, AI-derived matching indicators, and interactive links (`#0E7C7B`, `#127475`).
  - **Neutrals (`grey-25` .. `grey-900`)**: Subtle border hierarchy, zebra striping, and card backdrops providing purposeful density and high scannability.
  - **Amber (`amber-800` .. `amber-50`)**: Reserved exclusively for AI suggestions awaiting human review, medium-confidence matches, and warning states.
  - **Semantic Confidence**: `high-600` (green) for high confidence / auto-queue, `amber-500` for needs review, `veto-600` for deterministic safety exclusions.
- **Banned Visual Defaults Eliminated**:
  - No purple-to-blue AI gradients or decorative hero blobs.
  - No unstyled shadcn defaults.
  - No generic centered-icon-plus-headline blocks.
  - No raw hex values in application components.

---

## 2. Summary-First, Detail-on-Demand Pattern

Every dense screen has been restructured to show clean, glanceable summary elements on the surface, with deep breakdowns accessible via animated Framer Motion dialogs:

1. **Analytics Dashboard (`/dashboard`)**:
   - Primary metric cards show **one number + one short label** only.
   - Clicking any metric card opens a dedicated `Dialog` with underlying CPSE breakdowns, formulas, category distributions, and governance explanations.
   - Secondary summary cards (Insufficient data, UOM issues, Steward decisions) open detailed modal views.
   - Category progress rows open full category detail dialogs.
2. **Review Queue (`/review`)**:
   - Queue rows show CPSE pair chips, concise descriptions, category, confidence meter, and match type.
   - **Critical Usability Preserved:** Direct 1-click `Approve` and `Reject` buttons remain actionable on the row without requiring an extra dialog step.
   - Clicking `Compare` or clicking a row opens the full-fidelity side-by-side comparison modal with attribute diffs, score fusion breakdown, AI reason codes, and keyboard navigation (`A`, `E`, `I`, `R`, `J`, `K`).
3. **Audit Trail (`/audit`)**:
   - Table rows show sequence number, timestamp, actor, action badge, and entity.
   - Clicking any row opens the full cryptographic audit event modal with before/after payload JSON, previous hash, event hash, and actor statement.
4. **National Codes & Legacy Mappings (`/mappings`)**:
   - National register table presents clean columns: CNMC, ERP short code, category, UNSPSC, CPSEs, and mapped code counts.
   - Row click opens the `CanonicalDetailModal` displaying the complete cross-CPSE mapping table, price dispersion spreads, and SAP sync previews.
5. **Material Records Grid (`/records`)**:
   - Kept dense as a high-throughput table.
   - Replaced heavy inline expanded sub-rows with the `RecordDetailDialog`, presenting extracted attributes, abbreviation expansions, classifier reasons, and PO history.
6. **Ingestion Flow (`/ingest` & `/upload`)**:
   - Multi-step animated progress flow preserved.
   - Data-quality check outputs glanceable summary cards on the page with a "View Full Quality Report" modal.
7. **Settings & Governance (`/governance`, `/dictionary`)**:
   - Dictionary terms and UOM master display concise tables with click-to-view and click-to-edit modal dialogs.

---

## 3. Public Landing Page at Root (`/`)
- Built as a dedicated public-facing page separate from the internal application shell:
  1. **Hero**: Product name (UniMat), tagline, description, primary CTA ("View Live Dashboard" → `/dashboard`), and an animated interactive 6205 bearing harmonisation visual fragment.
  2. **The Problem, Briefly**: 3 compact stat cards illustrating the 5+ codes dilemma, fragmented demand, and safety risks.
  3. **How It Works**: 5-stage progressive pipeline cards (Ingest → Normalize → Classify → Match & Veto → Harmonize).
  4. **Key Capabilities**: 4 enterprise capability cards (Explainable AI, Hard Safety Vetoes, Human-in-the-Loop, Zero ERP Disruption).
  5. **Live Data Proof**: Real animated count-up numbers fetched live from database `/api/dashboard`.
  6. **Attribution Footer**: UniMat · Participating CPSEs.

---

## 4. Route Coverage Summary
All routes specified in the PRD and UI/UX brief have been fully addressed:
- `/` — Brand-new public landing page.
- `/dashboard` — Summary-first analytics dashboard with modal breakdowns.
- `/ingest` (and `/upload` alias) — Ingestion flow with quality report modal.
- `/records` — Material master records grid with detail dialog.
- `/review` — Steward review workbench with direct actions + comparison modal.
- `/mappings` — National material register with mapping dialogs.
- `/opportunities` — Demand aggregation insights with price spread dialogs.
- `/audit` — Hash-chained audit trail with verification and event dialogs.
- `/governance` — Tuning workbench, category schemas, and substitution rules.
- `/dictionary` — Versioned abbreviation dictionary and UOM master.
- `/integration` — SAP / ERP REST endpoint testbench.
- `/canonical/[id]` — Dedicated canonical material view.

Zero routes were deferred. All functionality has been validated against the PRD Section 12 test suite.
