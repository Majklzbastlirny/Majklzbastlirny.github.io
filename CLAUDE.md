# CLAUDE.md — Railway & Test Tools (Majklzbastlirny.github.io)

Guidance for Claude Code (and humans) working on this repo.

## What this is

A static site (deployed automatically from `main`, no build step) hosting a collection of
independent, self-contained browser tools. Most tools are a single HTML
file with inline CSS/JS. `sprint-ibom`, `vna-viewer` and `etcs-dmi` are vendored from external
projects and ship extra files next to `index.html` (see Per-tool notes).
The owner works railway/ETCS commissioning and electronics benches — tools get used offline,
on bench laptops and phones, sometimes from `file://`. Portability and zero dependencies are
features, not accidents.

## Repository layout

```
index.html            landing page (cards linking to every tool)
assets/               shared between tools: html2canvas.min.js, three.min.js, tilt-diagram.png, slope-diagram.png
etcs-v2/              ETCS Inclinometer Helper V2  (flagship tool)
etcs/                 legacy V1 — kept as-is, do not invest in it
uic7/  uic12/         UIC check-digit calculators (Czech UI)
fluke/                Fluke ScopeMeter viewer (Web Serial)
fluke-postscript/     older Fluke viewer — legacy, unlisted on landing page
orientation/          orientation/motion sensor lab
sensorcalc/           temperature sensor calculator (has its own CLAUDE.md + validate.mjs)
sprint-ibom/          Interactive BOM for Sprint Layout — VENDORED from an external repo, see notes
vna-viewer/           NanoVNA Touchstone viewer — VENDORED from an external repo, see notes
antenna-pattern/      antenna pattern analyzer (has HANDOFF.md + node test.mjs gate)
etcs-dmi/             ETCS DMI symbol catalogue — VENDORED, published subset only, see notes
*.html at root        redirect stubs (meta refresh + location.replace) from the old flat layout
```

## Conventions — follow these when adding or editing tools

1. **One tool = one folder** containing `index.html`. Tool-specific assets live in the tool's
   folder; only genuinely shared files go in `/assets/`.
2. **Link with explicit `index.html`** (`href="etcs-v2/index.html"`, back links `href="../index.html"`).
   Directory-style links (`etcs-v2/`) break when the site is browsed via `file://` — this was a real
   user-reported bug. Never rely on the server resolving a folder to its index.
3. **Every tool gets a back link** to the landing page, top-left, styled to the tool's own theme:
   `← Tools` (or `← Hlavní stránka` in Czech-UI tools).
4. **Landing page card**: add an `<a class="card">` to the appropriate section of `/index.html`
   (Stable, Experimental, or Legacy). The grid wraps automatically; new Experimental entries go
   at the end of the Experimental `.grid` div.
5. **If a tool's URL ever changes, leave a redirect stub** at the old path (copy the pattern from
   any root `*.html` stub: meta refresh + `location.replace` + visible fallback link, relative URLs).
6. **Self-contained pages.** Inline CSS/JS. No CDNs except Google Fonts (used by orientation and
   sensorcalc). Prefer inline SVG over images — `etcs-v2`'s radar drawing is a potrace-traced
   inline SVG precisely so no binary asset is needed.
7. **Dark theme.** The site look is dark; each tool has its own palette but must not be a white
   page. Landing page palette: bg `#0b1220`, card `#10192b`, border `#1a2740`, accent `#6ea8fe`,
   muted `#9aa4b2`. `fluke` reuses exactly this palette; `orientation` uses a GitHub-dark scheme;
   `sensorcalc` has its own "bench instrument" graphite+amber theme (see its CLAUDE.md).
   When styling native controls on a dark page, set `color-scheme: dark`.
8. **Bilingual tools (EN/CZ)**: `etcs-v2` uses a `data-i18n` attribute system with an `i18n`
   object per language. If you change user-facing text there, change it in the HTML default,
   the `en` dict, *and* the `cs` dict. Czech strings in JS use `\uXXXX` escapes — keep that style.
