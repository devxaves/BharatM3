import { UOM_SEED } from '@/lib/ingestion/uom';
import type { AttributeMap } from '@/lib/matching/types';

/**
 * Mock SAP / ERP export adapter (PRD §7.15).
 *
 * Produces payloads shaped like the two real integration paths:
 *   • ALE/IDoc  MATMAS05  (SAP ECC 6.0) — E1MARAM / E1MAKTM / E1MTXHM / E1CUCFG-style characteristics
 *   • OData     API_PRODUCT_SRV A_Product (S/4HANA) — Product, ProductDescription, ProductPlant…
 * The CPSE's own legacy code travels in MARA-BISMT ("old material number"), which is exactly the SAP field
 * intended for cross-reference to a previous numbering scheme — so no CPSE has to renumber anything.
 */

export interface CanonicalForExport {
  id: string;
  cnmc: string;
  shortCode: string;
  canonicalDescription: string;
  categoryCode: string;
  unspscCode: string | null;
  baseUom: string | null;
  attributes: AttributeMap;
  version: number;
  status: string;
  updatedAt: Date | string;
  mappings: { org: string; legacyCode: string; status: string }[];
}

const MTART: Record<string, string> = { BEARING: 'ERSA', VALVE: 'ERSA', CABLE: 'ROH', FASTENER: 'ERSA', PUMP: 'HAWA' };
const MATKL: Record<string, string> = { BEARING: 'NM-BRG', VALVE: 'NM-VLV', CABLE: 'NM-CBL', FASTENER: 'NM-FST', PUMP: 'NM-PMP' };
const isoUom = (code: string | null) => UOM_SEED.find((u) => u.code === code)?.isoCode ?? code ?? 'EA';
const sapUom = (code: string | null) => (code === 'M' ? 'M' : code === 'KM' ? 'KM' : code === 'KG' ? 'KG' : code === 'TO' ? 'TO' : 'EA');

function characteristics(attrs: AttributeMap) {
  return Object.entries(attrs)
    .filter(([k]) => k !== 'manufacturer')
    .map(([k, v]) => ({ ATNAM: `BM3_${k.toUpperCase()}`.slice(0, 30), ATWRT: String(v.value).slice(0, 30), ATFLV: typeof v.value === 'number' ? v.value : undefined }));
}

export function toIdoc(c: CanonicalForExport, receiver?: { org: string; client?: string }) {
  const legacy = receiver ? c.mappings.find((m) => m.org === receiver.org && m.status === 'ACTIVE')?.legacyCode : undefined;
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:T]/g, '').slice(0, 14);
  return {
    IDOC: {
      BEGIN: '1',
      EDI_DC40: {
        TABNAM: 'EDI_DC40',
        DOCNUM: `${stamp}${c.shortCode.slice(-6)}`,
        IDOCTYP: 'MATMAS05',
        MESTYP: 'MATMAS',
        SNDPOR: 'BHARATM3',
        SNDPRT: 'LS',
        SNDPRN: 'BM3_NMM',
        RCVPOR: receiver ? `SAP${receiver.org}` : 'SAPALL',
        RCVPRT: 'LS',
        RCVPRN: receiver ? `${receiver.org}CLNT${receiver.client ?? '100'}` : 'BROADCAST',
        CREDAT: stamp.slice(0, 8),
        CRETIM: stamp.slice(8, 14),
      },
      E1MARAM: {
        SEGMENT: '1',
        MSGFN: '005',
        MATNR: c.shortCode,
        MTART: MTART[c.categoryCode] ?? 'ERSA',
        MBRSH: 'M',
        MATKL: MATKL[c.categoryCode] ?? 'NM-GEN',
        BISMT: legacy ?? '',
        MEINS: sapUom(c.baseUom),
        NORMT: c.cnmc.slice(0, 18),
        LVORM: c.status === 'RETIRED' ? 'X' : '',
        ZZCNMC: c.cnmc,
        ZZBM3_UUID: c.id,
        ZZUNSPSC: c.unspscCode ?? '',
        ZZVERSION: c.version,
        E1MAKTM: [{ SEGMENT: '1', MSGFN: '005', SPRAS: 'E', SPRAS_ISO: 'EN', MAKTX: c.canonicalDescription.slice(0, 40) }],
        E1MTXHM: {
          SEGMENT: '1',
          MSGFN: '005',
          TDOBJECT: 'MATERIAL',
          TDID: 'GRUN',
          TDSPRAS: 'E',
          E1MTXLM: c.canonicalDescription.match(/.{1,132}/g)?.map((line) => ({ TDFORMAT: '*', TDLINE: line })) ?? [],
        },
        E1AUSPM: characteristics(c.attributes).map((ch) => ({ SEGMENT: '1', MSGFN: '005', CLASS: `BM3_${c.categoryCode}`, KLART: '001', ...ch })),
        ZE1BM3XREF: c.mappings.filter((m) => m.status === 'ACTIVE').map((m) => ({ CPSE: m.org, LEGACY_MATNR: m.legacyCode })),
      },
    },
  };
}

export function toOData(c: CanonicalForExport, receiver?: { org: string }) {
  const legacy = receiver ? c.mappings.find((m) => m.org === receiver.org && m.status === 'ACTIVE')?.legacyCode : undefined;
  return {
    d: {
      __metadata: { type: 'API_PRODUCT_SRV.A_ProductType', uri: `/sap/opu/odata/sap/API_PRODUCT_SRV/A_Product('${c.shortCode}')` },
      Product: c.shortCode,
      ProductType: MTART[c.categoryCode] ?? 'ERSA',
      IndustrySector: 'M',
      ProductGroup: MATKL[c.categoryCode] ?? 'NM-GEN',
      BaseUnit: sapUom(c.baseUom),
      BaseISOUnit: isoUom(c.baseUom),
      ProductOldID: legacy ?? '',
      IsMarkedForDeletion: c.status === 'RETIRED',
      YY1_CNMC_PRD: c.cnmc,
      YY1_BM3UUID_PRD: c.id,
      YY1_UNSPSC_PRD: c.unspscCode ?? '',
      LastChangeDateTime: `/Date(${new Date(c.updatedAt).getTime()})/`,
      to_Description: { results: [{ Product: c.shortCode, Language: 'EN', ProductDescription: c.canonicalDescription.slice(0, 40) }] },
      to_ProductBasicText: { results: [{ Product: c.shortCode, Language: 'EN', LongText: c.canonicalDescription }] },
      to_Characteristics: { results: characteristics(c.attributes).map((ch) => ({ Characteristic: ch.ATNAM, CharcValue: ch.ATWRT })) },
      to_LegacyCrossReference: { results: c.mappings.filter((m) => m.status === 'ACTIVE').map((m) => ({ CPSE: m.org, LegacyMaterial: m.legacyCode })) },
    },
  };
}
