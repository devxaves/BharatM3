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
    icon: <FileSpreadsheet size={16} className="text-teal-600" />,
  },
  {
    step: '02',
    title: 'Normalize',
    subtitle: 'Dictionary & UOM standardisation',
    description: 'Versioned domain abbreviations expand automatically. Ambiguous units canonicalize to standard ISO.',
    icon: <RotateCcw size={16} className="text-teal-600" />,
  },
  {
    step: '03',
    title: 'Classify',
    subtitle: 'Attribute extraction & embedding',
    description: 'Category schema extractors parse governed engineering attributes with pgvector semantic indexing.',
    icon: <Layers size={16} className="text-teal-600" />,
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
    icon: <Sparkles size={16} className="text-teal-600" />,
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
    icon: <PlugZap size={16} className="text-teal-600" />,
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
    <div className="flex min-h-screen flex-col bg-grey-25 text-grey-900 selection:bg-teal-200 selection:text-grey-900">
      {/* Public Landing Topbar */}
      <header className="sticky top-0 z-40 border-b border-grey-200 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <svg width="26" height="26" viewBox="0 0 28 28" aria-hidden>
              <rect x="0.5" y="0.5" width="27" height="27" rx="5" fill="rgb(var(--c-primary-800))" stroke="rgb(var(--c-primary-600))" />
              <path d="M6 20V8.5l4.5 6 4.5-6V20" fill="none" stroke="rgb(var(--c-white))" strokeWidth="2" strokeLinejoin="round" />
              <path d="M18.5 8h3.2l-2 2.6c1.3.2 2.2 1.1 2.2 2.4 0 1.5-1.2 2.5-2.8 2.5-.8 0-1.5-.2-2-.6" fill="none" stroke="rgb(var(--c-teal-400))" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div className="leading-tight">
              <span className="font-display text-base font-bold tracking-tight text-primary-950">BharatM3</span>
              <span className="hidden ml-2 rounded-sm bg-primary-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-primary-900 sm:inline-block">
                National Material Master
              </span>
            </div>
          </Link>

          <nav className="flex items-center gap-6">
            <div className="hidden md:flex items-center gap-5 text-dense font-medium text-grey-600">
              <a href="#problem" className="hover:text-primary-900 transition-colors">The Problem</a>
              <a href="#pipeline" className="hover:text-primary-900 transition-colors">How It Works</a>
              <a href="#capabilities" className="hover:text-primary-900 transition-colors">Capabilities</a>
              <a href="#proof" className="hover:text-primary-900 transition-colors">Live Data</a>
            </div>

            <Link
              href="/dashboard"
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-primary-800 px-3.5 text-dense font-medium text-white shadow-sm hover:bg-primary-900 active:translate-y-px transition-all"
            >
              Enter Platform <ArrowRight size={13} />
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-grey-200 bg-white pt-10 pb-16 lg:pt-14 lg:pb-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12">
            {/* Left Copy */}
            <motion.div
              initial={shouldReduceMotion ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: [0.2, 0, 0, 1] }}
              className="lg:col-span-7"
            >
              <div className="inline-flex items-center gap-2 rounded-full border border-teal-600/30 bg-teal-50 px-3 py-1 text-caption font-semibold text-teal-800 mb-4">
                <span className="h-1.5 w-1.5 rounded-full bg-teal-600" />
                SIH PS 26099 · Ministry of Petroleum & Natural Gas
              </div>

              <h1 className="font-display text-4xl font-extrabold tracking-tight text-primary-950 sm:text-5xl lg:text-[54px] leading-[1.08]">
                One Nation, One Material Code for Indian CPSEs
              </h1>

              <p className="mt-4 max-w-xl text-lead font-semibold text-primary-900">
                AI recommends. Domain experts approve. Every legacy code remains traceable.
              </p>

              <p className="mt-2 max-w-xl text-body text-grey-600 leading-relaxed font-normal">
                BharatM3 eliminates duplicate material codes across public sector enterprises through explainable matching, safety-critical exclusion vetoes, and zero-disruption ERP synchronization.
              </p>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Link
                  href="/dashboard"
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary-800 px-5 text-dense font-semibold text-white shadow-sm hover:bg-primary-900 active:translate-y-px transition-all"
                >
                  View Live Dashboard <ArrowRight size={14} />
                </Link>
                <Link
                  href="/review"
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-grey-300 bg-white px-4 text-dense font-medium text-grey-800 hover:bg-grey-50 active:translate-y-px transition-all"
                >
                  Explore Review Queue
                </Link>
              </div>

              {/* CPSE Logos strip under hero copy */}
              <div className="mt-8 border-t border-grey-100 pt-4">
                <span className="text-micro font-semibold uppercase tracking-wider text-grey-600">
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
              <div className="rounded-lg border border-grey-200 bg-grey-50/60 p-4 shadow-panel">
                <div className="flex items-center justify-between border-b border-grey-200 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-teal-600 animate-pulse" />
                    <span className="font-mono text-micro font-semibold uppercase tracking-wider text-grey-600">
                      Harmonisation In Action
                    </span>
                  </div>
                  <span className="font-mono text-micro text-grey-500">6205 Ball Bearing</span>
                </div>

                <div className="mt-3 space-y-2">
                  <div className="rounded border border-grey-200 bg-white p-2.5 text-caption">
                    <div className="flex items-center justify-between">
                      <OrgChip code="CPCL" />
                      <span className="font-mono text-micro text-primary-800 font-medium">10004127</span>
                    </div>
                    <div className="mt-1 font-mono text-dense text-grey-800">BRG DEEP GROOVE BALL 6205 C3 SKF</div>
                  </div>

                  <div className="flex items-center justify-center text-grey-400">
                    <div className="flex items-center gap-1.5 rounded-full bg-teal-50 px-2 py-0.5 text-micro font-semibold text-teal-800 border border-teal-200">
                      <Sparkles size={11} /> AI Match Confidence: 0.985 (Identical)
                    </div>
                  </div>

                  <div className="rounded border border-grey-200 bg-white p-2.5 text-caption">
                    <div className="flex items-center justify-between">
                      <OrgChip code="NTPC" />
                      <span className="font-mono text-micro text-primary-800 font-medium">ME-04-9912</span>
                    </div>
                    <div className="mt-1 font-mono text-dense text-grey-800">BEARING DGBB 6205-C3 25X52X15 FAG</div>
                  </div>

                  {/* Harmonized result */}
                  <div className="mt-3 rounded-md border border-high-600/30 bg-high-50/70 p-3">
                    <div className="flex items-center justify-between text-micro font-semibold uppercase tracking-wider text-high-800">
                      <span className="flex items-center gap-1">
                        <CheckCircle2 size={13} className="text-high-600" />
                        Harmonised National Code
                      </span>
                      <span className="font-mono">CNMC v1</span>
                    </div>
                    <div className="mt-1 font-mono text-dense font-bold text-high-900">
                      IN-MAT-BRG-DGBB-6205-C3
                    </div>
                    <div className="mt-0.5 text-caption text-high-800">
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
      <section id="problem" className="border-b border-grey-200 bg-grey-50 py-12">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="max-w-2xl">
            <h2 className="font-display text-2xl font-extrabold tracking-tight text-primary-950 sm:text-3xl">
              The CPSE Material Master Dilemma
            </h2>
            <p className="mt-1 text-body text-grey-600">
              Decades of disconnected SAP, Oracle, and legacy ERP deployments created duplicate catalogs across public enterprises.
            </p>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            <motion.div
              whileInView={{ opacity: 1, y: 0 }}
              initial={{ opacity: 0, y: 12 }}
              viewport={{ once: true }}
              transition={{ duration: 0.25 }}
              className="rounded-lg border border-grey-200/90 border-t-2 border-t-amber-500 bg-white p-5 shadow-panel transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover"
            >
              <div className="font-display text-hero font-extrabold tracking-tight text-amber-800">5+ Codes</div>
              <h3 className="mt-1.5 text-lead font-bold text-grey-900">Per Identical Material</h3>
              <p className="mt-1 text-caption text-grey-600 leading-relaxed font-normal">
                The same industrial valve or bearing holds separate item codes across CPCL, NTPC, SAIL, and IOCL with no cross-referencing.
              </p>
            </motion.div>

            <motion.div
              whileInView={{ opacity: 1, y: 0 }}
              initial={{ opacity: 0, y: 12 }}
              viewport={{ once: true }}
              transition={{ duration: 0.25, delay: 0.05 }}
              className="rounded-lg border border-grey-200/90 border-t-2 border-t-teal-600 bg-white p-5 shadow-panel transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover"
            >
              <div className="font-display text-hero font-extrabold tracking-tight text-teal-800">Zero Visibility</div>
              <h3 className="mt-1.5 text-lead font-bold text-grey-900">Fragmented Demand</h3>
              <p className="mt-1 text-caption text-grey-600 leading-relaxed font-normal">
                Enterprises buy identical physical spares on isolated purchase orders instead of pooling volume into GeM rate contracts.
              </p>
            </motion.div>

            <motion.div
              whileInView={{ opacity: 1, y: 0 }}
              initial={{ opacity: 0, y: 12 }}
              viewport={{ once: true }}
              transition={{ duration: 0.25, delay: 0.1 }}
              className="rounded-lg border border-grey-200/90 border-t-2 border-t-veto-600 bg-white p-5 shadow-panel transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover"
            >
              <div className="font-display text-hero font-extrabold tracking-tight text-veto-700">Safety Risk</div>
              <h3 className="mt-1.5 text-lead font-bold text-grey-900">Blind Semantic Merging</h3>
              <p className="mt-1 text-caption text-grey-600 leading-relaxed font-normal">
                Generic AI tools merge Class 150 and Class 300 valves due to high text similarity, creating critical industrial safety hazards.
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Section 3: How It Works (Progressive Step Sequence) */}
      <section id="pipeline" className="border-b border-grey-200 bg-white py-14">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl font-bold tracking-tight text-primary-950 sm:text-3xl">
                The 5-Stage Harmonisation Pipeline
              </h2>
              <p className="mt-1 text-body text-grey-600">
                From unstandardised ERP extracts to verified national rate contract codes.
              </p>
            </div>
            <Link
              href="/ingest"
              className="inline-flex items-center gap-1 text-caption font-medium text-teal-700 hover:underline"
            >
              Test with sample extract →
            </Link>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {PIPELINE_STEPS.map((step, idx) => (
              <motion.div
                key={step.step}
                whileInView={{ opacity: 1, y: 0 }}
                initial={{ opacity: 0, y: 14 }}
                viewport={{ once: true }}
                transition={{ duration: 0.25, delay: idx * 0.05 }}
                onClick={() => setActivePipelineStep(idx)}
                className={cx(
                  'cursor-pointer rounded-lg border p-4 transition-all duration-150',
                  activePipelineStep === idx
                    ? 'border-primary-800 bg-primary-50/40 ring-2 ring-primary-800/10 shadow-panel'
                    : 'border-grey-200 bg-white hover:border-grey-300',
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-caption font-bold text-primary-800">{step.step}</span>
                  {step.icon}
                </div>
                <h3 className="mt-2 text-dense font-bold text-grey-900">{step.title}</h3>
                <div className="mt-0.5 text-micro font-medium text-grey-600">{step.subtitle}</div>
                <p className="mt-2 text-caption text-grey-500 leading-snug">{step.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Section 4: Key Capabilities */}
      <section id="capabilities" className="border-b border-grey-200 bg-grey-50 py-14">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="max-w-2xl">
            <h2 className="font-display text-2xl font-bold tracking-tight text-primary-950 sm:text-3xl">
              Enterprise Governance & Trust Guarantees
            </h2>
            <p className="mt-1 text-body text-grey-600">
              Built specifically for industrial engineering and public sector compliance.
            </p>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {CAPABILITIES.map((cap, idx) => (
              <motion.div
                key={cap.title}
                whileInView={{ opacity: 1, y: 0 }}
                initial={{ opacity: 0, y: 12 }}
                viewport={{ once: true }}
                transition={{ duration: 0.25, delay: idx * 0.05 }}
                className="rounded-lg border border-grey-200 bg-white p-5 shadow-panel"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded border border-grey-200 bg-grey-50">
                  {cap.icon}
                </div>
                <h3 className="mt-3 text-dense font-bold text-grey-900">{cap.title}</h3>
                <p className="mt-1.5 text-caption text-grey-600 leading-relaxed">{cap.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Section 5: Live-Feeling Proof (Pulled from seeded/live data) */}
      <section id="proof" className="border-b border-grey-200 bg-white py-14">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-1.5 text-caption font-semibold text-high-700">
                <span className="h-2 w-2 rounded-full bg-high-600" />
                Live Data Snapshot
              </div>
              <h2 className="mt-1 font-display text-2xl font-extrabold tracking-tight text-primary-950 sm:text-3xl">
                Demonstrated Impact Across Seeded Catalogs
              </h2>
            </div>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1 text-caption font-semibold text-teal-700 hover:underline"
            >
              View detailed analytics →
            </Link>
          </div>

          <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <motion.div
              whileInView={{ opacity: 1, scale: 1 }}
              initial={{ opacity: 0, scale: 0.96 }}
              viewport={{ once: true }}
              transition={{ duration: 0.25 }}
              className="rounded-lg border border-grey-200/90 border-t-2 border-t-primary-800 bg-white p-5 shadow-panel transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover"
            >
              <div className="eyebrow font-bold text-grey-600 tracking-wider">Materials Harmonised</div>
              <div className="mt-1 font-display text-display font-extrabold tracking-tight text-primary-900 tabular">
                <CountUp value={t.records} />
              </div>
              <div className="mt-1 text-caption text-grey-500 font-normal">Across {t.orgs} public sector enterprises</div>
            </motion.div>

            <motion.div
              whileInView={{ opacity: 1, scale: 1 }}
              initial={{ opacity: 0, scale: 0.96 }}
              viewport={{ once: true }}
              transition={{ duration: 0.25, delay: 0.05 }}
              className="rounded-lg border border-grey-200/90 border-t-2 border-t-amber-500 bg-white p-5 shadow-panel transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover"
            >
              <div className="eyebrow font-bold text-grey-600 tracking-wider">Duplicate Codes Found</div>
              <div className="mt-1 font-display text-display font-extrabold tracking-tight text-amber-800 tabular">
                <CountUp value={t.duplicates + t.functional} />
              </div>
              <div className="mt-1 text-caption text-grey-500 font-normal">{t.duplicates} exact + {t.functional} functional</div>
            </motion.div>

            <motion.div
              whileInView={{ opacity: 1, scale: 1 }}
              initial={{ opacity: 0, scale: 0.96 }}
              viewport={{ once: true }}
              transition={{ duration: 0.25, delay: 0.1 }}
              className="rounded-lg border border-grey-200/90 border-t-2 border-t-high-600 bg-white p-5 shadow-panel transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover"
            >
              <div className="eyebrow font-bold text-grey-600 tracking-wider">Common National Codes</div>
              <div className="mt-1 font-display text-display font-extrabold tracking-tight text-high-700 tabular">
                <CountUp value={t.canonical} />
              </div>
              <div className="mt-1 text-caption text-grey-500 font-normal">{(t.codeReduction * 100).toFixed(0)}% catalog compression</div>
            </motion.div>

            <motion.div
              whileInView={{ opacity: 1, scale: 1 }}
              initial={{ opacity: 0, scale: 0.96 }}
              viewport={{ once: true }}
              transition={{ duration: 0.25, delay: 0.15 }}
              className="rounded-lg border border-grey-200/90 border-t-2 border-t-teal-600 bg-white p-5 shadow-panel transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover"
            >
              <div className="eyebrow font-bold text-grey-600 tracking-wider">Indicative Savings Potential</div>
              <div className="mt-1 font-display text-display font-extrabold tracking-tight text-teal-800 tabular">
                <CountUp value={oppSaving} format={(n) => fmtInr(n)} />
              </div>
              <div className="mt-1 text-caption text-grey-500 font-normal">Via cross-CPSE demand pooling</div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* CTA Strip */}
      <section className="border-b border-grey-200 bg-primary-900 py-12 text-white">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 text-center">
          <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl text-white">
            Ready to Explore National Material Harmonisation?
          </h2>
          <p className="mt-2 text-lead text-primary-200 max-w-xl mx-auto">
            Experience the complete end-to-end matching pipeline, review queue, and SAP integration with real seeded CPSE datasets.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href="/dashboard"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-white px-5 text-dense font-semibold text-primary-900 shadow-sm hover:bg-grey-100 transition-colors"
            >
              Launch Platform Dashboard <ArrowRight size={14} />
            </Link>
            <Link
              href="/review"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-white/20 bg-primary-800 px-5 text-dense font-medium text-white hover:bg-primary-700 transition-colors"
            >
              Open Steward Queue
            </Link>
          </div>
        </div>
      </section>

      {/* Minimal Public Footer */}
      <footer className="mt-auto bg-white py-6 border-t border-grey-200">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 sm:flex-row sm:px-6 text-caption text-grey-500">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-grey-700">BharatM3</span> · SIH PS 26099 · MoPNG & Participating CPSEs
          </div>
          <div>
            Synthetic demonstration data for national material master harmonization.
          </div>
        </div>
      </footer>
    </div>
  );
}
