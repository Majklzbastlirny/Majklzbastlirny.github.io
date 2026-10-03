#!/usr/bin/env node
/**
 * validate.mjs — regression gate for the Thread Identifier.
 *
 *   node validate.mjs                 # tests ./index.html
 *   node validate.mjs path/to/foo.html
 *
 * Exit code 0 = all passed, 1 = at least one failure.
 *
 * It runs the page's own inline script in a vm sandbox against a stub DOM, so index.html stays the
 * one source of truth — there is no extracted copy of the logic to drift out of step. Then:
 *   1. reference data   every database row against values typed independently from the standards
 *   2. model constants  depth and bore factors against the standards' profile geometry
 *   3. self-ID          every row must identify itself from a realistic caliper reading,
 *                       anywhere in its manufacturing tolerance band, external and internal
 *   4. field cases      named real-world measurements, including the ones the first version got wrong
 *   5. presentation     advisory wording, HTML escaping, profile drawing bounds, span helper
 */
import { readFileSync } from "node:fs";
import vm from "node:vm";

const htmlPath = process.argv[2] || new URL("./index.html", import.meta.url);
const html = readFileSync(htmlPath, "utf8");
const src = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join("\n");
if (!src.includes("function matchAll(")) { console.error("matchAll() not found in the page script"); process.exit(1); }

// ---- stub DOM: every element is a bag of the properties the script touches ----
const els = new Map();
const el = key => {
  if (!els.has(key)) els.set(key, {
    value: "", textContent: key === "#spanOut" ? "SPAN-HINT" : "", innerHTML: "", className: "", hidden: false,
    dataset: {}, children: [], style: {},
    classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
    addEventListener() {}, setAttribute() {}, closest() { return null; },
  });
  return els.get(key);
};
const document = { getElementById: id => el("#" + id), querySelector: s => el(s), querySelectorAll: () => [] };
const ctx = vm.createContext({ document, console });
vm.runInContext(src, ctx, { filename: "index.html <script>" });
const { DB, FAM, matchAll, depthOf, underOf, boreOf, render, spanPitch } =
  vm.runInContext("({DB,FAM,matchAll,depthOf,underOf,boreOf,render,spanPitch})", ctx);

// ---- bookkeeping ----
const groups = [];
let group;
const begin = name => groups.push(group = { name, pass: 0, fails: [] });
const check = (cond, msg) => { cond ? group.pass++ : group.fails.push(msg); };
const near = (got, want, tol, msg) =>
  check(Number.isFinite(got) && Math.abs(got - want) <= tol, `${msg}: got ${got?.toFixed?.(4)}, want ${want.toFixed(4)} ±${tol}`);