9. **Degrees, ohms, mV**: these are measurement tools. Don't round for cosmetics; follow each
   tool's existing formatting rules. In `sensorcalc`, accuracy is validated against reference
   tables — read `sensorcalc/CLAUDE.md` before touching any maths there and re-run
   `node validate.mjs` after (must be 0 failures; the check count grows with the suite).

## Adding a new tool — checklist

**First decide where it lives.** Two routes, and the cheap one is the default:

- **Straight in this repo** — the tool is one self-contained `index.html` and nothing sits behind
  it that shouldn't be public. This is how every tool but three was built. No sync step, no back
  link to re-apply, no second copy to keep in step: you edit it in place. Small dev files may live
  in the folder too — `sensorcalc` ships its own `CLAUDE.md` and `validate.mjs` — they are simply
  never linked from anywhere.
- **A project in `../upstream/` with a vendored copy here** — only when the tool needs material
  that must *not* be published: large source extracts, licensed documents, vendor assets, test
  fixtures, build scripts. The three that qualify are `sprint-ibom` (test boards and their gerber
  exports), `vna-viewer` (test suite, capture tooling, generated manifest) and `etcs-dmi` (8 MB of
  spec extract including the ERA PDF, of which 1.2 MB ships).

Vendoring costs you something every single update — copy the subset, re-apply the back link, diff
to prove nothing else moved. Only take that on when the project genuinely has unpublishable
material. Size alone is not a reason: `vna-viewer`'s own `index.html` is 124 KB and sits here
happily. If you start a tool in this repo and it later grows fixtures or a build step, moving it
to `upstream/` then is easy; guessing wrong in advance costs more.

1. Create `newtool/index.html`, self-contained, dark, with the `← Tools` back link.
   (Vendored route: build it in `../upstream/newtool/` first, then copy the runtime subset here
   and add the back link — record the published subset and the back-link anchor in Per-tool
   notes, as the other three do.)
2. Add a card to the Experimental section of `/index.html` (icon emoji, `<h2>`, one-sentence `<p>`).
3. If it needs shared assets, reference them as `../assets/...`.
4. Test locally: `npx http-server -p 8931` from the repo root (also click through from the
   landing page), and ideally once via `file://` to catch path assumptions.
5. Commit with a message explaining what the tool does; push to `main` — both Cloudflare Pages
   and GitHub Pages redeploy in about a minute.

## Testing patterns that work here

- **Local server**: `npx --yes http-server -p 8931 -s` from the repo root (background it).
- **Headless verification**: `puppeteer-core` driving the installed Chrome
  (`C:/Program Files/Google/Chrome/Application/chrome.exe`, `headless: 'new'`). Used for:
  screenshot-diffing visual changes (radar mirror), driving UI flows (filling inputs, clicking
  calculate, intercepting download blobs by patching `HTMLAnchorElement.prototype.click`).
  Don't claim a UI fix works without one of these — CSS-transform-on-SVG behavior has burned
  blind fixes before (SVG elements default to `transform-origin: 0 0`; flip inner elements with
  `transform-box: view-box` instead of transforming the `<svg>` itself).
- **sensorcalc**: `cd sensorcalc && node validate.mjs` — must stay at 0 failures.
- Syntax-check big inline scripts after editing: extract `<script>` body to a temp file,
  `node --check`.

## Per-tool notes

### etcs-v2 (flagship)
- Pitch: mean of up to 3 signed inclinometer readings → lookup coefficient from the 0.05°-step
  chart (`pitchChart`), plus precise coefficient `-180·mean + 10000`. Sign convention: ◢ = left
  side of the inclinometer lower = negative; internal sign is independent of the mirror view.
- History: `localStorage` (`etcsV2-history`), records carry summary + raw inputs
  (`rawPitch`/`rawTilt`/`rawSlope`, added 2026-07). `collectRecord()` is the single builder —
  extend it rather than duplicating field reads.
