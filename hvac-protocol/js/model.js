// Data model: step manifest, protocol structure, calculations.
// Mirrors hvac_protocol.py. The JSON format is identical, so protocol files move
// freely between the web app and the Python tool. If you change a calculation
// here, change calc_salon()/calc_cabin() in hvac_protocol.py too.

import { parse as parseToml } from '../vendor/smol-toml.js';

let STEPS = null;
const stepCache = {};

export async function loadSteps() {
  const res = await fetch(new URL('../steps.toml', import.meta.url));
  if (!res.ok) throw new Error(`steps.toml: HTTP ${res.status}`);
  STEPS = parseToml(await res.text());
}

/** Ordered steps of a section type: {id, kind: 'check'|'meas', unit, range, raw, signed}. */
export function steps(type) {
  if (!stepCache[type]) {
    const s = STEPS[type];
    stepCache[type] = [
      ...s.checks.map((id) => ({ id, kind: 'check', unit: '', range: null, raw: false, signed: false })),
      ...s.measurements.map((m) => ({
        id: m.id,
        kind: 'meas',
        unit: m.unit || '',
        range: Array.isArray(m.range) ? m.range : null,
        raw: !!m.raw,
        signed: !!m.signed,
      })),
    ];
  }
  return stepCache[type];
}

export function findStep(type, id) {
  return steps(type).find((st) => st.id === id) || null;
}

// --- Carriage labels -----------------------------------------------------------

export function generateLabels(n) {
  if (n === 1) return ['HV1'];
  if (n === 2) return ['HV1', 'HV3'];
  const middle = n - 2;
  const mid = middle === 1 ? ['VV'] : Array.from({ length: middle }, (_, i) => `VV${i + 1}`);
  return ['HV1', ...mid, 'HV3'];
}

// --- Protocol data ---------------------------------------------------------------

