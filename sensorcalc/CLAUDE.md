# CLAUDE.md — sensor::calc

Guidance for Claude Code (and humans) working on this project.

## What this is

A **bidirectional temperature-sensor calculator**. You enter a temperature and get the sensor output (resistance in Ω, or EMF in mV), or you enter the output and get the temperature back. Supported families:

- **RTD** — Pt100/200/500/1000/2000 + Custom A/B (IEC 60751 Callendar–Van Dusen)
- **NTC** — β-model and Steinhart–Hart, with a datasheet-table → S–H coefficient fitter
- **Silicon PTC** — KTY81/84-style quadratic about a per-model reference temperature (`Tref`: 25 °C for KTY81, 100 °C for KTY84 — KTY84 parts are specified at 100 °C)
- **Thermocouple** — types K, J, T, E, N, R, S, B (NIST ITS-90 / IEC 60584-1), as temperature ↔ mV with a settable cold-junction temperature (preserved when switching type)
- **Diode** — linear forward-voltage model V(T) = V25 + k·(T−25); presets are typical (−2 mV/°C silicon rule), both parameters editable for per-part calibration

It also exports a characteristic table as CSV and copies the current reading.

## Golden rule

**This is physics code. Accuracy is the whole point.** The RTD and thermocouple outputs are validated *exactly* against the IEC 60751 and NIST ITS-90 reference tables. Before you change anything in the maths, read "Invariants" below, and after any maths change, re-run the validation (see "Validating changes"). A plausible-looking number that's 0.5 °C off is a failure here, not a rounding detail.

## Layout

It's a **single self-contained file**: `index.html` (renamed from `sensor-calc.html` when the tool moved into the Majklzbastlirny.github.io site repo under `sensorcalc/`). No build step, no bundler, no dependencies except Google Fonts (IBM Plex Mono/Sans). Open it in a browser and it runs. Keep it that way unless there's a strong reason not to — portability is a feature (it gets used on bench laptops with no toolchain).

Run the regression harness from this folder with `node validate.mjs` (it defaults to `./index.html`).

Everything lives in one `<script>`. Navigate by these grep-able section banners:

| Banner / anchor | What's there |
|---|---|
| `Coefficient data + sensor maths` | all the physics |
| `// ---- RTD` | `RTD` const, `rtdR`, `rtdT` |
| `// ---- NTC` | `ntcR_beta`, `ntcT_beta`, `ntcT_sh`, `ntcR_sh` |
| `function solve3` | 3×3 solver, `parseRTtable`, `fitSteinhartHart` (the fitter) |
| `// ---- Silicon PTC` | `ktyR`, `ktyT` |
| `// ---- Thermocouples` | `TC` coefficient object, `polyEval`, `tcEmf`, `tcTempFromEmf` |
| `const MODELS` | the sensor registry (see contract below) |
| `State + UI` | `fam/modelIdx/dir/params`, `fmt`, `fieldMeta`, `standardLabel`, `seedInput`, `buildParams`, `buildFitBox`, `doFit`, `compute` |
| `curve plotting` | `drawCurve` (inline SVG) |
| `wiring` | event listeners |
| `export / copy` | `currentReadingText`, `buildCsv`, `copyText` |

Generic numeric helpers near the maths: `bisectMono(f, target, lo, hi)` (monotonic root-find, used for every reverse solve) and `deriv(f, t)` (numeric derivative, used for sensitivity when a family has no analytic `sens`).

## The MODELS registry (the core abstraction)

Each family is one entry in `MODELS`:

```js
rtd: {
  label, inName, inUnit, outName, outUnit,   // UI copy + units
  sensName, sensUnit,                        // sensitivity metric label
  yLog,                                      // true → log y-axis on curve (NTC)
  standard,                                  // reference string (tag + CSV header)
  list: [ { id, name, p:{...}, editable?:[keys], sh?:bool } ],
  range: (p) => [tmin, tmax],                // valid domain in °C
  hard:  (p) => [lo, hi],                    // physical limits: refuse to compute outside these.
                                             // range < t < hard → extrapolate + warn flag;
                                             // beyond hard → no result + bad flag ("2500 °C on a
                                             // diode" must not print a voltage). TC sets hard ==
                                             // range because ITS-90 polynomials diverge outside.
  fwd:   (p, t)   => output,                 // temperature → Ω or mV
  rev:   (p, val) => temp,                   // Ω or mV → temperature
  sens?: (p, t)   => dOutput/dT,             // optional analytic; else numeric
  extra: (p, t)   => [[k,v],[k,v]]           // fills the 2 lower metric cells
}
```

`p` is the live parameter object for the selected model (a copy of `list[i].p`). `fwd`/`rev` must be true inverses over `range`.

**To add a model to an existing family:** push to `list`. If it needs editable parameters, list their keys in `editable` and make sure `fieldMeta(fam, key)` returns a `[label, unit]` for each.

**To add a whole new family:** add a `MODELS` entry, add a `<button data-fam="…">` to `#familySeg` in the HTML, add the maths functions, and add any new param keys to `fieldMeta`. Then validate.

## Invariants — do not break these

1. **Thermocouple coefficients are mV-scale.** `tcEmf()` returns **millivolts**. The whole chain assumes it:
   - `fwd = tcEmf(type,t) - tcEmf(type,cj)` (mV, cold-junction referenced)
   - `rev = tcTempFromEmf(type, mv + tcEmf(type,cj))`
   - `sens = deriv(tcEmf, t) * 1000` (×1000 only to *display* µV/°C)

   There was a nasty bug where upper J/R/S segments and all of B were in µV while the low segments were in mV. **Never reintroduce a `/1000` or `*1000` in `fwd`/`rev`.** If you regenerate coefficients, regenerate the *whole* `TC` object uniformly (recipe below) — don't hand-patch one segment.

2. **Type B inverse is restricted to ≥100 °C** (`inv:[100,1820]`). Its EMF is non-monotonic below ~42 °C, so a low reading has no unique temperature. Don't widen this range.

3. **`fmt()` snaps `|x| < 1e-9` to 0.** This kills floating-point dust from the reverse solvers (e.g. `rtdT(100,100)` returns `-1.11e-14`, which must display as `0`, not in exponential form). Keep the snap.

4. **RTD `fwd`/`rev` pass `p` as the coefficient override object** (`rtdR(p.R0, t, p)`). Standard elements have no `A`/`B` in `p`, so they fall back to the IEC constants in `RTD`. Custom A/B works by putting `A`/`B` in `p`. Don't "simplify" this back to the global constants or Custom A/B breaks.

5. **`fieldMeta(fam, key)` disambiguates label collisions.** RTD's `B` (Callendar–Van Dusen B coefficient) and NTC's `B` (β) share a key name but mean different things. If you add params, check for key collisions and handle them in `fieldMeta`.

6. **Param inputs get `id="param_<key>"`.** The fitter (`doFit`) updates the a/b/c fields *in place* via these ids instead of rebuilding, because `buildParams` would wipe the fit textarea. Related: `buildParams` runs only on family/model switch, **not** on `compute()` — that's what lets the fit textarea survive while you edit other fields. Don't call `buildParams` from `compute`.

7. **`seedInput()` provides round-trippable defaults** on family and direction switches (reverse mode seeds `fwd(p,25)` so it maps back to ~25 °C). Both `#familySeg` and `#dirSeg` handlers call it. Don't hardcode seed values in the handlers — that reintroduced the `-1.11e-14` bug once already (100 Ω on a Pt100 is exactly 0 °C).

## Validated constants (reference)