- Export as Image: html2canvas (from `../assets/`), hides toolbar/history during capture.
  Export as TXT: tab-separated, UTF-8 BOM, summary columns then raw columns; exports the live
  unsaved session if history is empty.
- Radar: inline SVG `#radar-img`; mirror = CSS class toggling `scaleX(-1)` on the inner `path`.
- The Pitch and Track Slope sections share the triangle legend via the same i18n keys
  (`legendNeg`/`legendPos`) — edit the strings once and both sections update. Slope also
  carries the cab sign convention (`slopeCabNote`: Cab A lower than Cab B = negative gradient).

### uic7 / uic12
Czech UI. Luhn-style UIC check-digit maths. They cross-link each other
(`../uic12/index.html` ↔ `../uic7/index.html`) — keep both links working.

### fluke
Web Serial API (Chrome/Edge only, needs HTTPS or localhost). Talks to Fluke ScopeMeters:
device query `ID\r\n` at 1200 baud, then PostScript screen dump at the selected baud rate,
parsed for the `image` operator and rendered as 1-bit bitmap with live progress preview.
19200 baud is documented-unstable with IR adapters (warning banner). Serial logic is fragile
bench-tested code — restyle freely, but don't refactor the read loop casually.

### orientation
Three sensor paths: legacy `deviceorientation`/`devicemotion` events, `deviceorientationabsolute`,
and Generic Sensor API classes with per-sensor status rows (that's the diagnostic value — it
distinguishes "permission denied" from "no hardware"). Legacy events own the UI when they deliver
data; generic sensors fill in otherwise. Compass heading sources are ranked
(iOS webkitCompassHeading / deviceorientationabsolute = 3, AbsoluteOrientationSensor = 2,
relative α = 1) — higher rank must never be overwritten by lower. All-null orientation events
(API exists, no sensor) must not count as data.

### sensorcalc
Has its own `CLAUDE.md` (read it) and `validate.mjs` regression harness. Physics validated
against IEC 60751 / NIST ITS-90. Known fixed bugs guarded by tests: TC mV/µV scale mixing,
RTD `-1.11e-14` display dust, KTY84 reference-temperature anchoring (1000 Ω at **100 °C**).
Every family has `hard()` physical limits: extrapolate+warn between `range` and `hard`,
refuse with a bad flag beyond `hard` (thermocouples: hard == range, full ITS-90 spans stay
usable — Type K to 1372 °C, B to 1820 °C). New families must define `hard` (validator enforces).

### sprint-ibom
**Vendored copy — do not edit here.** Upstream source is
`../upstream/sprint-ibom/app` — this repo and `upstream/` are siblings inside the
`Websites-Public` hub. Changes are made upstream and re-synced into this repo; anything edited directly in `sprint-ibom/` is lost on the next sync.

Re-sync procedure:
1. `cp <upstream>/app/* sprint-ibom/`
2. Re-add the back link — it is the *only* local modification. Immediately after the
   `<header class="topbar">` line in `sprint-ibom/index.html`, insert:
   `<a href="../index.html" class="back-to-tools" style="font-size:12px;color:var(--fg-2);text-decoration:none;white-space:nowrap;padding:0 4px;" title="Back to Tools">&larr; Tools</a>`
3. `git diff` to confirm nothing else moved, then commit and push.

Deviates from convention 6 (inline CSS/JS): `style.css`, `lay6.js` and `app.js` stay as separate
files next to `index.html`. Inlining would turn every upstream sync into a manual merge, and the
files are local to the tool folder — no CDNs, no external requests, so the intent of the rule
(self-contained, works offline and from `file://`) still holds.

Upstream keeps `test-boards/`, `tools/` and its own docs; **only `app/` is published.**
The app parses Sprint Layout `.lay6` binaries entirely client-side and renders to inline SVG.

