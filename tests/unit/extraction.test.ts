/**
 * Attribute extraction — hand-checked examples per category (PRD §11 step 6: 10+ per category).
 * Each case runs the full normalize → classify → extract path used in production.
 */
import { attrsOf } from '../helpers';

type Case = [string, Record<string, string | number>];

describe('BEARING extraction', () => {
  const cases: Case[] = [
    ['BRG,DGBB,6205-2RS,C3', { bearing_type: 'DEEP_GROOVE_BALL', designation: '6205', seal_type: '2RS', clearance: 'C3', bore_mm: 25, outer_diameter_mm: 52, width_mm: 15 }],
    ['BEARING, BALL, DEEP GROOVE, 6205-2RS, C3 CLEARANCE, 25X52X15MM', { designation: '6205', seal_type: '2RS', clearance: 'C3', bore_mm: 25 }],
    ['Ball Bearing 6205 2RS C3 Make SKF', { bearing_type: 'DEEP_GROOVE_BALL', designation: '6205', seal_type: '2RS', manufacturer: 'SKF' }],
    ['6205 ZZ C3 BALL BRG', { designation: '6205', seal_type: 'ZZ', clearance: 'C3' }],
    ['DGBB 6206-2RS1/C3 (ID30 OD62 W16)', { designation: '6206', seal_type: '2RS', clearance: 'C3', bore_mm: 30, outer_diameter_mm: 62, width_mm: 16 }],
    ['BRG,DGBB,6310,C3', { designation: '6310', seal_type: 'OPEN', clearance: 'C3', outer_diameter_mm: 110 }],
    ['SPH RLR BRG 22210 E C3', { bearing_type: 'SPHERICAL_ROLLER', designation: '22210', clearance: 'C3', width_mm: 23 }],
    ['CYLINDRICAL ROLLER BEARING NU310 ECP/C3', { bearing_type: 'CYLINDRICAL_ROLLER', designation: 'NU310', clearance: 'C3' }],
    ['Taper Roller Bearing 30210', { bearing_type: 'TAPER_ROLLER', designation: '30210', width_mm: 21.75 }],
    ['ANG CONT BRG 7310 BECBP', { bearing_type: 'ANGULAR_CONTACT_BALL', designation: '7310' }],
    ['BEARING 6208DDUC3 NSK', { designation: '6208', seal_type: '2RS', clearance: 'C3', manufacturer: 'NSK' }],
    ['BEARING DEEP GROOVE 6305-2Z/C3 BRASS CAGE', { seal_type: 'ZZ', cage: 'BRASS', bore_mm: 25, outer_diameter_mm: 62 }],
  ];
  it.each(cases)('%s', (text, expected) => expect(attrsOf(text, 'BEARING')).toMatchObject(expected));
});

describe('VALVE extraction', () => {
  const cases: Case[] = [
    ['VLV,GT,4",150#,WCB,RF', { valve_type: 'GATE', size_dn: 100, pressure_class: '150', body_material: 'CS-WCB', end_connection: 'FLANGED_RF' }],
    ['VALVE, GATE, 100NB, CLASS 150, A216 WCB, FLANGED RF, HANDWHEEL, API 600', { size_dn: 100, pressure_class: '150', operation: 'HANDWHEEL', design_standard: 'API 600' }],
    ['Gate Valve 4" 150# CS Flanged RF', { size_dn: 100, body_material: 'CS', end_connection: 'FLANGED_RF' }],
    ['4" GATE VALVE CAST STEEL WCB 150 LB RF ENDS', { size_dn: 100, pressure_class: '150', body_material: 'CS-WCB' }],
    ['VALVE GATE DN100 PN20 WCB RF', { size_dn: 100, pressure_class: '150', body_material: 'CS-WCB' }],
    ['VALVE GATE DN100 PN50 WCB RF', { pressure_class: '300' }],
    ['VLV,GT,1-1/2",800#,A105,SW', { size_dn: 40, pressure_class: '800', body_material: 'CS-A105', end_connection: 'SOCKET_WELD' }],
    ['VALVE, BALL, 50NB, CLASS 150, A351 CF8M, FLANGED RF, LEVER OPERATED, API 6D, FIRE SAFE API 607', { valve_type: 'BALL', body_material: 'SS316', operation: 'LEVER', fire_safe: 'API 607' }],
    ['BALL VALVE 2 INCH 150# A351 CF8', { size_dn: 50, body_material: 'SS304' }],
    ['NRV 6" 150# WCB RF SWING TYPE BS 1868', { valve_type: 'CHECK', size_dn: 150, design_standard: 'BS 1868' }],
    ['BFV,10",150#,DI,WAFER', { valve_type: 'BUTTERFLY', size_dn: 250, body_material: 'DI', end_connection: 'WAFER' }],
    ['Globe Valve 3" 300# WCB Flanged RF trim 8', { valve_type: 'GLOBE', size_dn: 80, pressure_class: '300', trim: 'API TRIM 8' }],
    ['VALVE GATE 1/2" CL800 ASTM A182 F316 SCRD NPT', { size_dn: 15, body_material: 'SS316', end_connection: 'SCREWED' }],
  ];
  it.each(cases)('%s', (text, expected) => expect(attrsOf(text, 'VALVE')).toMatchObject(expected));
});

