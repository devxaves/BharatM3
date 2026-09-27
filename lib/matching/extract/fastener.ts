import { AttrBuilder, firstRule, parseInch } from './common';
import type { AttributeMap } from '../types';

/** ISO 261 coarse pitch by nominal diameter. */
export const METRIC_COARSE_PITCH: Record<number, number> = {
  3: 0.5, 4: 0.7, 5: 0.8, 6: 1.0, 8: 1.25, 10: 1.5, 12: 1.75, 14: 2.0, 16: 2.0, 18: 2.5, 20: 2.5, 22: 2.5, 24: 3.0, 27: 3.0, 30: 3.5, 36: 4.0,
};
/** ASME B1.1 UNC threads-per-inch; >1" studs default to 8UN per ASME B16.5 practice. */
const UNC_TPI: Record<string, number> = { '0.5': 13, '0.625': 11, '0.75': 10, '0.875': 9, '1': 8 };

const fmtInch = (v: number) => {
  const whole = Math.floor(v);
  const frac = v - whole;
  const map: Record<string, string> = { '0.5': '1/2', '0.625': '5/8', '0.75': '3/4', '0.875': '7/8', '0.25': '1/4', '0.375': '3/8', '0.125': '1/8' };
  const f = map[String(frac)] ?? '';
  return whole && f ? `${whole}-${f}` : whole ? `${whole}` : f;
};

