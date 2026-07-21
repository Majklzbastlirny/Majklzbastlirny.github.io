#!/usr/bin/env node
/**
 * validate.mjs — regression tests for sensor-calc.html
 *
 * Runs the sensor physics + fitter straight out of the single-file HTML, so the
 * HTML stays the one source of truth (no split module, no build step).
 *
 *   node validate.mjs                 # tests ./sensor-calc.html
 *   node validate.mjs path/to/foo.html
 *
 * Exit code 0 = all passed, 1 = at least one failure (CI-friendly).
 *
 * How it works: it extracts the <script>, keeps everything up to the
 * "wiring" banner (all the pure maths + the MODELS registry — no DOM code
 * executes at load there), evaluates it in a vm sandbox, and asserts against
 * the IEC 60751 / NIST ITS-90 reference values. See CLAUDE.md "Validating
 * changes" for the reasoning and the coefficient-regeneration recipe.
 */
import { readFileSync } from "node:fs";
import vm from "node:vm";

const htmlPath = process.argv[2] || new URL("./index.html", import.meta.url);
const CUT = "/* ---------- wiring ---------- */"; // pure maths + MODELS live above this

// ---- load the maths out of the HTML ----
const html = readFileSync(htmlPath, "utf8");
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
if (!scriptMatch) fail_hard("No <script> block found in the HTML.");
const script = scriptMatch[1];
if (!script.includes(CUT))
  fail_hard(`Cut marker ${JSON.stringify(CUT)} not found — did a section banner get renamed? ` +
            `Update CUT in validate.mjs to the banner just before the top-level addEventListener calls.`);

const prefix = script.split(CUT)[0];
const EXPORTS = ["MODELS","RTD","TC","rtdR","rtdT","ntcR_beta","ntcT_beta",
  "ntcR_sh","ntcT_sh","ktyR","ktyT","tcEmf","tcTempFromEmf",
  "solve3","parseRTtable","fitSteinhartHart","fmt"];
const epilogue = "\nglobalThis.__api = {};\n" +
  EXPORTS.map(n => `try{ globalThis.__api[${JSON.stringify(n)}] = ${n}; }catch(e){}`).join("\n");

const sandbox = { console };
vm.createContext(sandbox);
try { vm.runInContext(prefix + epilogue, sandbox, { filename: "sensor-calc.script" }); }
catch (e) { fail_hard("The extracted script threw while loading: " + e.message); }
const api = sandbox.__api;

// ---- tiny test harness ----
let passed = 0, failed = 0;
const fails = [];
function ok(cond, msg) { cond ? passed++ : (failed++, fails.push(msg)); }
function near(actual, expected, tol, msg) {
  const good = Number.isFinite(actual) && Math.abs(actual - expected) <= tol;
  ok(good, `${msg}\n      expected ${expected} ±${tol}, got ${actual}`);
}
function relNear(actual, expected, rel, msg) {
  const good = Number.isFinite(actual) && Math.abs(actual - expected) <= Math.abs(expected) * rel;
  ok(good, `${msg}\n      expected ${expected} (±${rel * 100}%), got ${actual}`);
}
function has(name) { if (!api[name]) fail_hard(`Function "${name}" wasn't exported — check the name in validate.mjs.`); return api[name]; }
function fail_hard(msg) { console.error("\x1b[31mFATAL\x1b[0m " + msg); process.exit(1); }

const { MODELS, rtdR, rtdT, ntcR_beta, ntcT_beta, ntcR_sh, ntcT_sh,
        ktyR, ktyT, tcEmf, tcTempFromEmf, parseRTtable, fitSteinhartHart, fmt } = api;
["MODELS","rtdR","rtdT","tcEmf","tcTempFromEmf","ntcR_sh","ntcT_sh",
 "ktyR","ktyT","parseRTtable","fitSteinhartHart","fmt"].forEach(has);

// ============================================================
// RTD — IEC 60751 Callendar–Van Dusen
// ============================================================
near(rtdR(100, 0),    100.0000, 1e-4, "Pt100 @ 0 °C = 100 Ω");
near(rtdR(100, 100),  138.5055, 1e-3, "Pt100 @ 100 °C = 138.5055 Ω (IEC table)");
near(rtdR(100, -100),  60.2558, 1e-3, "Pt100 @ -100 °C = 60.2558 Ω (sub-zero branch)");
near(rtdR(1000, 0),  1000.0000, 1e-4, "Pt1000 @ 0 °C = 1000 Ω");
near(rtdR(200, 100),  277.0110, 1e-3, "Pt200 @ 100 °C = 277.011 Ω");
for (const t of [-150, -40, 0, 42, 250, 600, 850])
  near(rtdT(100, rtdR(100, t)), t, 1e-4, `Pt100 round-trip @ ${t} °C`);