### vna-viewer
**Vendored copy — do not edit here.** Upstream source is
`../upstream/vna-viewer`. Same rule as `sprint-ibom`: change it upstream and
re-sync; edits made directly here are lost on the next sync.

Published subset. Upstream also carries `make-manifest.js`, `docs.md`, `CLAUDE.md`, `test/`,
`tools/`, `.gitignore`, `.nojekyll` and `.claude/` — none are referenced by the app and none
belong on the site. `docs.md` is user-facing prose but nothing links to it, so it stays
upstream; `README.md` already covers the same ground for anyone browsing the repo.

```
index.html            the whole app, fully inlined (no external CSS/JS at all)
Samples/              bundled .s1p/.s2p sweeps + index.json manifest
capture-nanovna.ps1   named in a UI toast, so it must resolve as a URL
README.md             upstream docs
```

Re-sync procedure:
1. `cp <upstream>/{index.html,README.md,capture-nanovna.ps1} vna-viewer/` and
   `cp -r <upstream>/Samples vna-viewer/`
2. Re-add the back link — the *only* local modification. Insert it as the first child of the
   brand block: immediately after the `    <div class="brand">` line in
   `vna-viewer/index.html` (4-space indent, exactly one match — grep to confirm), insert:
   `      <a href="../index.html" class="back-to-tools" style="font-size:12px;color:var(--muted);text-decoration:none;white-space:nowrap;" title="Back to Tools">&larr; Tools</a>`
   It used to go after `  <header>`, but the header now leads with the sidebar toggle, which
   should stay hard-left. Inside `.brand` it baseline-aligns with the title.
3. `git diff` to confirm nothing else moved, then commit and push.

Things that will bite you:
- **`Samples/` is loaded with `fetch()`**, so the Samples button needs a web server and is
  correctly dead on `file://` — the app already detects this and shows a toast telling the user
  to drag the folder in instead. Don't "fix" that.
- **`Samples/index.json` is a generated manifest.** If samples are added or removed, regenerate
  it upstream with `make-manifest.js`; the app reads the manifest, not the directory.
- **Live capture uses Web Serial** — Chrome/Edge over HTTPS or localhost only, same constraint
  as `fluke`. Fine on tools.michaels-lab.com; unavailable from `file://`.
- **Deviates from convention 7 (dark theme).** It defaults to a light palette, with a
  `prefers-color-scheme: dark` block and a manual light/dark toggle in the header. So it follows
  the OS rather than being dark by default, and is a white page for a light-mode user. Left as
  upstream wrote it; forcing dark would mean a second local modification to re-apply every sync.

### etcs-dmi
**Vendored copy — do not edit here.** Upstream source is
`../upstream/etcs-dmi` (it was called `ETCS_WebTool` before the 2026-09-19 consolidation;
despite that old name it is the DMI symbol catalogue, nothing to do with `etcs`/`etcs-v2`,
which are the inclinometer helpers).

Upstream is ~8 MB / 1408 files; **only ~1.2 MB / 185 files are published.** Ship exactly this:

```
index.html   css/   js/   assets/   README.md
```

Deliberately NOT published:
- `index006_-_ERA_ERTMS_015560_v400/` (4.2 MB) — the source extract, including the original
  2.7 MB ERA spec PDF. It is source material, and there is no reason to re-host the spec.
- `alstom/` (2.2 MB, 1037 files) — not referenced by any runtime code. Verified by grep.
- `tools/` — build-time Python/JS (`extract_pdf.py`, `convert_bmps.py`, `verify_*`).

Re-sync procedure:
1. `cp <upstream>/{index.html,README.md} etcs-dmi/` and
   `cp -r <upstream>/{css,js,assets} etcs-dmi/`
2. Re-add the back link — the *only* local modification. Immediately after the
   `<header class="app">` line in `etcs-dmi/index.html`, insert:
   `  <a href="../index.html" class="back-to-tools" style="display:inline-block;margin:0 0 6px;font-size:12px;color:var(--dmi-medgrey);text-decoration:none;" title="Back to Tools">&larr; Tools</a>`
