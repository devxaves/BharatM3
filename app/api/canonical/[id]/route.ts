import { ApiError, route } from '@/lib/api';
import { getDb } from '@/lib/db/client';
import { requirePermission } from '@/lib/governance/session';
import { toIdoc, toOData } from '@/lib/integration/sap';
import { getCanonical } from '@/lib/queries/canonical';

export const dynamic = 'force-dynamic';

export const GET = route<{ params: { id: string } }>(async (_req, { params }) => {
  await requirePermission('mappings:read');
  const c = await getCanonical(await getDb(), decodeURIComponent(params.id));
  if (!c) throw new ApiError(404, 'Canonical material not found');
  const exportable = { ...c, mappings: c.mappings.map((m) => ({ org: m.org, legacyCode: m.legacyCode, status: m.status })) };
  return { ...c, sapPreview: { idoc: toIdoc(exportable), odata: toOData(exportable) } };
});