- **RTD (IEC 60751, α = 0.00385):** A=3.9083e-3, B=-5.775e-7, C=-4.183e-12. Check points: Pt100 @0 = 100 Ω, @100 = 138.5055 Ω, @-100 = 60.2558 Ω.
- **Thermocouples:** NIST ITS-90 / IEC 60584-1. Validated to 0 µV vs the NIST tables across all types and full ranges. Type K has the exponential (Gaussian) term stored as `exp:[a0,a1,a2]` → adds `a0*exp(a1*(t-a2)^2)`.

## Validating changes

There's no framework; validation is a throwaway Node harness. Pattern:

```bash
# 1) extract the script and syntax-check
python3 -c "import re; open('script.js','w').write(re.search(r'<script>(.*?)</script>', open('sensor-calc.html').read(), re.S).group(1))"
node --check script.js

# 2) to unit-test the maths, cut the script just before the first DOM function
#    (buildModelChips), append module.exports of the pure fns, and require() it.
#    The pure maths (RTD/NTC/KTY/TC/fitter) is all above that line and has no DOM deps.
```

Reference oracles:

- **RTD:** compare against the IEC 60751 table values above; reverse must round-trip.
- **Thermocouples:** install the authoritative NIST package and read its coefficient table:
  ```bash
  pip install thermocouples_reference --break-system-packages
  ```
  In Python: `thermocouples_reference.thermocouples['K'].func.table` gives a list of segments `[lo, hi, coeff_array_highest_power_first_in_mV, gauss_or_None]`. To rebuild the JS `TC` object: **reverse** each coeff array (JS uses ascending order for `polyEval`), keep values in **mV**, and turn `gauss` into `exp:[a0,a1,a2]`. (Note: the package's own `emf_mVC()` currently throws on NumPy 2.x — evaluate the table coefficients directly instead, which is what the JS does.)
- **S–H fitter:** generate points from known a/b/c via `ntcR_sh`, fit, and confirm the coefficients come back (residual ~1e-12 °C for exact input). 3 points → exact; 4+ → least-squares with a real residual.

**Watch for regressions** on the bugs already fixed: (a) TC mV/µV scale mixing, (b) RTD reverse showing `-1.11e-14` instead of `0`, (c) KTY84 anchored at the wrong reference temperature — `ktyR`/`ktyT` take a `tref` argument (default 25) and KTY84-130 must give exactly 1000 Ω at **100 °C**, not at 25 °C. The harness asserts all three.

## Known limitations (by design, not bugs)

- NTC β presets and KTY presets are **typical, not authoritative** — real parts vary; the point of the fitter and the Custom fields is to enter datasheet-specific values.
- Steinhart–Hart is a 3-parameter model, so a 4+-point fit has a small nonzero residual. The reported max/RMS error is the useful signal, not a defect.
- Type B can't be inverted below 100 °C (see invariant 2).
- The curve samples `fwd()` over `range`; families with huge dynamic range (NTC) use a log y-axis (`yLog`).

## Backlog / ideas discussed

- ~~**Per-point residual readout** in the fitter~~ — done: non-exact fits report `max err … @ T °C` via `worstT` in the fitter's return object.
- **Named RTD alpha-grade presets** (US 0.003911, JIS 0.003916). Held off deliberately: the published A/B/C for non-IEC grades vary by source, especially the C term. Only add a grade after sourcing + validating its coefficients against a reference table; until then Custom A/B covers it from the datasheet.
- **Optional refactor for a real test suite:** split the maths into `sensor-math.js` (ES module) and `import` it in the HTML, so validation stops relying on the extract-and-cut trick. Only worth it if the physics starts changing often — the single-file portability is otherwise worth keeping.
- Lead-wire / 2-3-4-wire RTD resistance offset, if bench use ever needs it.

## Aesthetic (keep it consistent)

"Bench instrument": dark graphite panels, IBM Plex Mono for numbers/labels, a single amber accent (`--accent: #ee9b3a`), and a cold→amber→hot gradient reserved for the characteristic curve. All colors are CSS vars in `:root`. Minimal chrome, dense but readable, no decorative animation.