export function extractFastener(text: string): AttributeMap {
  const b = new AttrBuilder();

  const type = firstRule(text, [
    [/STUD BOLT|\bSTUDS?\b/, 'STUD_BOLT'],
    [/SOCKET HEAD CAP SCREW|ALLEN (BOLT|SCREW)/, 'SOCKET_HEAD_CAP_SCREW'],
    [/\bBOLT\b/, 'HEX_BOLT'],
    [/\bNUT\b/, 'HEX_NUT'],
    [/\bWASHER\b/, 'WASHER'],
    [/\bSCREW\b/, 'SCREW'],
  ]);
  if (type) b.set('fastener_type', type.value, 0.95, 'dictionary', type.raw);

  // Metric: M16, M16X80, M16X1.5X80, M16 X 80 MM
  const metric = /(?<![A-Z0-9])M(\d{1,2})((?:\s*X\s*\d{1,3}(?:\.\d{1,2})?)*)/.exec(text);
  if (metric) {
    const dia = Number(metric[1]);
    const tail = metric[2]
      .split('X')
      .map((s) => s.trim())
      .filter(Boolean)
      .map(Number);
    let pitch: number | null = null;
    let length: number | null = null;
    for (const n of tail) {
      if (n <= 4 && pitch === null) pitch = n;
      else if (n >= 5 && length === null) length = n;
    }
    const explicitPitch = pitch !== null;
    pitch = pitch ?? METRIC_COARSE_PITCH[dia] ?? null;
    b.set('thread_size', `M${dia}`, 0.97, 'regex', metric[0]);
    if (pitch !== null) b.set('thread', `M${dia}X${Number.isInteger(pitch) ? pitch.toFixed(1) : String(pitch)}`, explicitPitch ? 0.97 : 0.88, explicitPitch ? 'regex' : 'lookup', metric[0]);
    if (length !== null) b.set('length_mm', length, 0.93, 'regex', metric[0]);
  } else {
    // Unified inch: 5/8"UNC, 5/8-11 UNC, 1" 8UN, 3/4" X 150 (series defaulted)
    const unified = /(?<![0-9./])(\d-\d\/\d|\d\/\d|\d(?:\.\d+)?)\s*(?:"|\s*INCH(?:ES)?)?\s*(?:-\s*(\d{1,2})\s*)?(UNC|UNF|8\s?UN|BSW)(?=X|\b)/.exec(text);
    const bareInch = /(?<![0-9./])(\d-\d\/\d|\d\/\d|1)\s*"\s*(?:DIA(?:METER)?)?\s*X\s*(\d{2,3})/.exec(text);
    const m = unified ?? bareInch;
    if (m) {
      const dia = parseInch(m[1]);
      if (dia !== null) {
        const series = unified ? unified[3].replace(/\s/g, '') : dia > 1 ? '8UN' : 'UNC';
        const tpi = unified?.[2] ? Number(unified[2]) : series === '8UN' ? 8 : UNC_TPI[String(dia)];
        b.set('thread_size', `${fmtInch(dia)}IN`, 0.9, 'regex', m[0]);
        b.set('thread', `${fmtInch(dia)}-${tpi ?? '?'}${series}`, unified ? 0.93 : 0.7, unified ? 'regex' : 'derived', m[0]);
      }
    }
    const len =
      /(?:X|LENGTH|LG)\s*(\d{2,3})\s*(?:MM)?\s*(?:LG|LONG|LENGTH)?\b/.exec(text.replace(/.*?(UNC|UNF|8\s?UN|")/, '')) ??
      /(\d{2,3})\s*MM\s*(?:LG|LONG|LENGTH)/.exec(text);
    if (len) b.set('length_mm', Number(len[1]), 0.85, 'regex', len[0]);
  }

  const grade = firstRule(text, [
    [/A193\s*(?:GRADE\s*|GR\s*)?(B7M|B7|B8M|B8|B16)\b/, 'A193'],
    [/(?<![A-Z0-9])(B7M|B7|B8M|B16)(?![A-Z0-9])/, 'A193'],
    [/A194\s*(?:GRADE\s*|GR\s*)?(2HM|2H|8M|7)\b/, 'A194'],
    [/(?<![0-9.])(4\.6|4\.8|8\.8|10\.9|12\.9)(?![0-9])/, 'PC'],
    [/SS\s?316|STAINLESS STEEL\s*316|\bA4[-\s]?(70|80)\b/, 'SS316'],
    [/SS\s?304|STAINLESS STEEL\s*304|\bA2[-\s]?(70|80)\b/, 'SS304'],
    [/(?:GRADE|GR\.?|PROPERTY CLASS|CLASS)\s*(8|10|12)\b/, 'NUTPC'],
  ]);
  if (grade) {
    let v: string;
    if (grade.value === 'A193') v = `A193-${/(B7M|B7|B8M|B8|B16)/.exec(grade.raw)![1]}`;
    else if (grade.value === 'A194') v = `A194-${/(2HM|2H|8M|7)\b/.exec(grade.raw)![1]}`;
    else if (grade.value === 'PC') v = /(4\.6|4\.8|8\.8|10\.9|12\.9)/.exec(grade.raw)![1];
    else if (grade.value === 'NUTPC') v = `PC${/(8|10|12)\b/.exec(grade.raw)![1]}`;
    else v = grade.value;
    b.set('grade', v, 0.94, 'regex', grade.raw);
  }

  const finish = firstRule(text, [
    [/HOT DIP GALVANISED|\bHDG\b/, 'HDG'],
    [/ZINC PLATED|ELECTRO ?GALVANISED|\bEG\b/, 'ZINC_PLATED'],
    [/PTFE|XYLAN|FLUOROCARBON/, 'PTFE_COATED'],
    [/CADMIUM/, 'CADMIUM'],
    [/\bGALVANISED\b/, 'HDG'],
    [/\bBLACK\b|\bPLAIN\b|UNCOATED/, 'BLACK'],
  ]);
  if (finish) b.set('finish', finish.value, finish.raw === 'GALVANISED' ? 0.7 : 0.92, 'dictionary', finish.raw);

  const std = /\b(IS)\s*(1363|1364|1367|6639|2016|3063)\b|\b(ASTM)\s*(A193|A194|A320|F436)\b|\b(DIN)\s*(931|933|934|975)\b|\bISO\s*(4014|4017|4032)\b/.exec(text);
  if (std) {
    const v = std[1] ? `IS ${std[2]}` : std[3] ? `ASTM ${std[4]}` : std[5] ? `DIN ${std[6]}` : `ISO ${std[7]}`;
    b.set('standard', v, 0.9, 'regex', std[0]);
  }

  return b.attrs;
}
