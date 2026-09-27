import { AttrBuilder, findMake, firstRule, round } from './common';
import type { AttributeMap } from '../types';

export function extractPump(text: string, fields: { manufacturer?: string | null } = {}): AttributeMap {
  const b = new AttrBuilder();

  const type = firstRule(text, [
    [/SUBMERSIBLE/, 'SUBMERSIBLE'],
    [/RECIPROCATING|DOSING|METERING|PLUNGER/, 'RECIPROCATING'],
    [/\bGEAR PUMP\b|\bGEAR TYPE\b/, 'GEAR'],
    [/\bSCREW PUMP\b|TWIN SCREW|PROGRESSIVE CAVITY/, 'SCREW'],
    [/CENTRIFUGAL|END SUCTION|SPLIT CASE|\bOH2\b|\bBB1\b/, 'CENTRIFUGAL'],
  ]);
  if (type) b.set('pump_type', type.value, 0.94, 'dictionary', type.raw);

  // Flow → m³/h
  const flowRules: [RegExp, number][] = [
    [/(?<![0-9.])(\d+(?:\.\d+)?)\s*(?:M3\/HR?|M³\/HR?|CUM\/HR?|CMH)\b/, 1],
    [/(?<![0-9.])(\d+(?:\.\d+)?)\s*LPM\b/, 0.06],
    [/(?<![0-9.])(\d+(?:\.\d+)?)\s*LPS\b/, 3.6],
    [/(?<![0-9.])(\d+(?:\.\d+)?)\s*(?:US\s*)?GPM\b/, 0.2271],
    [/(?<![0-9.])(\d+(?:\.\d+)?)\s*LPH\b/, 0.001],
  ];
  for (const [re, f] of flowRules) {
    const m = re.exec(text);
    if (m) {
      b.set('flow_m3h', round(Number(m[1]) * f, 2), f === 1 ? 0.95 : 0.9, f === 1 ? 'regex' : 'derived', m[0]);
      break;
    }
  }

  // Head → m
  const head =
    /(?<![0-9.])(\d+(?:\.\d+)?)\s*(?:M|MTR|METRE|MWC|MLC)\s*(?:HEAD|TDH|HD)\b/.exec(text) ??
    /(?:HEAD|TDH|\bH)\s*=?\s*(\d+(?:\.\d+)?)\s*(?:M|MTR|METRE|MWC)\b/.exec(text);
  const headFt = /(?<![0-9.])(\d+(?:\.\d+)?)\s*(?:FT|FEET)\s*(?:HEAD|TDH)?/.exec(text);
  if (head) b.set('head_m', Number(head[1]), 0.94, 'regex', head[0]);
  else if (headFt) b.set('head_m', round(Number(headFt[1]) * 0.3048, 1), 0.85, 'derived', headFt[0]);

  // Motor rating → kW
  const kw = /(?<![0-9.])(\d+(?:\.\d+)?)\s*KW\b/.exec(text);
  const hp = /(?<![0-9.])(\d+(?:\.\d+)?)\s*(?:HP|BHP)\b/.exec(text);
  if (kw) b.set('motor_kw', Number(kw[1]), 0.95, 'regex', kw[0]);
  else if (hp) b.set('motor_kw', round(Number(hp[1]) * 0.746, 2), 0.88, 'derived', hp[0]);

  const moc = firstRule(text, [
    [/\bCF8M\b|SS\s?316|STAINLESS STEEL\s*316/, 'SS316'],
    [/\bCF8\b|SS\s?304|STAINLESS STEEL\s*304/, 'SS304'],
    [/\bCA6NM\b|13\s?%?\s?CR/, 'CA6NM'],
    [/CAST IRON|\bFG\s?260\b|\bCI\b/, 'CI'],
    [/CARBON STEEL|CAST STEEL|\bWCB\b/, 'CS'],
    [/BRONZE|GUN METAL/, 'BRONZE'],
  ]);
  if (moc) b.set('moc', moc.value, 0.9, 'regex', moc.raw);

  const encl = firstRule(text, [
    [/NON[\s-]*FLAMEPROOF|SAFE AREA|TOTALLY ENCLOSED FAN COOLED|\bTEFC\b/, 'TEFC'],
    [/FLAMEPROOF|\bEX\s*-?\s*D\b|\bEXD\b|\bEX\s*DE?\s*IIB/, 'FLP'],
  ]);
  if (encl) b.set('motor_enclosure', encl.value, 0.93, 'regex', encl.raw);

  const std = /\b(API)\s*(610|674|675|676|685)\b|\b(ISO)\s*(5199|2858|9905)\b|\b(IS)\s*(5120|8034|9137)\b/.exec(text);
  if (std) b.set('design_standard', std[1] ? `API ${std[2]}` : std[3] ? `ISO ${std[4]}` : `IS ${std[6]}`, 0.93, 'regex', std[0]);

  const rpm = /(?<![0-9.])(\d{3,4})\s*RPM\b/.exec(text);
  if (rpm) b.set('speed_rpm', Number(rpm[1]), 0.9, 'regex', rpm[0]);

  const make = findMake(text, fields.manufacturer);
  if (make) b.set('manufacturer', make.value, make.source === 'field' ? 1 : 0.85, make.source);

  return b.attrs;
}