describe('CABLE extraction', () => {
  const cases: Case[] = [
    ['CBL,PWR,1.1KV,3.5CX95SQMM,AL,XLPE,ARMD', { cable_type: 'POWER', voltage_grade_kv: 1.1, cores: 3.5, cross_section_sqmm: 95, conductor: 'AL', insulation: 'XLPE' }],
    ['CABLE, POWER, 1.1KV, ALUMINIUM, XLPE, 3.5C X 95 SQ.MM, STRIP ARMOURED, IS 7098-1', { armour: 'STRIP', standard: 'IS 7098-1' }],
    ['LT Power Cable 3.5 Core 95 sqmm Al XLPE Armoured', { cores: 3.5, cross_section_sqmm: 95, conductor: 'AL', voltage_grade_kv: 1.1 }],
    ['95 SQMM 3.5 CORE ALU XLPE ARMOURED POWER CABLE 1100V', { cores: 3.5, cross_section_sqmm: 95, voltage_grade_kv: 1.1, conductor: 'AL' }],
    ['CABLE 1.1KV A2XFY 3.5CX95', { conductor: 'AL', insulation: 'XLPE', armour: 'STRIP', cable_type: 'POWER' }],
    ['CABLE 1.1KV 2XWY 4CX16', { conductor: 'CU', armour: 'WIRE', cores: 4, cross_section_sqmm: 16 }],
    ['CABLE, POWER, 6.35/11KV, AL, XLPE, 3C X 240 SQ.MM', { voltage_grade_kv: 11, cores: 3, cross_section_sqmm: 240 }],
    ['HT Power Cable 11KV 3 Core 185 sqmm Al XLPE Armoured', { voltage_grade_kv: 11, cross_section_sqmm: 185 }],
    ['Control Cable 12 Core 1.5 sqmm Cu PVC Armoured FRLS', { cable_type: 'CONTROL', voltage_grade_kv: 1.1, fire_performance: 'FRLS', insulation: 'PVC' }],
    ['CBL,CTRL,1.1KV,12CX1.5SQMM,CU,PVC,ARMD,LSZH', { cable_type: 'CONTROL', fire_performance: 'LSZH' }],
    ['CABLE 1.1KV YWY 7CX1.5 FRLS', { conductor: 'CU', insulation: 'PVC', armour: 'WIRE', cable_type: 'CONTROL', cores: 7 }],
  ];
  it.each(cases)('%s', (text, expected) => expect(attrsOf(text, 'CABLE')).toMatchObject(expected));
});

