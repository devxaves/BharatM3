import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import type { IngestRow } from './pipeline';

/** Target schema a CPSE extract is mapped onto (column-mapping UI). */
export const TARGET_FIELDS = [
  { key: 'legacyCode', label: 'Legacy material code', required: true, hint: 'MATNR / item code' },
  { key: 'description', label: 'Short description', required: true, hint: 'MAKTX (≤40 chars in SAP)' },
  { key: 'longText', label: 'Long text / specification', required: false, hint: 'Basic data text' },
  { key: 'uom', label: 'Base unit of measure', required: false, hint: 'MEINS' },
  { key: 'manufacturer', label: 'Manufacturer', required: false, hint: 'MFRNR / make' },
  { key: 'partNumber', label: 'Manufacturer part no.', required: false, hint: 'MFRPN' },
  { key: 'materialGroup', label: 'Material group', required: false, hint: 'MATKL' },
  { key: 'unitPriceInr', label: 'Last PO price (INR)', required: false, hint: 'procurement history' },
  { key: 'annualQty', label: 'Annual consumption qty', required: false, hint: 'procurement history' },
] as const;
export type TargetKey = (typeof TARGET_FIELDS)[number]['key'];

const HEURISTICS: [TargetKey, RegExp][] = [
  ['partNumber', /(mfr|manufacturer|oem).*(part|p\/?n|no)|mpn|mfrpn|part\s*no/i],
  ['manufacturer', /^(mfr|make|manufacturer|mfr\s*name|oem|brand)/i],
  ['legacyCode', /(material|item|matl|mat)[\s._-]*(no|number|code|id)|^matnr$|legacy|^code$|item\s*code/i],
  ['longText', /long|spec|basic\s*data|po\s*text|remarks/i],
  ['description', /desc|maktx|short\s*text|item\s*name|material\s*name/i],
  ['uom', /uom|unit|meins|base\s*u/i],
  ['materialGroup', /group|matkl|class/i],
  ['unitPriceInr', /price|rate|cost|value/i],
  ['annualQty', /qty|quantity|consumption|annual/i],
];

export function suggestMapping(headers: string[]): Record<string, TargetKey | ''> {
  const used = new Set<TargetKey>();
  const out: Record<string, TargetKey | ''> = {};
  for (const h of headers) out[h] = '';
  for (const [key, re] of HEURISTICS) {
    const h = headers.find((x) => !out[x] && re.test(x));
    if (h && !used.has(key)) {
      out[h] = key;
      used.add(key);
    }
  }
  return out;
}

export function parseUpload(fileName: string, buf: Buffer): { headers: string[]; rows: Record<string, string>[] } {
  if (/\.(xlsx|xls)$/i.test(fileName)) {
    const wb = XLSX.read(buf, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '', raw: false });
    const headers = rows.length ? Object.keys(rows[0]) : [];
    return { headers, rows: rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v ?? '')]))) };
  }
  const text = buf.toString('utf8').replace(/^﻿/, '');
  const res = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: 'greedy', transformHeader: (h) => h.trim() });
  return { headers: res.meta.fields ?? [], rows: res.data };
}

export function applyMapping(rows: Record<string, string>[], mapping: Record<string, string>): IngestRow[] {
  const inv: Partial<Record<TargetKey, string>> = {};
  for (const [col, key] of Object.entries(mapping)) if (key) inv[key as TargetKey] = col;
  const num = (v: string | undefined) => {
    if (v === undefined || v === null || String(v).trim() === '') return null;
    const n = Number(String(v).replace(/[,₹\s]/g, ''));
    return Number.isFinite(n) ? n : null;
  };
  return rows.map((r) => ({
    legacyCode: (r[inv.legacyCode ?? ''] ?? '').trim(),
    description: (r[inv.description ?? ''] ?? '').trim(),
    longText: inv.longText ? r[inv.longText] : null,
    uom: inv.uom ? r[inv.uom] : null,
    manufacturer: inv.manufacturer ? r[inv.manufacturer] : null,
    partNumber: inv.partNumber ? r[inv.partNumber] : null,
    materialGroup: inv.materialGroup ? r[inv.materialGroup] : null,
    unitPriceInr: num(inv.unitPriceInr ? r[inv.unitPriceInr] : undefined),
    annualQty: num(inv.annualQty ? r[inv.annualQty] : undefined),
    payload: r,
  }));
}
