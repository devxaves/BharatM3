import { ApiError, route } from '@/lib/api';
import { parseUpload, suggestMapping, TARGET_FIELDS } from '@/lib/ingestion/columns';
import { requirePermission } from '@/lib/governance/session';

export const dynamic = 'force-dynamic';

/** Step 1 — parse an uploaded CSV / Excel extract and propose a column mapping. */
export const POST = route(async (req) => {
  await requirePermission('ingest:write');
  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) throw new ApiError(400, 'No file uploaded');
  if (file.size > 10 * 1024 * 1024) throw new ApiError(413, 'File exceeds 10 MB demo limit');
  if (!/\.(csv|xlsx|xls|txt)$/i.test(file.name)) throw new ApiError(415, 'Upload a .csv or .xlsx extract');
  const { headers, rows } = parseUpload(file.name, Buffer.from(await file.arrayBuffer()));
  if (!headers.length) throw new ApiError(422, 'Could not detect a header row');
  return { fileName: file.name, headers, rows, rowCount: rows.length, suggestion: suggestMapping(headers), targets: TARGET_FIELDS };
});