// Invariant 4: coefficient override plumbing (Custom A/B)
near(rtdR(100, 100, {}),                          138.5055, 1e-3, "empty coeff obj falls back to IEC defaults");
near(rtdR(100, 100, {A:3.9083e-3, B:-5.775e-7}),  138.5055, 1e-3, "explicit IEC coeffs match the default");
ok(Math.abs(rtdR(100, 100, {A:3.9692e-3, B:-5.8495e-7}) - 138.5055) > 0.2,
   "custom A/B actually changes the result (US-alpha coeffs differ from IEC)");

// ============================================================
// Thermocouples — NIST ITS-90 / IEC 60584-1.  tcEmf() MUST return mV. (Invariant 1)
// ============================================================
const TC_REF = { // [t°C, mV]  (1 µV-rounded NIST table points, cj=0)
  K: [[-200,-5.891],[0,0],[100,4.096],[500,20.644],[1000,41.276]],
  J: [[-200,-7.890],[100,5.269],[500,27.393]],
  T: [[-200,-5.603],[100,4.279]],
  E: [[100,6.319],[1000,76.373]],
  N: [[100,2.774],[1300,47.513]],
  R: [[100,0.647],[1000,10.506]],
  S: [[100,0.646],[1000,9.587]],
  B: [[1000,4.834],[1820,13.820]],
};
for (const [type, pts] of Object.entries(TC_REF))
  for (const [t, mv] of pts)
    near(tcEmf(type, t), mv, 2e-3, `Type ${type} EMF @ ${t} °C = ${mv} mV`);
// A scale regression (mV vs µV) would blow past this by ~1000×:
ok(Math.abs(tcEmf("K", 1000)) < 100, "Type K EMF is in mV, not µV (scale guard)");
// Cold-junction-referenced round-trip (what a meter with a 25 °C block sees)
{
  const cj = 25, tTrue = 180;
  const measured = tcEmf("K", tTrue) - tcEmf("K", cj);
  near(tcTempFromEmf("K", measured + tcEmf("K", cj)), tTrue, 1e-3, "Type K cj=25 °C round-trip → 180 °C");
}
// Type B inverse only valid ≥100 °C (Invariant 2) — a mid/high point must still invert
near(tcTempFromEmf("B", tcEmf("B", 1000)), 1000, 1e-2, "Type B inverts correctly at 1000 °C");

// ============================================================
// NTC — β model + Steinhart–Hart
// ============================================================
near(ntcR_beta(10000, 3950, 25), 10000, 1e-6, "10k β3950 @ 25 °C = 10 kΩ");
for (const t of [-30, 0, 40, 85, 150])
  near(ntcT_beta(10000, 3950, ntcR_beta(10000, 3950, t)), t, 1e-6, `NTC β round-trip @ ${t} °C`);
{
  const a = 1.129241e-3, b = 2.341077e-4, c = 8.775468e-8; // default S–H set
  for (const t of [-20, 0, 25, 60, 100])
    near(ntcT_sh(a, b, c, ntcR_sh(a, b, c, t)), t, 1e-4, `NTC S–H round-trip @ ${t} °C`);
}

// ============================================================
// Silicon PTC (KTY) — round-trip + reference-temperature anchors
// ============================================================
{
  const p = MODELS.kty.list[0].p; // KTY81-110, Tref = 25 °C
  for (const t of [-40, 0, 25, 80, 120])
    near(ktyT(p.Rref, p.al, p.be, ktyR(p.Rref, p.al, p.be, t, p.Tref), p.Tref), t, 1e-6,
         `KTY round-trip @ ${t} °C`);
  near(ktyR(p.Rref, p.al, p.be, 25, p.Tref), 1000, 1e-9, "KTY81-110 anchors 1000 Ω at 25 °C");

  const k84 = MODELS.kty.list.find(m => m.id === "kty84").p; // KTY84-130, Tref = 100 °C
  near(MODELS.kty.fwd(k84, 100), 1000, 1e-9, "KTY84-130 anchors 1000 Ω at 100 °C (Tref bug regression)");
  ok(MODELS.kty.fwd(k84, 25) < 700, "KTY84-130 at 25 °C is well below 1000 Ω (~580 Ω real part)");
  near(MODELS.kty.rev(k84, MODELS.kty.fwd(k84, 150)), 150, 1e-6, "KTY84-130 round-trip @ 150 °C");
}

// ============================================================
// Diode — linear Vf model
// ============================================================
{
  const d = MODELS.diode, p = { ...d.list[0].p }; // Si diode: V25=600 mV, k=-2 mV/°C
  near(d.fwd(p, 25), 600, 1e-9, "diode Vf @ 25 °C = V25");
  near(d.fwd(p, 125), 400, 1e-9, "diode Vf drops 2 mV/°C (125 °C → 400 mV)");
  for (const t of [-55, 0, 25, 85, 150])
    near(d.rev(p, d.fwd(p, t)), t, 1e-9, `diode round-trip @ ${t} °C`);
}

