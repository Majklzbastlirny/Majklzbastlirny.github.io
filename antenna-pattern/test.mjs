/* test.mjs — regression gate for the antenna physics.
   Run:  node test.mjs   (exit 0 = all green, 1 = something drifted)
   These assert the textbook-validated values from HANDOFF.md. If an intentional
   physics change trips one, the change is almost certainly wrong — re-derive it. */

import {
  Si, Ci, selfZ, mutualZ, buildModel, analyze, YAGI_PRESETS,
} from './core.mjs';

let pass = 0, fail = 0;
const results = [];

// approx-equal assert with absolute tolerance
function near(name, got, want, tol, unit = '') {
  const ok = Number.isFinite(got) && Math.abs(got - want) <= tol;
  results.push({ ok, name, detail: `${fmt(got)}${unit} vs ${want}±${tol}${unit}` });
  ok ? pass++ : fail++;
}
// generic predicate assert
function ok(name, cond, detail = '') {
  results.push({ ok: !!cond, name, detail });
  cond ? pass++ : fail++;
}
const fmt = x => (Number.isFinite(x) ? x.toFixed(2) : String(x));

// helper: directivity (dBi) for a state partial
const D = partial => analyze(buildModel({ ...BASE, ...partial })).D;
const ANA = partial => analyze(buildModel({ ...BASE, ...partial }));
const BASE = { type: 'halfwave', dipoleLen: 0.5, pairSpacing: 0.25, pairPhase: 90,
               colN: 4, colSpacing: 0.65, reflSp: .20, dir1: .20, dirSp: .20, nDir: 1, taper: .004 };

// ---- special integrals ----
near('Si(π)', Si(Math.PI), 1.8519, 0.001);
near('Ci(π)', Ci(Math.PI), 0.0737, 0.001);

// ---- impedances ----
const zs = selfZ(0.5, 0.0032);
near('½λ dipole self-Z  R', zs.re, 73.1, 1.5, ' Ω');
near('½λ dipole self-Z  X', zs.im, 42.5, 2.5, ' Ω');
const zm = mutualZ(0.5);
near('mutual-Z d=0.5λ  R', zm.re, -12.5, 1.5, ' Ω');
near('mutual-Z d=0.5λ  X', zm.im, -29.9, 3.0, ' Ω');

// ---- directivities (dBi) ----
near('isotropic D',        D({ type: 'iso' }),                 0.00, 0.05, ' dBi');
near('short dipole D',     D({ type: 'short' }),               1.76, 0.05, ' dBi');
near('½λ dipole D',        D({ type: 'halfwave' }),            2.15, 0.05, ' dBi');
near('1λ dipole D',        D({ type: 'dipole', dipoleLen: 1.0 }), 3.82, 0.08, ' dBi');
near('¼λ monopole D',      D({ type: 'monopole' }),            5.16, 0.05, ' dBi');

// ---- beamwidth ----
near('½λ dipole HPBW E',   ANA({ type: 'halfwave' }).hpbwE,    78, 1.0, '°');

// ---- lobe splitting: 1.5λ dipole peak leaves broadside ----
const a15 = ANA({ type: 'dipole', dipoleLen: 1.5 });
const broadside = Math.max(a15.Ecut(90), a15.Ecut(270));
ok('1.5λ dipole main lobe is off-broadside',
   a15.eMax - broadside > 1.0,
   `peak ${a15.eMax.toFixed(2)} dBi @ ${a15.ePeak}°, broadside ${broadside.toFixed(2)} dBi`);

// ---- Yagi induced-EMF gains ----
const yagi = (k, want) => near(`Yagi ${k} D`, D({ type: 'yagi', ...YAGI_PRESETS[k] }), want, 0.15, ' dBi');
yagi('3el', 8.40);
yagi('4el', 9.15);
yagi('5el', 9.57);
yagi('6el', 10.21);

// ---- report ----
const RED = '\x1b[31m', GRN = '\x1b[32m', DIM = '\x1b[2m', RST = '\x1b[0m';
console.log('\nAntenna physics regression\n' + '─'.repeat(48));
for (const r of results)
  console.log(`${r.ok ? GRN + ' ✓' : RED + ' ✗'} ${r.name.padEnd(26)}${RST} ${DIM}${r.detail}${RST}`);
console.log('─'.repeat(48));
console.log(`${fail ? RED : GRN}${pass} passed, ${fail} failed${RST}\n`);
process.exit(fail ? 1 : 0);
