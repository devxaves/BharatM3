import { sql } from 'drizzle-orm';
import { rowsOf, type DB } from '@/lib/db/client';
import { opportunities } from './canonical';

async function q<T>(db: DB, query: ReturnType<typeof sql>) {
  return rowsOf<T>(await db.execute(query));
}

export async function dashboard(db: DB) {
  const [totals] = await q<Record<string, number>>(
    db,
    sql`SELECT
      (SELECT count(*) FROM raw_material_records)::int AS records,
      (SELECT count(DISTINCT org_id) FROM raw_material_records)::int AS orgs,
      (SELECT count(*) FROM canonical_materials WHERE status = 'APPROVED')::int AS canonical,
      (SELECT count(*) FROM material_mappings WHERE status = 'ACTIVE')::int AS mapped,
      (SELECT count(*) FROM match_recommendations WHERE match_type IN ('IDENTICAL','DUPLICATE','NEAR_DUPLICATE'))::int AS duplicates,
      (SELECT count(*) FROM match_recommendations WHERE match_type = 'FUNCTIONALLY_EQUIVALENT')::int AS functional,
      (SELECT count(*) FROM approval_tasks WHERE status IN ('OPEN','NEEDS_INFO'))::int AS pending,
      (SELECT count(*) FROM normalized_material_records WHERE jsonb_array_length(missing_required) > 0)::int AS insufficient,
      (SELECT count(*) FROM normalized_material_records WHERE category_code = 'UNCLASSIFIED')::int AS unclassified,
      (SELECT count(*) FROM normalized_material_records WHERE quality_flags::text ~ 'UOM_(NONSTANDARD|DIMENSION|AMBIGUOUS|UNRECOGNISED|MISSING)')::int AS uom_issues,
      (SELECT count(*) FROM match_recommendations WHERE vetoed)::int AS vetoes,
      (SELECT coalesce(sum(jsonb_array_length(expansions)),0) FROM normalized_material_records)::int AS abbreviations,
      (SELECT count(*) FROM match_recommendations WHERE status = 'APPROVED')::int AS approved,
      (SELECT count(*) FROM match_recommendations WHERE status = 'REJECTED')::int AS rejected,
      (SELECT count(*) FROM audit_events)::int AS audit_events,
      (SELECT round(avg(completeness)::numeric, 3) FROM normalized_material_records WHERE category_code <> 'UNCLASSIFIED')::float AS completeness`,
  );

  const categories = await q<{ category: string; records: number; mapped: number; canonical: number; pending: number; duplicates: number }>(
    db,
    sql`SELECT n.category_code AS category, count(*)::int AS records,
          count(m.id)::int AS mapped,
          (SELECT count(*) FROM canonical_materials c WHERE c.category_code = n.category_code AND c.status='APPROVED')::int AS canonical,
          (SELECT count(*) FROM match_recommendations r JOIN approval_tasks t ON t.recommendation_id = r.id WHERE r.category_code = n.category_code AND t.status IN ('OPEN','NEEDS_INFO'))::int AS pending,
          (SELECT count(*) FROM match_recommendations r WHERE r.category_code = n.category_code AND r.match_type IN ('IDENTICAL','DUPLICATE','NEAR_DUPLICATE'))::int AS duplicates
        FROM normalized_material_records n
        LEFT JOIN material_mappings m ON m.raw_record_id = n.raw_id AND m.status = 'ACTIVE'
        GROUP BY n.category_code ORDER BY records DESC`,
  );

  const matchTypes = await q<{ type: string; n: number }>(db, sql`SELECT match_type AS type, count(*)::int AS n FROM match_recommendations GROUP BY match_type`);

  const orgs = await q<{ code: string; name: string; sector: string; records: number; mapped: number; pending: number; completeness: number; uom_issues: number }>(
    db,
    sql`SELECT o.code, o.name, o.sector, count(r.id)::int AS records,
          count(m.id)::int AS mapped,
          (SELECT count(*) FROM match_recommendations x JOIN raw_material_records ra ON ra.id = x.record_a_id JOIN raw_material_records rb ON rb.id = x.record_b_id
             JOIN approval_tasks t ON t.recommendation_id = x.id WHERE t.status IN ('OPEN','NEEDS_INFO') AND (ra.org_id = o.id OR rb.org_id = o.id))::int AS pending,
          coalesce(round(avg(n.completeness)::numeric, 3), 0)::float AS completeness,
          count(*) FILTER (WHERE n.quality_flags::text ~ 'UOM_(NONSTANDARD|DIMENSION|AMBIGUOUS|UNRECOGNISED|MISSING)')::int AS uom_issues
        FROM organizations o
        LEFT JOIN raw_material_records r ON r.org_id = o.id
        LEFT JOIN normalized_material_records n ON n.raw_id = r.id
        LEFT JOIN material_mappings m ON m.raw_record_id = r.id AND m.status = 'ACTIVE'
        GROUP BY o.id ORDER BY records DESC`,
  );

  const timeline = await q<{ day: string; approved: number; rejected: number }>(
    db,
    sql`SELECT to_char(d, 'YYYY-MM-DD') AS day,
          (SELECT count(*) FROM match_recommendations WHERE status='APPROVED' AND decided_at::date = d::date)::int AS approved,
          (SELECT count(*) FROM match_recommendations WHERE status='REJECTED' AND decided_at::date = d::date)::int AS rejected
        FROM generate_series(current_date - interval '29 day', current_date, interval '1 day') d ORDER BY d`,
  );

  const flags = await q<{ flag: string; n: number }>(
    db,
    sql`SELECT split_part(f, ':', 1) AS flag, count(*)::int AS n FROM normalized_material_records, jsonb_array_elements_text(quality_flags) f GROUP BY 1 ORDER BY 2 DESC`,
  );

  const [funnel] = await q<Record<string, number>>(
    db,
    sql`SELECT
      (SELECT count(*) FROM raw_material_records)::int AS ingested,
      (SELECT count(*) FROM normalized_material_records)::int AS normalized,
      (SELECT count(*) FROM normalized_material_records WHERE category_code NOT IN ('UNCLASSIFIED','PENDING'))::int AS classified,
      (SELECT count(DISTINCT id) FROM (SELECT record_a_id AS id FROM match_recommendations WHERE match_type NOT IN ('NOT_MATCHED') UNION SELECT record_b_id FROM match_recommendations WHERE match_type NOT IN ('NOT_MATCHED')) x)::int AS matched,
      (SELECT count(*) FROM material_mappings WHERE status='ACTIVE')::int AS harmonised`,
  );

  const lastRun = (await q<Record<string, unknown>>(db, sql`SELECT r.*, mv.matcher_version, mv.embedding_model FROM matching_runs r JOIN model_versions mv ON mv.id = r.model_version_id ORDER BY r.started_at DESC LIMIT 1`))[0] ?? null;
  const opps = await opportunities(db);

  return {
    totals: {
      ...totals,
      codeReduction: totals.mapped ? 1 - totals.canonical / totals.mapped : 0,
    },
    categories,
    matchTypes,
    orgs,
    timeline,
    flags,
    funnel,
    lastRun,
    opportunities: { count: opps.length, top: opps.slice(0, 6), totalSpend: opps.reduce((s, o) => s + o.spend, 0), totalSaving: opps.reduce((s, o) => s + o.estSaving, 0) },
  };
}