// ============================================================
// Steinhart–Hart fitter
// ============================================================
{
  const A = 1.129241e-3, B = 2.341077e-4, C = 8.775468e-8;
  const pts = [-20, 0, 25, 45, 70, 100].map(t => ({ t, r: ntcR_sh(A, B, C, t) }));
  const f = fitSteinhartHart(pts);
  ok(!f.error, "fitter accepts 6 valid points");
  relNear(f.a, A, 1e-4, "fitter recovers a");
  relNear(f.b, B, 1e-4, "fitter recovers b");
  relNear(f.c, C, 1e-4, "fitter recovers c");
  ok(f.maxe < 1e-6, `fitter residual on exact input is ~0 (got max ${f.maxe} °C)`);

  const three = fitSteinhartHart([0, 25, 70].map(t => ({ t, r: ntcR_sh(A, B, C, t) })));
  ok(three.exact === true, "3-point fit is flagged exact");
  ok(three.maxe < 1e-6, "3-point fit passes through its points");

  ok(fitSteinhartHart([{ t: 0, r: 30000 }, { t: 25, r: 10000 }]).error,
     "fitter rejects fewer than 3 points");
  ok(fitSteinhartHart([{ t: 25, r: 1e4 }, { t: 25, r: 1e4 }, { t: 25, r: 1e4 }]).error,
     "fitter rejects collinear/duplicate points");
}

// ---- parser: separators, comma-decimals (CZ), unit scaling ----
{
  const usd = parseRTtable("Temp,Res\n0,32650\n25,10000", "tr", 1);
  ok(usd.length === 2 && usd[0].t === 0 && usd[0].r === 32650, "parser: comma-CSV + ignores header");
  const cz = parseRTtable("0;32650\n50,5;3600,2", "tr", 1);
  ok(cz.length === 2 && cz[1].t === 50.5 && Math.round(cz[1].r) === 3600,
     "parser: Czech semicolon + comma-decimals");
  const kohm = parseRTtable("25, 10.0", "tr", 1000);
  ok(kohm.length === 1 && kohm[0].r === 10000, "parser: kΩ unit scaling");
  const rt = parseRTtable("32650,0\n10000,25", "rt", 1);
  ok(rt.length === 2 && rt[0].t === 0 && rt[0].r === 32650, "parser: R,T column order");
}

// ============================================================
// fmt() — floating-point dust snap (Invariant 3)
// ============================================================
{
  const dust = fmt(-1.1102230246251565e-14);
  ok(!/e/i.test(dust) && parseFloat(dust) === 0, `fmt() snaps FP dust to 0 (got "${dust}")`);
  ok(parseFloat(fmt(0)) === 0, "fmt(0) is zero");
}

// ============================================================
// Hard limits: every family defines them and they contain the valid range
// (thermocouples intentionally have hard == range: no extrapolation band)
// ============================================================
for (const fam of Object.keys(MODELS)) {
  const cfg = MODELS[fam];
  for (const m of cfg.list) {
    const p = { ...m.p };
    ok(typeof cfg.hard === "function", `${fam}: hard() limits defined`);
    if (typeof cfg.hard !== "function") continue;
    const [lo, hi] = cfg.range(p), [hlo, hhi] = cfg.hard(p);
    ok(hlo <= lo && hhi >= hi, `${fam}/${m.name}: hard limits [${hlo}, ${hhi}] contain range [${lo}, ${hi}]`);
  }
}

// ============================================================
// Integration: every default model must round-trip through MODELS.fwd/rev
// ============================================================
for (const fam of Object.keys(MODELS)) {
  const cfg = MODELS[fam];
  const p = { ...cfg.list[0].p };
  const [lo, hi] = cfg.range(p);
  for (const frac of [0.15, 0.5, 0.85]) {
    let t = lo + (hi - lo) * frac;
    if (fam === "tc" && p.type === "B" && t < 100) t = 100 + (hi - 100) * frac; // B inverse ≥100 °C
    const back = cfg.rev(p, cfg.fwd(p, t));
    near(back, t, 1e-2, `${fam}/${cfg.list[0].name} fwd→rev round-trip @ ${t.toFixed(1)} °C`);
  }
}

// ---- summary ----
console.log(`\n  ${passed} passed, ${failed} failed`);
if (failed) {
  console.log("\n\x1b[31mFailures:\x1b[0m");
  for (const m of fails) console.log("  ✗ " + m);
  process.exit(1);
}
console.log("  \x1b[32mAll reference checks pass.\x1b[0m\n");