3. `git diff` to confirm nothing else moved, then commit and push.

Notes:
- Images are built as `assets/symbols/<category>/<file>` at runtime, so the whole `assets/` tree
  must come across together. After a sync, load the page and check for broken images — the quick
  test is `[...document.querySelectorAll('img')].filter(i => i.complete && !i.naturalWidth).length`,
  which must be 0 (171 images on the grid, plus more inside the detail dialog).
- Attribution to ERA is in the page footer and in `js/app.js` / `js/i18n_cs.js`. Keep it.
- EN/CZ toggle is its own `i18n_cs.js`, unrelated to `etcs-v2`'s `data-i18n` system.

### antenna-pattern
In-repo tool (not vendored) with its own node regression harness, same shape as `sensorcalc`.
Read `antenna-pattern/HANDOFF.md` before changing anything — it carries the design rationale and
the full reference table.

- **`node test.mjs` from the tool folder is the gate. 17 passed, 0 failed, or the change is
  wrong.** It asserts against textbook values: Si(π)/Ci(π), ½λ dipole self-Z 73.1+j42.5 Ω,
  mutual-Z at 0.5λ, directivities (isotropic 0, short dipole 1.76, ½λ 2.15, 1λ 3.82, ¼λ monopole
  5.16 dBi), ½λ HPBW 78°, 1.5λ lobe splitting off-broadside, and Yagi 3/4/5/6-el at
  8.40 / 9.15 / 9.57 / 10.21 dBi. If a change moves any of these, the change is the bug.
- **`core.mjs` is the physics extracted verbatim from `index.html`.** The page does not load it —
  it exists only so the harness can run in node. Edit the in-page physics and you must re-extract
  `core.mjs`, or the two silently diverge and the gate starts testing the wrong code. Check they
  agree (e.g. the `'5el'` preset line) before trusting a green run.
- The harness already earned its keep: the shipped 5-el Yagi preset had `dirSp:.25`, over-spacing
  the directors to 10.23 dBi — statistically tied with the 6-el and non-monotonic. Retuned to
  `.21` (9.57 dBi). Keep gain increasing with element count when touching presets.
- **Polar plots are absolute dBi, deliberately not normalised**, so a higher-gain antenna pushes
  its lobe outward instead of every pattern filling the plot. HANDOFF.md says explicitly: do not
  "fix" this into normalised plots.
- **Local modification vs upstream:** `HANDOFF.md` says three.js is loaded UMD from cdnjs. Here it
  is `../assets/three.min.js` (r128, vendored 2026-09-19) because convention 6 forbids CDNs and
  these tools get used offline. Do not revert that to the CDN when syncing from a newer zip.
  Google Fonts links stay — convention 6 allows those; they degrade to the local mono/sans stacks
  offline, which is cosmetic only.
- Three.js is load-bearing for the 3D pattern (WebGLRenderer, ~21 `THREE.` references, no
  fallback). Without it that panel is dead, so keep `assets/three.min.js` in step with the
  version the page expects.
- When testing in a browser that has loaded an older copy, **cache-bust** — a stale
  `index.html` will happily show the old 10.23 dBi and look like a failed fix.

## Git / deploy

- Direct commits to `main`; the repo root is served as-is. Push = deploy (~1 min).
- Two deployments watch this repo, both from `main`, both serving the repo root:
  - **Cloudflare Pages** project `michaels-lab-tools` → https://tools.michaels-lab.com/ (primary)
  - **GitHub Pages** → https://majklzbastlirny.github.io/
  Never upload to either by hand — a manual upload silently detaches that copy from the repo.
- History was preserved through the 2026-07 reorganization with `git mv` — use `git mv` for
  any future moves too.
- The repo owner tests on the live site quickly; still, verify locally first (see Testing).