const IN = 25.4;
const frac = s => s.replace(/"$/, "").split("-").reduce((a, p) => a + (p.includes("/") ? +p.split("/")[0] / +p.split("/")[1] : +p), 0);
const rows = fam => DB.filter(e => e.fam === fam);

/* ======================= 1. REFERENCE DATA ======================= */
begin("reference data");

// ISO 261 — coarse pitch per diameter, and the fine pitches the standard allows
const ISO_COARSE = { 1: .25, 1.2: .25, 1.4: .3, 1.6: .35, 1.8: .35, 2: .4, 2.2: .45, 2.5: .45, 3: .5, 3.5: .6, 4: .7,
  4.5: .75, 5: .8, 6: 1, 7: 1, 8: 1.25, 9: 1.25, 10: 1.5, 11: 1.5, 12: 1.75, 14: 2, 16: 2, 18: 2.5, 20: 2.5, 22: 2.5,
  24: 3, 27: 3, 30: 3.5, 33: 3.5, 36: 4, 39: 4, 42: 4.5, 45: 4.5, 48: 5, 52: 5, 56: 5.5, 60: 5.5, 64: 6 };
const ISO_FINE = { 3: [.35], 4: [.5], 5: [.5], 6: [.75], 7: [.75], 8: [1, .75], 9: [1, .75], 10: [1.25, 1, .75],
  11: [1, .75], 12: [1.5, 1.25, 1], 14: [1.5, 1.25, 1], 15: [1.5, 1], 16: [1.5, 1], 17: [1.5, 1], 18: [2, 1.5, 1],
  20: [2, 1.5, 1], 22: [2, 1.5, 1], 24: [2, 1.5, 1], 25: [2, 1.5, 1], 26: [1.5], 27: [2, 1.5, 1], 28: [2, 1.5, 1],
  30: [3, 2, 1.5, 1], 32: [2, 1.5], 33: [3, 2, 1.5], 35: [1.5], 36: [3, 2, 1.5], 39: [3, 2, 1.5], 40: [3, 2, 1.5],
  42: [4, 3, 2, 1.5], 45: [4, 3, 2, 1.5], 48: [4, 3, 2, 1.5], 50: [3, 2, 1.5], 52: [4, 3, 2, 1.5],
  56: [4, 3, 2], 60: [4, 3, 2], 63: [1.5] /* EN 60423 cable gland, not ISO 261 */, 64: [4, 3, 2] };
for (const e of rows("MC")) {
  check(e.name === `M${e.D}`, `${e.name}: name does not match Ø ${e.D}`);
  check(ISO_COARSE[e.D] === e.P, `${e.name}: coarse pitch ${e.P}, ISO 261 says ${ISO_COARSE[e.D]}`);
}
for (const e of rows("MF")) {
  check(e.name === `M${e.D}×${e.P}`, `${e.name}: name does not match Ø ${e.D} × ${e.P}`);
  check((ISO_FINE[e.D] || []).includes(e.P), `${e.name}: not an ISO 261 fine pitch for M${e.D}`);
}

// ASME B1.1 — [major Ø in inches, TPI]
const UN = {
  UNC: { "#1": [.073, 64], "#2": [.086, 56], "#3": [.099, 48], "#4": [.112, 40], "#5": [.125, 40], "#6": [.138, 32],
    "#8": [.164, 32], "#10": [.190, 24], "#12": [.216, 24], "1/4": [.25, 20], "5/16": [.3125, 18], "3/8": [.375, 16],
    "7/16": [.4375, 14], "1/2": [.5, 13], "9/16": [.5625, 12], "5/8": [.625, 11], "3/4": [.75, 10], "7/8": [.875, 9],
    "1": [1, 8], "1-1/8": [1.125, 7], "1-1/4": [1.25, 7], "1-3/8": [1.375, 6], "1-1/2": [1.5, 6] },
  UNF: { "#0": [.060, 80], "#1": [.073, 72], "#2": [.086, 64], "#3": [.099, 56], "#4": [.112, 48], "#5": [.125, 44],
    "#6": [.138, 40], "#8": [.164, 36], "#10": [.190, 32], "#12": [.216, 28], "1/4": [.25, 28], "5/16": [.3125, 24],
    "3/8": [.375, 24], "7/16": [.4375, 20], "1/2": [.5, 20], "9/16": [.5625, 18], "5/8": [.625, 18], "3/4": [.75, 16],
    "7/8": [.875, 14], "1": [1, 12], "1-1/8": [1.125, 12], "1-1/4": [1.25, 12] },
  UNEF: { "#12": [.216, 32], "1/4": [.25, 32], "5/16": [.3125, 32], "3/8": [.375, 32], "7/16": [.4375, 28],
    "1/2": [.5, 28], "9/16": [.5625, 24], "5/8": [.625, 24], "11/16": [.6875, 24], "3/4": [.75, 20],
    "13/16": [.8125, 20], "7/8": [.875, 20], "15/16": [.9375, 20], "1": [1, 20] },
};
for (const fam of ["UNC", "UNF", "UNEF"]) for (const e of rows(fam)) {
  const m = e.name.match(/^(.+)-(\d+) (UNC|UNF|UNEF)$/);
  const ref = m && UN[fam][m[1].replace(/"$/, "")];
  if (!ref) { check(false, `${e.name}: not an ASME B1.1 ${fam} size`); continue; }
  near(e.D, ref[0] * IN, 1e-6, `${e.name} major Ø`);
  near(IN / e.P, ref[1], 1e-9, `${e.name} TPI`);
  check(+m[2] === ref[1], `${e.name}: TPI in the name disagrees with ASME B1.1 (${ref[1]})`);
}

// BS 84 — Whitworth TPI by size
const BS = {
  BSW: { "1/8": 40, "5/32": 32, "3/16": 24, "7/32": 24, "1/4": 20, "5/16": 18, "3/8": 16, "7/16": 14, "1/2": 12,
    "9/16": 12, "5/8": 11, "11/16": 11, "3/4": 10, "7/8": 9, "1": 8 },
  BSF: { "3/16": 32, "7/32": 28, "1/4": 26, "9/32": 26, "5/16": 22, "3/8": 20, "7/16": 18, "1/2": 16, "9/16": 16,
    "5/8": 14, "11/16": 14, "3/4": 12, "7/8": 11, "1": 10 },
};
for (const fam of ["BSW", "BSF"]) for (const e of rows(fam)) {
  const size = e.name.replace(` ${fam}`, "").replace(/"$/, "");
  if (!(size in BS[fam])) { check(false, `${e.name}: not a BS 84 ${fam} size`); continue; }
  near(e.D, frac(size) * IN, 1e-6, `${e.name} major Ø`);
  near(IN / e.P, BS[fam][size], 1e-9, `${e.name} TPI`);
}

// ISO 228-1 — G major Ø (mm, exact, not the fraction) and TPI
const ISO228 = { "G1/16": [7.723, 28], "G1/8": [9.728, 28], "G1/4": [13.157, 19], "G3/8": [16.662, 19],
  "G1/2": [20.955, 14], "G5/8": [22.911, 14], "G3/4": [26.441, 14], "G7/8": [30.201, 14], "G1": [33.249, 11],
  "G1-1/8": [37.897, 11], "G1-1/4": [41.910, 11], "G1-1/2": [47.803, 11], "G1-3/4": [53.746, 11], "G2": [59.614, 11] };
for (const e of rows("G")) {
  const ref = ISO228[e.name];
  if (!ref) { check(false, `${e.name}: not an ISO 228-1 size`); continue; }
  near(e.D, ref[0], 1e-9, `${e.name} major Ø`);
  near(IN / e.P, ref[1], 1e-9, `${e.name} TPI`);
}

// ASME B1.20.1 — NPT [pipe OD in, TPI, E1 = pitch Ø at the hand-tight plane in]
const NPT = { "1/16": [.3125, 27, .28118], "1/8": [.405, 27, .37360], "1/4": [.540, 18, .49163],
  "3/8": [.675, 18, .62701], "1/2": [.840, 14, .77843], "3/4": [1.050, 14, .98887], "1": [1.315, 11.5, 1.23863],
  "1-1/4": [1.660, 11.5, 1.58338], "1-1/2": [1.900, 11.5, 1.82234], "2": [2.375, 11.5, 2.29627] };
const nptRef = e => NPT[e.name.replace(" NPT", "").replace(/"$/, "")];
for (const e of rows("NPT")) {
  const ref = nptRef(e);
  if (!ref) { check(false, `${e.name}: not an ASME B1.20.1 size`); continue; }
  near(e.D, ref[0] * IN, 0.001, `${e.name} pipe OD`);
  near(IN / e.P, ref[1], 1e-9, `${e.name} TPI`);
}

// DIN 40430 — PG [major Ø, core Ø, TPI]
const PG = { PG7: [12.5, 11.28, 20], PG9: [15.2, 13.86, 18], PG11: [18.6, 17.26, 18], "PG13.5": [20.4, 19.06, 18],
  PG16: [22.5, 21.16, 18], PG21: [28.3, 26.78, 16], PG29: [37.0, 35.48, 16], PG36: [47.0, 45.48, 16],
  PG42: [54.0, 52.48, 16], PG48: [59.3, 57.78, 16] };
for (const e of rows("PG")) {
  const ref = PG[e.name];
  if (!ref) { check(false, `${e.name}: not a DIN 40430 size`); continue; }
  near(e.D, ref[0], 1e-9, `${e.name} major Ø`);
  near(IN / e.P, ref[2], 1e-9, `${e.name} TPI`);
}

// ISO 2902 — trapezoidal pitches per diameter, plus the two lead-screw sizes sold outside it
const ISO2902 = { 8: [1.5], 10: [2, 1.5], 12: [3, 2], 14: [3, 2], 16: [4, 2], 18: [4, 2], 20: [4, 2], 22: [8, 5, 3],
  24: [8, 5, 3], 26: [8, 5, 3], 28: [8, 5, 3], 30: [10, 6, 3], 32: [10, 6, 3], 34: [10, 6, 3], 36: [10, 6, 3],
  38: [10, 7, 3], 40: [10, 7, 3] };
const TR_EXTRA = ["Tr8×2", "Tr10×3"];   // 3D-printer / linear-motion lead screws
for (const e of rows("TR")) {
  check(e.name === `Tr${e.D}×${e.P}`, `${e.name}: name does not match Ø ${e.D} × ${e.P}`);
  check((ISO2902[e.D] || []).includes(e.P) || TR_EXTRA.includes(e.name), `${e.name}: not in ISO 2902`);
}

// DIN 168-1 — GL [pitch, bolt major max/min, bolt minor max/min, nut minor min/max]
const DIN168 = { 14: [2.5, 14.00, 13.60, 12.32, 11.92, 12.42, 12.67], 16: [2.5, 16.00, 15.60, 14.32, 13.92, 14.42, 14.67],
  18: [3, 18.00, 17.50, 15.98, 15.48, 16.08, 16.38], 20: [3, 20.00, 19.50, 17.98, 17.48, 18.08, 18.38],
  22: [3, 22.00, 21.50, 19.98, 19.48, 20.08, 20.38], 25: [3, 25.00, 24.50, 22.98, 22.48, 23.08, 23.38],
  28: [3, 28.00, 27.50, 25.98, 25.48, 26.08, 26.38], 32: [4, 32.00, 31.30, 29.30, 28.60, 29.45, 29.85],
  36: [4, 36.00, 35.30, 33.30, 32.60, 33.45, 33.85], 40: [4, 40.00, 39.30, 37.30, 36.60, 37.45, 37.85],
  45: [4, 45.00, 44.30, 42.30, 41.60, 42.45, 42.85] };
for (const e of rows("GL")) {
  const ref = DIN168[e.D];
  if (!ref || e.name !== `GL${e.D}`) { check(false, `${e.name}: not a DIN 168-1 size`); continue; }
  near(e.P, ref[0], 1e-9, `${e.name} pitch`);
}

// GPI/SPI neck finishes — 8 TPI for 18–24, 6 TPI for 28–38. 13 and 15 are unverified (page marks them "pitch ≈").
for (const e of rows("GPI")) {
  if (e.D < 18) { check(/pitch ≈/.test(e.note), `${e.name}: unverified pitch must say "pitch ≈"`); continue; }
  near(IN / e.P, e.D <= 24 ? 8 : 6, 1e-9, `${e.name} TPI`);
  check(e.name.startsWith(`${e.D}-`), `${e.name}: name does not start with the T size`);
}

// RF coupling threads (MIL-STD-348 / IEC 61169) — [major Ø mm, pitch mm]
const RF = { SMA: [.25 * IN, IN / 36], TNC: [.4375 * IN, IN / 28], "N-type": [.625 * IN, IN / 24],
  "F-type": [.375 * IN, IN / 32], "Mini-UHF": [.375 * IN, IN / 24], SMC: [.190 * IN, IN / 32], "7/16 DIN": [29, 1.5] };
for (const [key, [d, p]] of Object.entries(RF)) {
  const e = rows("RF").find(r => r.name.includes(`(${key}`) || r.name.includes(` ${key}`) || r.name.includes(`${key})`));
  if (!e) { check(false, `RF ${key}: no row`); continue; }
  near(e.D, d, 1e-6, `${e.name} major Ø`);
  near(e.P, p, 1e-9, `${e.name} pitch`);
}

// whole-table sanity
const names = DB.map(e => e.name);
check(new Set(names).size === names.length, `duplicate names: ${names.filter((n, i) => names.indexOf(n) !== i)}`);
for (const e of DB) {
  check(FAM[e.fam], `${e.name}: unknown family ${e.fam}`);
  check(e.D > 0 && e.P > 0, `${e.name}: Ø and pitch must be positive`);
}

/* ======================= 2. MODEL CONSTANTS ======================= */
begin("model constants");
// basic 60° profile (ISO 68-1 / ASME B1.1): external depth h3 = 0.61343P, internal minor D1 = D − 1.08253P
for (const fam of ["MC", "MF", "UNC", "UNF", "UNEF", "RF"]) {
  near(FAM[fam].df, 0.61343, 0.001, `${fam} depth factor`);
  near(FAM[fam].ik, 1.08253, 0.001, `${fam} bore factor`);
}
// Whitworth form (BS 84 / ISO 228): h = 0.640327P, D1 = D − 1.280654P
for (const fam of ["BSW", "BSF", "G"]) {
  near(FAM[fam].df, 0.640327, 0.001, `${fam} depth factor`);
  near(FAM[fam].ik, 1.280654, 0.001, `${fam} bore factor`);
}
// NPT: h = 0.8P; the bore at the fitting face is E1 − h
near(FAM.NPT.df, 0.8, 1e-9, "NPT depth factor");
for (const e of rows("NPT")) {
  const [, , E1] = nptRef(e);
  near(e.D - FAM.NPT.ik * e.P, (E1 - 0.8 / (IN / e.P)) * IN, 0.08, `${e.name} bore at fitting face`);
}
// Tr (ISO 2904): D1 = d − P, h3 = P/2 + ac
const ac = P => P <= 1.5 ? 0.15 : P <= 5 ? 0.25 : P <= 12 ? 0.5 : 1;
for (const e of rows("TR")) {
  near(e.D - FAM.TR.ik * e.P, e.D - e.P, 1e-9, `${e.name} nut minor Ø`);
  near(depthOf(e), e.P / 2 + ac(e.P), 1e-9, `${e.name} depth h3`);
}
// GL (DIN 168-1): depth = (major − minor)/2, cap bore = nut minor (min)
for (const e of rows("GL")) {
  const r = DIN168[e.D];
  near(depthOf(e), (r[1] - r[3]) / 2, 0.06, `${e.name} depth`);
  near(e.D - FAM.GL.ik * e.P, r[5], 0.06, `${e.name} cap bore`);
}
// PG (DIN 40430): depth = (d − d1)/2, nut bore ≈ d1
for (const e of rows("PG")) {
  const r = PG[e.name];
  near(depthOf(e), (r[0] - r[1]) / 2, 0.03, `${e.name} depth`);
  near(e.D - FAM.PG.ik * e.P, r[1], 0.05, `${e.name} nut bore`);
}
// where a bolt should read: mid of its real tolerance band. Metric from the ISO 965-1 6g tables, UN from the
// ASME B1.1 2A limits (inches), G from ISO 228-1 class A — the page uses one 6g formula for all three.
const byName = n => DB.find(e => e.name === n);
const midUnder = (D, max, min) => D - (max + min) / 2;
for (const [n, max, min] of [["M6", 5.974, 5.794], ["M12", 11.966, 11.701], ["M24", 23.952, 23.577],
  ["1/4-20 UNC", .2489 * IN, .2408 * IN], ["#10-24 UNC", .1890 * IN, .1818 * IN], ["1/2-13 UNC", .4985 * IN, .4876 * IN],
  ["1\"-8 UNC", .9980 * IN, .9830 * IN], ["#10-32 UNF", .1890 * IN, .1825 * IN], ["G1/2", 20.955, 20.671], ["G1", 33.249, 32.889]]) {
  const e = byName(n);
  near(underOf(e), midUnder(e.D, max, min), n.startsWith("G") ? 0.03 : 0.012, `${n} reads mid-band`);
}
// where a nut bore should read: inside its band. ISO 965-1 6H D1 limits, ISO 228-1 G internal minor limits.
for (const [n, min, max] of [["M6", 4.917, 5.153], ["M12", 10.106, 10.441], ["M24", 20.752, 21.252],
  ["G1/2", 18.631, 19.172], ["GL18", 16.08, 16.38], ["GL45", 42.45, 42.85]]) {
  const b = boreOf(byName(n));
  check(b > min && b < max, `${n} expected bore ${b.toFixed(3)} outside its band ${min}–${max}`);
}

/* ======================= 3. SELF-IDENTIFICATION ======================= */
// A real part reads anywhere inside its tolerance band. Each row, read at the band's top, middle and bottom with
// its exact pitch, must either
//   • come out on top — sharing it is fine with a row that has the very same Ø and pitch under another name
//     (TNC vs 7/16-28 UNEF) or that only a thread-form gauge can split (1/4-20 UNC vs 1/4 BSW: 60° vs 55°), or
//   • be the runner-up the page names in its "nearly identical by caliper" warning, so the user is told.
// Some pairs are honestly inseparable by caliper (M2.5 vs #3-56 UNF differ by 0,015 mm and 0,004 mm of pitch);
// the second rule is what the tool can promise for those. Tie = within 0.1 % of the top score.
const sameCaliper = (a, b) => Math.abs(a.D - b.D) < 0.005 && Math.abs(a.P - b.P) < 0.001;
let warnedTwins = 0;
function rankOf(e, D, P, isExt) {
  const res = matchAll(D, P, null, isExt);
  const i = res.findIndex(r => r.e === e);
  if (i < 0) return { ok: false, why: "not listed at all" };
  const ahead = res.filter(r => r.conf > res[i].conf * 1.001 && !sameCaliper(r.e, e));
  if (!ahead.length) return { ok: true };
  render(res.slice(0, 8), { D, P, H: null, isExt }, null);
  const adv = el("#advisory").innerHTML;
  const aliases = DB.filter(x => sameCaliper(x, e)).map(x => x.name.replace(/&/g, "&amp;").replace(/"/g, "&quot;"));
  if (/nearly identical/.test(adv) && aliases.some(n => adv.includes(n))) { warnedTwins++; return { ok: true }; }
  return { ok: false, why: `${res[i].conf.toFixed(1)} % behind ` + ahead.map(r => `${r.e.name} ${r.conf.toFixed(1)}`).join(", ") + ", no warning" };
}
// ISO 965-1 6g: es = 15 + 11P µm, Td(6) = 180·P^(2/3) − 3.15/√P µm. ASME 2A, BS 84 medium and ISO 228 class A
// land within a few hundredths of the same band, so it stands in for all metal fastener and pipe threads.
const band6g = (D, P) => { const es = (15 + 11 * P) / 1000, Td = (180 * P ** (2 / 3) - 3.15 / Math.sqrt(P)) / 1000; return [D - es - Td, D - es]; };
const TR_TD = { 1.5: .150, 2: .180, 3: .236, 4: .300, 5: .335, 6: .375, 7: .425 };   // ISO 2903 major Ø, grade 4
function extBand(e) {
  switch (e.fam) {
    case "NPT": {   // read at the large end: from the hand-tight plane (E1 + h) out to where crests run into the pipe OD
      const [, , E1] = nptRef(e); return [(E1 + 0.8 / (IN / e.P)) * IN, e.D]; }
    case "TR":  return [e.D - TR_TD[e.P], e.D];
    case "GL":  { const r = DIN168[e.D]; return [r[2], r[1]]; }
    case "GPI": return [e.D * 0.975 - 0.3, e.D * 0.975 + 0.3];   // GPI/SPI T: 18-410 = 17.63±0.25, 28-410 = 27.33±0.32, 38-400 = 36.88–37.49
    default:    return band6g(e.D, e.P);
  }
}
// ISO 965-1 6H minor-Ø tolerance TD1, mm
const TD1 = P => (P < 1 ? 433 * P - 190 * P ** 1.22 : 230 * P ** 0.7) / 1000;
function intBand(e) {   // bore over the nut's crests: [basic minor, top of its tolerance band]
  switch (e.fam) {
    case "NPT": { const [, , E1] = nptRef(e); const face = (E1 - 0.8 / (IN / e.P)) * IN; return [face - 0.15, face]; }
    case "TR":  return [e.D - e.P, e.D - e.P + 0.1 * e.P];
    case "GL":  { const r = DIN168[e.D]; return [r[5], r[6]]; }
    case "PG":  { const d1 = PG[e.name][1]; return [d1, d1 + TD1(e.P)]; }
    case "BSW": case "BSF": case "G": { const D1 = e.D - 1.280654 * e.P; return [D1, D1 + 0.3 * e.P]; }   // ISO 228-1: G1/2 TD1 = 0,541
    default:    { const D1 = e.D - 1.08253 * e.P; return [D1, D1 + TD1(e.P)]; }
  }
}
for (const [label, isExt, bandOf] of [["self-ID external", true, extBand], ["self-ID internal", false, intBand]]) {
  begin(label);
  for (const e of DB) {
    if (!isExt && FAM[e.fam].ik == null) continue;   // GPI caps: no internal model
    const [lo, hi] = bandOf(e);
    for (const [where, D] of [["top", hi], ["mid", (lo + hi) / 2], ["bottom", lo]]) {
      const r = rankOf(e, D, e.P, isExt);
      check(r.ok, `${e.name} @ ${where} of band (${D.toFixed(3)} mm): ${r.why || "?"}`);
    }
  }
}

/* ======================= 4. FIELD CASES ======================= */
begin("field cases");
const tpi = t => IN / t;
// [what, Ø, pitch mm, depth, external?, expected top (name or list of acceptable names)]
const FIELD = [
  ["M8 bolt",                        7.85, 1.25,      null, true,  "M8"],
  ["M5 bolt",                        4.88, 0.8,       null, true,  "M5"],
  ["SMA jack",                       6.25, tpi(36),   null, true,  "1/4-36 (SMA / RP-SMA)"],
  ["SMC jack",                       4.75, tpi(32),   null, true,  ["#10-32 (SMC)", "#10-32 UNF"]],
  ["TNC jack",                       11.0, tpi(28),   null, true,  "7/16-28 (TNC / RP-TNC)"],
  ["1/4-20 bolt",                    6.20, tpi(20),   null, true,  ["1/4-20 UNC", "1/4 BSW"]],
  ["G1/2 male",                      20.80, tpi(14),  null, true,  "G1/2"],
  ["1/2 NPT male, large end",        21.2, tpi(14),   null, true,  "1/2 NPT"],
  ["1/2 NPT male with depth 1.45",   21.2, tpi(14),   1.45, true,  "1/2 NPT"],
  ["GL18 bottle",                    17.75, 3.0,      null, true,  "GL18"],
  ["GL45 media bottle",              44.6, 4.0,       null, true,  "GL45"],
  ["GPI 18-400 bottle",              17.7, tpi(8),    null, true,  "18-400/410/415"],
  ["GPI 24-400 bottle",              23.7, tpi(8),    null, true,  "24-400/410/415"],
  ["GPI 28-400 bottle",              27.4, tpi(6),    null, true,  "28-400/410/415"],
  ["Tr8×2 printer lead screw",       7.85, 2,         null, true,  "Tr8×2"],
  ["PG13.5 gland",                   20.25, tpi(18),  null, true,  "PG13.5"],
  ["M20×1.5 gland",                  19.85, 1.5,      null, true,  "M20×1.5"],
  ["M6 nut bore",                    5.00, 1.0,       null, false, "M6"],
  ["1/2 NPT fitting bore",           18.4, tpi(14),   null, false, "1/2 NPT"],
  ["GL18 cap bore",                  16.1, 3,         null, false, "GL18"],
  ["GL45 cap bore",                  42.6, 4,         null, false, "GL45"],
  ["Tr20×4 nut",                     16.1, 4,         null, false, "Tr20×4"],
  ["G1/4 female port",               11.6, tpi(19),   null, false, "G1/4"],
];
for (const [what, D, P, H, isExt, want] of FIELD) {
  const res = matchAll(D, P, H, isExt);
  const ok = res.length && [].concat(want).includes(res[0].e.name);
  check(ok, `${what} (${D} mm, ${P.toFixed(3)} mm): top is ${res[0] ? `${res[0].e.name} ${res[0].conf.toFixed(1)} %` : "nothing"}, want ${want}`);
}
// no pitch → everything capped at 75 %
check(matchAll(11.85, null, null, true).every(r => r.conf <= 75), "no pitch: confidence must cap at 75 %");

/* ======================= 5. PRESENTATION ======================= */
begin("presentation");
function show(D, P, H, isExt) {
  render(matchAll(D, P, H, isExt).slice(0, 8), { D, P, H, isExt }, null);
  return { adv: el("#advisory").innerHTML, out: el("#out").innerHTML, svg: el("#profileSvg").innerHTML };
}
let s = show(11.0, tpi(28), null, true);
check(!/nearly identical/.test(s.adv), "TNC vs its own UNEF twin must not raise a 'nearly identical' warning");
s = show(6.20, tpi(20), null, true);
check(/60° vs 55°/.test(s.adv), "1/4-20 UNC vs 1/4 BSW must name the 60° vs 55° difference");
s = show(4.81, 0.8, null, true);
check(/nearly identical/.test(s.adv) && !/differ in thread form/.test(s.adv), "M5 vs #10-32: same 60° form, must not claim a form difference");
s = show(6.0, null, null, true);
check(!/nearly identical/.test(s.adv) && /No pitch entered/.test(s.adv), "M6 without pitch: no-pitch note only, no coarse/fine twin warning");
s = show(5.0, 1.0, 0.6, false);
check(/only used for external/.test(s.adv), "depth on a bore must say it is ignored");
s = show(25.2, tpi(8), null, true);
check(/aria-label="Thread profile of 1&quot;-8 UNC"/.test(s.svg), "inch mark in a name must be escaped inside the SVG aria-label");
check(!/1"-8/.test(s.out) && /1&quot;-8 UNC/.test(s.out), "inch mark must be escaped in the result cards");
check(!/\d\.\d/.test(s.out.replace(/<[^>]*>/g, "")), "result cards must use decimal commas only");
// profile canvas must contain the depth label for every family (NPT is the deepest, Tr the oddest)
for (const fam of Object.keys(FAM)) {
  const e = rows(fam)[Math.floor(rows(fam).length / 2)];
  render([{ e, conf: 90, zD: 0, zP: 0, pKnown: true, hKnown: false, zH: 0 }], { D: e.D, P: e.P, H: null, isExt: true }, null);
  const svg = el("#profileSvg").innerHTML;
  const H = +svg.match(/viewBox="0 0 \d+ (\d+(?:\.\d+)?)"/)[1];
  const ys = [...svg.matchAll(/ y="(\d+(?:\.\d+)?)"/g)].map(m => +m[1]);
  check(Math.max(...ys) < H, `${e.name}: profile text drawn outside the canvas (y ${Math.max(...ys)} ≥ ${H})`);
}
// span helper: L/(N−1), whole N only, and the readout clears when the inputs do
const set = (id, v) => { el("#" + id).value = v; };
set("pitch", ""); set("spanLen", "18,9"); set("spanN", "10");
near(spanPitch(), 2.1, 1e-9, "span 18,9 mm over 10 crests");
set("spanN", "9.5");
check(spanPitch() === null, "span with a fractional crest count must be refused");
set("spanLen", ""); set("spanN", "");
spanPitch();
check(el("#spanOut").textContent === "SPAN-HINT", "span readout must reset when the inputs are cleared");

/* ======================= REPORT ======================= */
const RED = "\x1b[31m", GRN = "\x1b[32m", DIM = "\x1b[2m", RST = "\x1b[0m";
let passed = 0, failed = 0;
console.log("\nThread Identifier regression\n" + "─".repeat(52));
for (const g of groups) {
  passed += g.pass; failed += g.fails.length;
  console.log(`${g.fails.length ? RED + " ✗" : GRN + " ✓"} ${g.name.padEnd(20)}${RST} ${DIM}${g.pass}/${g.pass + g.fails.length}${RST}`);
  for (const f of g.fails.slice(0, 40)) console.log(`     ${RED}✗${RST} ${f}`);
  if (g.fails.length > 40) console.log(`     … and ${g.fails.length - 40} more`);
}
console.log("─".repeat(52));
console.log(`${DIM}self-ID: ${warnedTwins} band-edge readings land on a caliper twin and pass because the page warns${RST}`);
console.log(`${failed ? RED : GRN}${passed} passed, ${failed} failed${RST}\n`);
process.exit(failed ? 1 : 0);
