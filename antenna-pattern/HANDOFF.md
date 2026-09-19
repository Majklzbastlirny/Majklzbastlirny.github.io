# Antenna Pattern Analyzer — Handoff

A single self-contained `index.html` (~620 lines, no build step). Open it in a browser; it
runs. Three.js r128 is the only code dependency, and everything else — physics, UI, 2D/3D
rendering — is inline vanilla JS.

**Three.js is loaded from `../assets/three.min.js`, NOT from a CDN.** This tool ships inside
the `Majklzbastlirny.github.io` site, whose conventions forbid CDNs for anything but Google
Fonts (see that repo's `CLAUDE.md`, convention 6). The reason is practical rather than
dogmatic: these tools get used on bench laptops with no network and sometimes straight from
`file://`, and three.js is load-bearing — roughly 21 `THREE.` references with no fallback, so
a CDN miss kills the whole 3D panel. The vendored copy is byte-for-byte the same r128 build
the page was written against. **If you regenerate this file from a chat or an older bundle,
the cdnjs `<script>` tag will come back — re-point it to `../assets/three.min.js`.**

The Google Fonts `<link>`s are fine to keep; that exception is explicit in the convention.
Offline they fall back to the local mono/sans stacks, which is cosmetic only.

The point of the tool: show how antenna **type and gain** reshape the radiation pattern.
The deliberate design choice that everything hangs on is that **polar plots are absolute
dBi, not normalized** — a higher-gain antenna visibly pushes its lobe outward instead of
every pattern being scaled to fill the plot. Don't "fix" this into normalized plots.

---

## How to work on it

- No toolchain. Edit the HTML, reload. `node --check index.html` won't work
  (it's HTML); to sanity-check JS, extract the `<script>` body or keep the offline harness
  approach below.
- The code is intentionally terse (dense one-liners, short names). Match that style or
  refactor a whole section at once — don't leave it half-and-half.
- **Validate physics offline before trusting the UI.** The original build used small
  `.mjs` harnesses in node that import the core math and check against textbook values.
  Recreate that workflow for any change to the physics: copy the relevant functions into a
  `core.mjs`, assert against the reference table below, *then* wire into the page. The UI
  makes it easy to eyeball-approve a wrong number.

### Reference values the physics MUST reproduce (regression table)

| Case | Expected | Notes |
|---|---|---|
| Si(π) | 1.8519 | Simpson integrator |
| Ci(π) | 0.0737 | |
| ½λ dipole self-Z | 73.1 + j42.5 Ω | Balanis, referred to Imax |
| Mutual Z, d=0.5λ | R₂₁≈−12.5, X₂₁≈−30 Ω | Kraus curve, side-by-side ½λ |
| Isotropic D | 0.00 dBi | |
| Short dipole D | 1.76 dBi | |
| ½λ dipole D | 2.15 dBi | |
| 1λ dipole D | 3.82 dBi | |
| ¼λ monopole D | 5.16 dBi | half-space, +3 dB over ½λ |
| ½λ dipole HPBW (E) | 78° | |
| 1.5λ dipole peak | ~317° (off-axis) | lobe splitting, not broadside |
| Yagi 3/4/5/6-el | 8.40 / 9.15 / 9.57 / 10.21 dBi | induced-EMF solve, monotonic |

If a change moves any of these, it's a bug in the change, not the table.

**Run the gate:** `node test.mjs` (green = all pass, exit 1 = drift). `core.mjs` is the
physics extracted *verbatim* from the HTML — if you edit the in-page physics, re-extract
`core.mjs` so the two can't diverge. The harness already caught one real defect: the shipped
5-el Yagi preset had `dirSp:.25`, over-spacing the directors so it produced 10.23 dBi —
statistically tied with the 6-el and non-monotonic. Retuned to `dirSp:.21` (→ 9.57 dBi). If
you re-tune presets, keep gain increasing with element count.

---

## Code map (`index.html`)

Line numbers drift as you edit — search by name.

**Physics core**
- `simpson(f,a,b,n)` L206 — composite Simpson integrator.
- `Si(x)` L208, `Ci(x)` L210 — sine/cosine integrals via Simpson (no coeff tables).
- `selfZ(L,a)` L218 — dipole self-impedance (Balanis), wire radius `a` in λ.
- `mutualZ(d)` L226 — mutual Z of parallel side-by-side ½λ dipoles at spacing `d`.
- `solve(Z,V)` L230 — complex linear solve (Gaussian elim + partial pivot) for `Z·I=V`.
- `elemPat` L240 / `dipolePat(t,L)` L242 — single-element field patterns vs θ.
- `arrayField(t,p,els)` L246 — array factor: sums element pattern × complex current over
  3D element positions `els=[{x,y,z,I:{re,im}}]`. `cx(re,im)` builds complex currents.
- `buildModel(S)` L254 — **the type→geometry dispatcher.** One `case` per antenna type;
  returns `{field(t,p), els, kind, ...}`. This is where a new antenna type is added.
- `yagiGeom(S)` L282 — builds Yagi element x-positions and lengths from the sliders.
- `analyze(M)` L290 — the analyzer. Numerically integrates the sphere (130×130) for
  directivity `D`, then exposes `gain(t,p)`, `Ecut(ang)`, `Hcut(ang)`, and derives HPBW
  (both planes), F/B, side-lobe level, peak directions.

**Coordinate convention (important, easy to break)**
- Physics: element axis = **z (up)**, boom/forward = **x**, θ measured from +Z.
- E-plane = x–z cut, H-plane = azimuth at θ=90°.
- three.js maps **three-Y = physics-Z**: in `build3D` verts are pushed as
  `(r*ux, r*uz, r*uy)`. Any new geometry must respect this or the 3D solid points the wrong
  way relative to the 2D plots.

**State**
- `const S` L~319 — the single source of truth:
  `{type, freqMHz, dipoleLen, pairSpacing, pairPhase, colN, colSpacing, yagiPreset,
    reflSp, dir1, dirSp, nDir, taper, dbSpan, overlay, iso, rot}`.
- `TYPES` L325 — the antenna picker list `{id,n,s}`.
- `YAGI_PRESETS` L335 — named `{reflSp,dir1,dirSp,nDir,taper}` sets.

**UI / render**
- `buildTypes()` L362 — antenna-type buttons.
- `buildParams()` L375 — per-type control panel (the `if(S.type===…)` ladder). Add a type's
  sliders here.
- `slider() / hint() / wireToggle()` — control helpers.
- `updateFreq()` L426 — MHz→λ; scales **physical dims only** (pattern math is in λ).
- `drawPolar(cv,getGain,labels,opts)` L435 — the polar canvas renderer (dB rings, cardinal
  labels, −3 dB markers, filled trace, overlays). `gToR()` L434 maps gain→radius.
- `init3D` L484 / `colormap` L508 / `build3D` L512 / `addAxis` L547 / `animate` L550 — the
  Three.js radiation solid, custom orbit, phosphor colormap, ground plane for monopole.
- `describe()` L559 — the plain-language pattern description.
- `readouts()` L577 — the numeric panel (uses `ANA`, the current analyzer result).
- `recompute()` L591 — rebuild model → analyze → redraw everything. Call after any `S`
  change. `fullRedraw()` L611 also rebuilds the control panels.

---

## Known limitations (be honest about these in any UI copy you add)

- **Analytical model, not NEC2.** Induced-EMF / array-factor. Correct pattern *shapes* and
  ballpark directivity; **not** absolute gain. Assumes lossless elements, no feedline/match,
  and (for monopole) a perfect infinite ground plane.
- Gain readout is directivity − ~0.7 dB (η≈85% assumed), not measured gain.
- F/B is **capped at ">40 dB"** for display — deep nulls (e.g. cardinal cardioid ~126 dB)
  are unphysical to show raw. Keep that cap.
- Mutual-Z model is the classic parallel side-by-side approximation; it's good for Yagi
  spacings but don't push it to weird geometries without re-validating.

---

## Proposed extensions (backlog, with honest feasibility notes)

Ordered by value-for-effort. My candid read on each — some are genuinely easy and worth it,
one is a trap.

### 1. Pattern-data export to CSV — **easy, do this first**
High value for you specifically: lets you diff a modeled pattern against a NanoVNA/rotator
measurement. Add an "Export" button that walks `ANA.gain(t,p)` over a θ/φ grid (or just the
two principal cuts) and downloads CSV via a Blob. ~20 lines, no physics risk. Suggested
columns: `plane,angle_deg,gain_dBi`. Offer both "principal cuts" and "full sphere" modes.

### 2. Beam-steering / progressive phase on arrays — **easy, high demo value**
The engine already takes per-element complex currents, so this is almost free. For the
collinear array (and a new N-element broadside/endfire array), add a "scan angle" slider
that sets a progressive phase `βₙ = -k·d·n·cos(θ_scan)` into each element's `I`. You'll see
the main beam swing and grating lobes appear when `d>λ/2` — a great teaching moment. Watch
the coordinate convention when you pick which axis to steer along.

### 3. S11 / VSWR readout — **medium, and mind the caveat**
Doable but only honestly for the driven-element types, because it needs a feedpoint
impedance and a reference/target impedance (50 Ω). You *have* `selfZ`/`mutualZ`, so:
- Single dipole: `Zin = selfZ(L,a)`.
- Yagi: `Zin` at the driven element = `V_driven / I_driven` from the solve (already
  computed — `M.currents[g.driven]`), which correctly includes parasitic loading.
- Then `Γ=(Zin−Z0)/(Zin+Z0)`, `S11=20log|Γ|`, `VSWR=(1+|Γ|)/(1−|Γ|)`.
Add an optional matching-network toggle later if you want. **Don't** show S11 for isotropic/
short/monopole-idealized cases where the feed model isn't meaningful — grey it out. Also add
a real R+jX feedpoint readout while you're in there; it's the same data.

### 4. Finite ground-plane effects for the monopole — **hard; scope it down or skip**
This is the one to be wary of. Doing it *properly* (radial-wire or lossy Sommerfeld ground)
is a NEC-class problem and not honest to fake in-browser. What you *can* do cheaply and
defensibly is **image theory with a finite circular ground plane**: model the monopole + its
image, then apply the well-known edge-diffraction result that a finite disc tilts the peak
up off the horizon and fills the lower hemisphere — but present it as an *approximation with
a labeled assumption* (perfect but finite disc, diameter in λ as a slider), not as truth.
If you want real lossy-earth behavior, the right move is to export geometry to NEC, not to
reimplement it here. My recommendation: implement the finite-disc image approximation with a
clear caveat, or leave the monopole as-is and spend the effort on 1–3.

### Other ideas worth a line
- **Overlay/compare two antennas** on the same polar plot (you already have the ½λ overlay
  machinery — generalize it to "pin current pattern, switch type, compare").
- **Aperture/parabolic and patch** types if you want to cover microwave gear.
- **Efficiency input** so the gain readout can reflect a real η you measured, instead of the
  fixed 85%.

---

## Definition of done for a physics change
1. Reference table above still passes in an offline node harness.
2. The 2D cuts and 3D solid agree on peak direction (coordinate convention intact).
3. Readouts (D, HPBW, F/B, SLL) are sane for the known cases.
4. No console errors; monopole still shows its ground plane; Yagi presets still match.