/** Like Python's datetime.now().isoformat(): local time, no zone suffix. */
export function localIso(d = new Date()) {
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}000`;
}

export const today = () => localIso().slice(0, 10);

export function newSection(type) {
  const checks = {};
  const measurements = {};
  for (const st of steps(type)) (st.kind === 'check' ? checks : measurements)[st.id] = null;
  return { type, checks, measurements, notes: {} };
}

export function newProtocol({ trainId, numCarriages, ambientTemp = null, uics = [], date }) {
  const labels = generateLabels(numCarriages);
  const carriages = labels.map((label, i) => {
    const hasCabin = i === 0 || i === numCarriages - 1;
    const car = { position: i + 1, label, uic: uics[i] || '', has_cabin: hasCabin, salon: newSection('salon') };
    if (hasCabin) car.cabin = newSection('cabin');
    return car;
  });
  const now = localIso();
  return {
    train_id: trainId || 'unknown',
    date: date || today(),
    ambient_temp: ambientTemp,
    num_carriages: numCarriages,
    carriages,
    created: now,
    modified: now,
  };
}

export function getValue(section, st) {
  const v = (st.kind === 'check' ? section.checks : section.measurements)[st.id];
  return v === undefined ? null : v;
}

export function setValue(section, st, value) {
  (st.kind === 'check' ? section.checks : section.measurements)[st.id] = value;
}

export function countFilled(section) {
  const all = steps(section.type);
  const filled = all.filter((st) => getValue(section, st) !== null).length;
  return [filled, all.length];
}

export function missingSteps(section) {
  return steps(section.type).filter((st) => getValue(section, st) === null).map((st) => st.id);
}

/** true/false = in/out of expected range; null = no rule or no value. */
export function checkTolerance(type, id, value) {
  const range = findStep(type, id)?.range;
  if (!range || value === null || value === undefined) return null;
  return value >= range[0] && value <= range[1];
}

// --- Units (carriage + salon/cabin) ----------------------------------------------

export function units(protocol) {
  const out = [];
  protocol.carriages.forEach((car, carIdx) => {
    out.push({ carIdx, key: 'salon', car, section: car.salon });
    if (car.has_cabin && car.cabin) out.push({ carIdx, key: 'cabin', car, section: car.cabin });
  });
  return out;
}

export function totalProgress(protocol) {
  let filled = 0;
  let total = 0;
  for (const u of units(protocol)) {
    const [f, t] = countFilled(u.section);
    filled += f;
    total += t;
  }
  return [filled, total];
}

export function carriageName(car) {
  return car.uic ? `${car.label} (${car.uic})` : car.label;
}

export function fileBase(protocol) {
  return `${protocol.date || 'unknown'}_${protocol.train_id || 'unknown'}`;
}

// --- Calculated values ---------------------------------------------------------

const round4 = (x) => Math.round(x * 1e4) / 1e4;
const has = (v) => v !== null && v !== undefined;

/** [{key, value, unit}] calculated from salon raw measurements. */
export function calcSalon(m) {
  const out = [];
  const hc = m.compressor_heater_current;
  if (!has(hc)) return out;

  for (const [key, src] of [
    ['evap_fan_y', 'evap_fan_y_raw'],
    ['evap_fan_delta', 'evap_fan_delta_raw'],
    ['condenser_fan_y', 'condenser_fan_y_raw'],
    ['condenser_fan_delta', 'condenser_fan_delta_raw'],
  ]) {
    if (has(m[src])) out.push({ key, value: round4(m[src] - hc), unit: 'A' });
  }

  const condD = m.condenser_fan_delta_raw;
  const evapD = m.evap_fan_delta_raw;
  if (has(condD) && has(evapD)) {
    for (const [key, src] of [
      ['compressor_both', 'compressor_both_raw'],
      ['compressor_one', 'compressor_one_raw'],
    ]) {
      if (has(m[src])) out.push({ key, value: round4(m[src] - condD - evapD - hc), unit: 'A' });
    }
  }
  return out;
}

/** [{key, value, unit}] calculated from cabin raw measurements. */
export function calcCabin(m) {
  const out = [];
  const hc = m.compressor_heater_current;
  if (!has(hc)) return out;

  const rawCf = m.condenser_fan_3f_raw;
  if (has(rawCf)) {
    out.push({ key: 'condenser_fan_3f', value: round4(rawCf - hc), unit: 'A' });
    if (has(m.compressor_raw)) {
      out.push({ key: 'compressor', value: round4(m.compressor_raw - rawCf - hc), unit: 'A' });
    }
  }
  return out;
}

export function calc(section) {
  return section.type === 'salon' ? calcSalon(section.measurements) : calcCabin(section.measurements);
}

// --- Input parsing / formatting ----------------------------------------------

const NUM_RE = /^[+-]?(\d+([.,]\d*)?|[.,]\d+)$/;

/** Accepts ',' or '.' as decimal separator. Returns {ok, value}; empty text = null. */
export function parseNumber(text) {
  const s = String(text).trim().replace(/−/g, '-');
  if (s === '') return { ok: true, value: null };
  if (!NUM_RE.test(s)) return { ok: false, value: null };
  return { ok: true, value: Number(s.replace(',', '.')) };
}

export function fmtNumber(v) {
  return v === null || v === undefined ? '' : String(v);
}

export function fmtRange(range, unit) {
  if (!range) return '';
  return `${range[0]} – ${range[1]}${unit ? ' ' + unit : ''}`;
}

// --- Import validation -----------------------------------------------------------

function normSection(sec, type) {
  if (!sec || typeof sec !== 'object') return newSection(type);
  sec.type = sec.type === 'cabin' || sec.type === 'salon' ? sec.type : type;
  if (!sec.checks || typeof sec.checks !== 'object') sec.checks = {};
  if (!sec.measurements || typeof sec.measurements !== 'object') sec.measurements = {};
  if (!sec.notes || typeof sec.notes !== 'object') sec.notes = {};
  for (const st of steps(sec.type)) {
    if (st.kind === 'check') {
      const v = sec.checks[st.id];
      sec.checks[st.id] = v === 'OK' || v === 'NOK' ? v : null;
    } else {
      const v = sec.measurements[st.id];
      if (typeof v === 'number' && Number.isFinite(v)) continue;
      const parsed = typeof v === 'string' ? parseNumber(v) : { ok: false };
      sec.measurements[st.id] = parsed.ok ? parsed.value : null;
    }
  }
  for (const [k, v] of Object.entries(sec.notes)) {
    if (typeof v !== 'string' || !v.trim()) delete sec.notes[k];
  }
  return sec;
}

/** Validate a parsed protocol JSON (from the Python tool or this app) in place. Throws if it isn't one. */
export function normalizeProtocol(p) {
  if (!p || typeof p !== 'object' || !Array.isArray(p.carriages) || !p.carriages.length ||
      !p.carriages.every((c) => c && typeof c === 'object' && c.salon)) {
    throw new Error('not an HVAC protocol');
  }
  p.train_id = String(p.train_id ?? 'unknown');
  p.date = String(p.date ?? today());
  p.ambient_temp = typeof p.ambient_temp === 'number' && Number.isFinite(p.ambient_temp) ? p.ambient_temp : null;
  const labels = generateLabels(p.carriages.length);
  p.carriages.forEach((car, i) => {
    car.position = car.position ?? i + 1;
    car.label = String(car.label ?? labels[i]);
    car.uic = car.uic == null ? '' : String(car.uic);
    car.has_cabin = !!car.has_cabin;
    car.salon = normSection(car.salon, 'salon');
    if (car.has_cabin) car.cabin = normSection(car.cabin, 'cabin');
  });
  p.num_carriages = p.carriages.length;
  p.created = String(p.created ?? localIso());
  p.modified = String(p.modified ?? p.created);
  return p;
}
