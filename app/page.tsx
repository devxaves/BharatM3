'use client';

import { useQuery } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
import {
  ArrowRight,
  Ban,
  CheckCircle2,
  Database,
  FileSpreadsheet,
  GitMerge,
  Layers,
  Percent,
  PlugZap,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserCheck,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { CountUp } from '@/components/ui/count-up';
import { api } from '@/lib/client/api';
import { OrgChip } from '@/components/ui/status';
import { cx, fmtInr } from '@/lib/format';
import { fadeUp, transition } from '@/lib/motion';

interface DashSummary {
  totals: {
    records: number;
    orgs: number;
    canonical: number;
    duplicates: number;
    functional: number;
    codeReduction: number;
    vetoes: number;
  };
  opportunities: {
    totalSaving: number;
    count: number;
  };
}

const PIPELINE_STEPS = [
  {
    step: '01',
    title: 'Ingest',
    subtitle: 'Preserve source ERP data',
    description: 'Idempotent load of SAP ECC, S/4HANA, and Oracle extracts. No renumbering required.',
    icon: <FileSpreadsheet size={16} className="text-primary-800" />,
  },
  {
    step: '02',
    title: 'Normalize',
    subtitle: 'Dictionary & UOM standardisation',
    description: 'Versioned domain abbreviations expand automatically. Ambiguous units canonicalize to standard ISO.',
    icon: <RotateCcw size={16} className="text-primary-800" />,
  },
  {
    step: '03',
    title: 'Classify',
    subtitle: 'Attribute extraction & embedding',
    description: 'Category schema extractors parse governed engineering attributes with semantic indexing.',
    icon: <Layers size={16} className="text-primary-800" />,
  },
  {
    step: '04',
    title: 'Match & Veto',
    subtitle: 'Hybrid scoring with safety rules',
    description: 'Deterministic + semantic + attribute fusion. Hard exclusion rules veto dangerous false friends.',
    icon: <ShieldAlert size={16} className="text-amber-600" />,
  },
  {
    step: '05',
    title: 'Harmonize',
    subtitle: 'CNMC generation & ERP sync',
    description: 'Stewards approve Common National Material Codes. Mappings sync back via standard IDoc & OData.',
    icon: <ShieldCheck size={16} className="text-high-600" />,
  },
];

const CAPABILITIES = [
  {
    title: 'Explainable AI Matching',
    description: 'Attribute-by-attribute comparisons show exactly why candidates match, eliminating black-box uncertainty.',
    icon: <Sparkles size={16} className="text-primary-800" />,
  },
  {
    title: 'Hard Safety Veto Rules',
    description: 'Deterministic exclusion rules block pressure class, voltage, and alloy mismatches regardless of text similarity.',
    icon: <Ban size={16} className="text-veto-600" />,
  },
  {
    title: 'Human-in-the-Loop Governance',
    description: 'Domain experts approve, edit, or reject all canonical mappings with an immutable SHA-256 audit trail.',
    icon: <UserCheck size={16} className="text-primary-600" />,
  },
  {
    title: 'Zero ERP Disruption',
    description: 'Legacy material codes remain active in local systems; national codes flow into MARA-NORMT / BISMT fields.',
    icon: <PlugZap size={16} className="text-primary-800" />,
  },
];

export default function LandingPage() {
  const shouldReduceMotion = useReducedMotion();
  const { data } = useQuery({
    queryKey: ['landing-stats'],
    queryFn: () => api<DashSummary>('/api/dashboard'),
  });

  const [activePipelineStep, setActivePipelineStep] = useState(0);

  const t = data?.totals ?? {
    records: 480,
    orgs: 5,
    canonical: 168,
    duplicates: 132,
    functional: 44,
    codeReduction: 0.42,
    vetoes: 18,
  };

  const oppSaving = data?.opportunities?.totalSaving ?? 38400000;

  return (
    <div className="flex min-h-screen flex-col bg-grey-50 text-grey-900">
      {/* Public Landing Topbar */}
      <header className="sticky top-0 z-40 border-b border-grey-200 bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <img src="/unimat-logo.png" alt="" width={30} height={30} className="h-[30px] w-[30px] object-contain" aria-hidden />
            <div className="leading-tight">
              <div className="text-[16px] font-bold tracking-tight text-grey-900">UniMat</div>
              <div className="hidden text-micro font-medium uppercase tracking-[0.08em] text-grey-500 sm:block">National Material Master</div>
            </div>
          </Link>

          <nav className="flex items-center gap-8">
            <div className="hidden md:flex items-center gap-7 text-dense font-medium text-grey-600">
              <a href="#problem" className="hover:text-primary-900 transition-colors">The Problem</a>
              <a href="#pipeline" className="hover:text-primary-900 transition-colors">How It Works</a>
              <a href="#capabilities" className="hover:text-primary-900 transition-colors">Capabilities</a>
              <a href="#proof" className="hover:text-primary-900 transition-colors">Live Data</a>
              <Link href="/integration" className="flex items-center gap-1.5 hover:text-primary-900 transition-colors">
                API Docs
                <span className="rounded-sm border border-grey-200 bg-grey-50 px-1 font-mono text-[10px] text-grey-600">v1</span>
              </Link>
            </div>

            <Link
              href="/dashboard"
              className="btn-primary h-9 py-0"
            >
              Enter Platform <ArrowRight size={14} />
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-grey-200 bg-white pt-14 pb-16 lg:pt-20 lg:pb-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12">
            {/* Left Copy */}
            <motion.div
              initial={shouldReduceMotion ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: [0.2, 0, 0, 1] }}
              className="lg:col-span-7"
            >
              <div className="section-tag mb-5">National Material Master</div>

              <h1 className="font-display text-4xl font-bold text-grey-900 sm:text-5xl lg:text-jumbo">
                One Nation, One Material Code for Indian CPSEs
              </h1>

              <p className="mt-6 max-w-xl text-card font-semibold text-primary-800">
                AI recommends. Domain experts approve. Every legacy code remains traceable.
              </p>

              <p className="mt-3 max-w-xl text-lead leading-relaxed text-grey-500">
                UniMat eliminates duplicate material codes across public sector enterprises through explainable matching, safety-critical exclusion vetoes, and zero-disruption ERP synchronization.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  href="/dashboard"
                  className="btn-primary"
                >
                  View Live Dashboard <ArrowRight size={14} />
                </Link>
                <Link
                  href="/review"
                  className="btn-secondary"
                >
                  Explore Review Queue
                </Link>
              </div>

              {/* CPSE Logos strip under hero copy */}
              <div className="mt-10 border-t border-grey-150 pt-5">
                <span className="label-caps">
                  Participating Enterprises
                </span>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <OrgChip code="CPCL" />
                  <OrgChip code="IOCL" />
                  <OrgChip code="NTPC" />
                  <OrgChip code="SAIL" />
                  <OrgChip code="CIL" />
                  <OrgChip code="BHEL" />
                </div>
              </div>
            </motion.div>

            {/* Right: Purposeful Interactive Matching Pipeline Visual */}
            <motion.div
              initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.35, delay: 0.1, ease: [0.2, 0, 0, 1] }}
              className="lg:col-span-5"
            >
              <div className="rounded-xl border border-grey-200 bg-grey-50 p-5">
                <div className="flex items-center justify-between border-b border-grey-200 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    <span className="label-caps">
                      Harmonisation In Action
                    </span>
                  </div>
                  <span className="font-mono text-micro text-grey-500">6205 Ball Bearing</span>
                </div>

                <div className="mt-3 space-y-2">
                  <div className="rounded-md border border-grey-200 bg-white p-3 text-caption">
                    <div className="flex items-center justify-between">
                      <OrgChip code="CPCL" />
                      <span className="font-mono text-micro text-primary-800 font-medium">10004127</span>
                    </div>
                    <div className="mt-1 font-mono text-dense text-grey-800">BRG DEEP GROOVE BALL 6205 C3 SKF</div>
                  </div>

                  <div className="flex items-center justify-center text-grey-400">
                    <div className="flex items-center gap-1.5 rounded-sm border border-teal-200 bg-teal-50 px-2 py-0.5 text-micro font-semibold text-teal-700">
                      <Sparkles size={11} /> AI Match Confidence: 0.985 (Identical)
                    </div>
                  </div>

                  <div className="rounded-md border border-grey-200 bg-white p-3 text-caption">
                    <div className="flex items-center justify-between">
                      <OrgChip code="NTPC" />
                      <span className="font-mono text-micro text-primary-800 font-medium">ME-04-9912</span>
                    </div>
                    <div className="mt-1 font-mono text-dense text-grey-800">BEARING DGBB 6205-C3 25X52X15 FAG</div>
                  </div>

                  {/* Harmonized result */}
                  <div className="mt-3 rounded-md border border-primary-200 bg-primary-50 p-3">
                    <div className="flex items-center justify-between text-micro font-semibold uppercase tracking-[0.08em] text-primary-800">
                      <span className="flex items-center gap-1">
                        <CheckCircle2 size={13} className="text-primary-800" />
                        Harmonised National Code
                      </span>
                      <span className="font-mono">CNMC v1</span>
                    </div>
                    <div className="mt-1 font-mono text-dense font-bold text-primary-900">
                      IN-MAT-BRG-DGBB-6205-C3
                    </div>
                    <div className="mt-0.5 text-caption text-primary-700">
                      Single Rate Contract · 2 CPSEs Linked · Zero Legacy Renumbering
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Section 2: The Problem, Briefly (Stat-style callouts) */}
      <section id="problem" className="border-b border-grey-200 bg-grey-50 py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="max-w-2xl">
            <div className="section-tag mb-3">The Problem</div>
            <h2 className="font-display text-3xl font-bold text-grey-900 sm:text-section">
              The CPSE Material Master Dilemma
            </h2>
            <p className="mt-3 text-lead text-grey-500">
              Decades of disconnected SAP, Oracle, and legacy ERP deployments created duplicate catalogs across public enterprises.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
            <motion.div
              whileInView={{ opacity: 1, y: 0 }}
              initial={{ opacity: 0, y: 12 }}
              viewport={{ once: true }}
              transition={{ duration: 0.25 }}
              className="card border-t-2 border-t-amber-500 p-6"
            >
              <div className="font-display text-kpi font-bold text-amber-700">5+ Codes</div>
              <h3 className="mt-3 text-card font-semibold text-grey-900">Per Identical Material</h3>
              <p className="mt-2 text-body leading-relaxed text-grey-500">
                The same industrial valve or bearing holds separate item codes across CPCL, NTPC, SAIL, and IOCL with no cross-referencing.
              </p>
            </motion.div>

            <motion.div
              whileInView={{ opacity: 1, y: 0 }}
              initial={{ opacity: 0, y: 12 }}
              viewport={{ once: true }}
              transition={{ duration: 0.25, delay: 0.05 }}
              className="card border-t-2 border-t-primary-800 p-6"
            >
              <div className="font-display text-kpi font-bold text-primary-800">Zero Visibility</div>
              <h3 className="mt-3 text-card font-semibold text-grey-900">Fragmented Demand</h3>
              <p className="mt-2 text-body leading-relaxed text-grey-500">
                Enterprises buy identical physical spares on isolated purchase orders instead of pooling volume into GeM rate contracts.
              </p>
            </motion.div>

            <motion.div
              whileInView={{ opacity: 1, y: 0 }}
              initial={{ opacity: 0, y: 12 }}
              viewport={{ once: true }}
              transition={{ duration: 0.25, delay: 0.1 }}
              className="card border-t-2 border-t-veto-600 p-6"
            >
              <div className="font-display text-kpi font-bold text-veto-700">Safety Risk</div>
              <h3 className="mt-3 text-card font-semibold text-grey-900">Blind Semantic Merging</h3>
              <p className="mt-2 text-body leading-relaxed text-grey-500">
                Generic AI tools merge Class 150 and Class 300 valves due to high text similarity, creating critical industrial safety hazards.
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Section 3: How It Works (Progressive Step Sequence) */}
      <section id="pipeline" className="border-b border-grey-200 bg-white py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <div className="section-tag mb-3">Platform Architecture</div>
              <h2 className="font-display text-3xl font-bold text-grey-900 sm:text-section">
                The 5-Stage Harmonisation Pipeline
              </h2>
              <p className="mt-3 text-lead text-grey-500">
                From unstandardised ERP extracts to verified national rate contract codes.
              </p>
            </div>
            <Link
              href="/ingest"
              className="inline-flex items-center gap-1 text-caption font-medium text-primary-800 hover:underline"
            >
              Test with sample extract →
            </Link>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {PIPELINE_STEPS.map((step, idx) => (
              <motion.div
                key={step.step}
                whileInView={{ opacity: 1, y: 0 }}
                initial={{ opacity: 0, y: 14 }}
                viewport={{ once: true }}
                transition={{ duration: 0.25, delay: idx * 0.05 }}
                onClick={() => setActivePipelineStep(idx)}
                className={cx(
                  'cursor-pointer rounded-xl border p-5 transition-colors duration-150',
                  activePipelineStep === idx
                    ? 'border-primary-800 bg-primary-50 ring-1 ring-primary-800'
                    : 'border-grey-200 bg-white hover:border-grey-300',
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-caption font-semibold text-amber-600">{step.step}</span>
                  {step.icon}
                </div>
                <h3 className="mt-3 text-card font-semibold text-grey-900">{step.title}</h3>
                <div className="mt-1 text-caption font-medium text-grey-600">{step.subtitle}</div>
                <p className="mt-2 text-caption leading-relaxed text-grey-500">{step.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Section 4: Key Capabilities */}
      <section id="capabilities" className="border-b border-grey-200 bg-grey-100 py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="max-w-2xl">
            <div className="section-tag mb-3">System Modules</div>
            <h2 className="font-display text-3xl font-bold text-grey-900 sm:text-section">
              Enterprise Governance & Trust Guarantees
            </h2>
            <p className="mt-3 text-lead text-grey-500">
              Built specifically for industrial engineering and public sector compliance.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {CAPABILITIES.map((cap, idx) => (
              <motion.div
                key={cap.title}
                whileInView={{ opacity: 1, y: 0 }}
                initial={{ opacity: 0, y: 12 }}
                viewport={{ once: true }}
                transition={{ duration: 0.25, delay: idx * 0.05 }}
                className="card p-6"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-md border border-primary-200 bg-primary-50">
                  {cap.icon}
                </div>
                <h3 className="mt-4 text-card font-semibold text-grey-900">{cap.title}</h3>
                <p className="mt-2 text-body leading-relaxed text-grey-500">{cap.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Section 5: Live-Feeling Proof (Pulled from seeded/live data) */}
      <section id="proof" className="border-b border-grey-200 bg-white py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <div className="section-tag">Live Status · National Overview</div>
              <h2 className="mt-3 font-display text-3xl font-bold text-grey-900 sm:text-section">
                Demonstrated Impact Across Seeded Catalogs
              </h2>
            </div>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1 text-caption font-semibold text-primary-800 hover:underline"
            >
              View detailed analytics →
            </Link>
          </div>

          <div className="mt-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <motion.div
              whileInView={{ opacity: 1, scale: 1 }}
              initial={{ opacity: 0, scale: 0.96 }}
              viewport={{ once: true }}
              transition={{ duration: 0.25 }}
              className="card border-t-2 border-t-primary-800 p-6"
            >
              <div className="label-caps">Materials Harmonised</div>
              <div className="mt-1 font-display text-4xl font-bold text-primary-800 tabular">
                <CountUp value={t.records} />
              </div>
              <div className="mt-1.5 text-caption text-grey-500">Across {t.orgs} public sector enterprises</div>
            </motion.div>

            <motion.div
              whileInView={{ opacity: 1, scale: 1 }}
              initial={{ opacity: 0, scale: 0.96 }}
              viewport={{ once: true }}
              transition={{ duration: 0.25, delay: 0.05 }}
              className="card border-t-2 border-t-amber-500 p-6"
            >
              <div className="label-caps">Duplicate Codes Found</div>
              <div className="mt-1 font-display text-4xl font-bold text-amber-700 tabular">
                <CountUp value={t.duplicates + t.functional} />
              </div>
              <div className="mt-1.5 text-caption text-grey-500">{t.duplicates} exact + {t.functional} functional</div>
            </motion.div>

            <motion.div
              whileInView={{ opacity: 1, scale: 1 }}
              initial={{ opacity: 0, scale: 0.96 }}
              viewport={{ once: true }}
              transition={{ duration: 0.25, delay: 0.1 }}
              className="card border-t-2 border-t-high-600 p-6"
            >
              <div className="label-caps">Common National Codes</div>
              <div className="mt-1 font-display text-4xl font-bold text-high-700 tabular">
                <CountUp value={t.canonical} />
              </div>
              <div className="mt-1.5 text-caption text-grey-500">{(t.codeReduction * 100).toFixed(0)}% catalog compression</div>
            </motion.div>

            <motion.div
              whileInView={{ opacity: 1, scale: 1 }}
              initial={{ opacity: 0, scale: 0.96 }}
              viewport={{ once: true }}
              transition={{ duration: 0.25, delay: 0.15 }}
              className="card border-t-2 border-t-teal-600 p-6"
            >
              <div className="label-caps">Indicative Savings Potential</div>
              <div className="mt-1 font-display text-4xl font-bold text-teal-700 tabular">
                <CountUp value={oppSaving} format={(n) => fmtInr(n)} />
              </div>
              <div className="mt-1.5 text-caption text-grey-500">Via cross-CPSE demand pooling</div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* CTA Strip */}
      <section className="bg-primary-900 py-16 text-white">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 text-center">
          <h2 className="font-display text-3xl font-bold text-white sm:text-section">
            Ready to Explore National Material Harmonisation?
          </h2>
          <p className="mt-3 text-lead text-primary-200 max-w-xl mx-auto">
            Experience the complete end-to-end matching pipeline, review queue, and SAP integration with real seeded CPSE datasets.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href="/dashboard"
              className="btn-accent"
            >
              Launch Platform Dashboard <ArrowRight size={14} />
            </Link>
            <Link
              href="/review"
              className="btn border border-white/25 text-white hover:bg-white/10"
            >
              Open Steward Queue
            </Link>
          </div>
        </div>
      </section>

      {/* Minimal Public Footer */}
      <footer className="mt-auto border-t border-primary-950 bg-primary-950 py-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 sm:flex-row sm:px-6 text-caption text-primary-300">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-white">UniMat</span> · Participating CPSEs
          </div>
          <div>
            Synthetic demonstration data for national material master harmonization.
          </div>
        </div>
      </footer>
    </div>
  );
}