describe('FASTENER extraction', () => {
  const cases: Case[] = [
    ['BOLT,HEX,M16X80,GR8.8,HDG', { fastener_type: 'HEX_BOLT', thread: 'M16X2.0', length_mm: 80, grade: '8.8', finish: 'HDG' }],
    ['BOLT, HEX HEAD, M16 X 80 MM, PROPERTY CLASS 8.8, HOT DIP GALVANISED, IS 1364', { thread: 'M16X2.0', length_mm: 80, standard: 'IS 1364' }],
    ['Hex Bolt M16x80 8.8 Gr. Galv.', { thread: 'M16X2.0', grade: '8.8', finish: 'HDG' }],
    ['HHB M16 X 80 8.8 HDG', { fastener_type: 'HEX_BOLT', length_mm: 80 }],
    ['HEX BOLT M16X2.0X80 CL 8.8 HDG ISO 4014', { thread: 'M16X2.0', length_mm: 80, standard: 'ISO 4014' }],
    ['HEX BOLT M20X1.5X80 CL 8.8 HDG', { thread: 'M20X1.5', length_mm: 80 }],
    ['STUD,5/8"UNCX110,A193 B7,W/2 NUTS 2H', { fastener_type: 'STUD_BOLT', thread: '5/8-11UNC', length_mm: 110, grade: 'A193-B7' }],
    ['STUD BOLT, 5/8 INCH UNC, LENGTH 110 MM, ASTM A193 GR B7, WITH 2 NOS A194 2H NUTS', { thread: '5/8-11UNC', length_mm: 110, grade: 'A193-B7' }],
    ['STUD BOLT 3/4"UNC X 130 A193 B7 W/ 2 NUTS A194 2H PTFE COATED', { thread: '3/4-10UNC', finish: 'PTFE_COATED' }],
    ['NUT,HEX,M20,GR8,HDG', { fastener_type: 'HEX_NUT', thread: 'M20X2.5', grade: 'PC8' }],
    ['Hex Bolt M12x50 SS316', { grade: 'SS316', length_mm: 50 }],
    ['BOLT HEX M12 X 50MM A2-70', { grade: 'SS304' }],
  ];
  it.each(cases)('%s', (text, expected) => expect(attrsOf(text, 'FASTENER')).toMatchObject(expected));
});

describe('PUMP extraction', () => {
  const cases: Case[] = [
    ['PUMP,CENT,50M3/HR,40MHD,7.5KW,FLP', { pump_type: 'CENTRIFUGAL', flow_m3h: 50, head_m: 40, motor_kw: 7.5, motor_enclosure: 'FLP' }],
    ['PUMP, CENTRIFUGAL, 50 M3/H, 40 M HEAD, 7.5 KW FLAMEPROOF MOTOR, MOC CI, IS 5120', { moc: 'CI', design_standard: 'IS 5120' }],
    ['Centrifugal Pump 833 LPM 40m Head 10HP TEFC CI', { flow_m3h: 49.98, head_m: 40, motor_kw: 7.46, motor_enclosure: 'TEFC' }],
    ['DEWATERING PUMP SUBMERSIBLE 100M3/HR 50M HEAD 22KW SAFE AREA MOC CI', { pump_type: 'SUBMERSIBLE', flow_m3h: 100, head_m: 50, motor_enclosure: 'TEFC' }],
    ['CENTRIFUGAL PUMP SET Q=50 M3/H H=40 M 7.5KW FLP CI IS 5120', { flow_m3h: 50, head_m: 40, motor_enclosure: 'FLP' }],
    ['PUMP,CENT,25M3/HR,32MHD,5.5KW,TEFC', { flow_m3h: 25, head_m: 32, motor_kw: 5.5 }],
    ['PUMP CENTRIFUGAL API 610 150 M3/H 80 M HEAD 55KW CARBON STEEL FLP', { design_standard: 'API 610', moc: 'CS', motor_kw: 55 }],
    ['Centrifugal pump 220 USGPM 131 ft head 15HP SS316', { flow_m3h: 49.96, head_m: 39.9, moc: 'SS316' }],
    ['PUMP END SUCTION 10 M3/H 20 M HEAD 1.5 KW 2900 RPM', { pump_type: 'CENTRIFUGAL', speed_rpm: 2900 }],
    ['SUBMERSIBLE PUMP 200 M3/H 60 M HEAD 45 KW IS 8034 MAKE KSB', { design_standard: 'IS 8034', manufacturer: 'KSB' }],
  ];
  it.each(cases)('%s', (text, expected) => expect(attrsOf(text, 'PUMP')).toMatchObject(expected));
});
