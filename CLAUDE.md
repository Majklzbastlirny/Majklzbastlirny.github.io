# CLAUDE.md — Railway & Test Tools (Majklzbastlirny.github.io)

Guidance for Claude Code (and humans) working on this repo.

## What this is

A static site (deployed automatically from `main`, no build step) hosting a collection of
independent, self-contained browser tools. Most tools are a single HTML
file with inline CSS/JS. `sprint-ibom` and `vna-viewer` are vendored from external projects
and ship extra files next to `index.html` (see Per-tool notes).
The owner works railway/ETCS commissioning and electronics benches — tools get used offline,
on bench laptops and phones, sometimes from `file://`. Portability and zero dependencies are
features, not accidents.

## Repository layout

```
index.html            landing page (cards linking to every tool)
assets/               shared between tools: html2canvas.min.js, tilt-diagram.png, slope-diagram.png
etcs-v2/              ETCS Inclinometer Helper V2  (flagship tool)
etcs/                 legacy V1 — kept as-is, do not invest in it
uic7/  uic12/         UIC check-digit calculators (Czech UI)
fluke/                Fluke ScopeMeter viewer (Web Serial)
fluke-postscript/     older Fluke viewer — legacy, unlisted on landing page
orientation/          orientation/motion sensor lab
sensorcalc/           temperature sensor calculator (has its own CLAUDE.md + validate.mjs)
sprint-ibom/          Interactive BOM for Sprint Layout — VENDORED from an external repo, see notes
vna-viewer/           NanoVNA Touchstone viewer — VENDORED from an external repo, see notes
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

1. Create `newtool/index.html`, self-contained, dark, with the `← Tools` back link.
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
`C:\Users\Michal\Documents\Sprint-WebiBom\ibom-sprint-project\app`. Changes are made upstream
and re-synced into this repo; anything edited directly in `sprint-ibom/` is lost on the next sync.

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
`C:\Users\Michal\Documents\VNA_Viewer`. Same rule as `sprint-ibom`: change it upstream and
re-sync; edits made directly here are lost on the next sync.

Published subset — upstream also has `make-manifest.js`, `.gitignore`, `.nojekyll` and
`.claude/`, none of which belong on the site:

```
index.html            the whole app, fully inlined (no external CSS/JS at all)
Samples/              bundled .s1p/.s2p sweeps + index.json manifest
capture-nanovna.ps1   named in a UI toast, so it must resolve as a URL
README.md             upstream docs
```

Re-sync procedure:
1. `cp <upstream>/{index.html,README.md,capture-nanovna.ps1} vna-viewer/` and
   `cp -r <upstream>/Samples vna-viewer/`
2. Re-add the back link — the *only* local modification. Immediately after the `  <header>`
   line in `vna-viewer/index.html`, insert:
   `    <a href="../index.html" class="back-to-tools" style="font-size:12px;color:var(--muted);text-decoration:none;white-space:nowrap;align-self:center;" title="Back to Tools">&larr; Tools</a>`
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

## Git / deploy

- Direct commits to `main`; the repo root is served as-is. Push = deploy (~1 min).
- Two deployments watch this repo, both from `main`, both serving the repo root:
  - **Cloudflare Pages** project `michaels-lab-tools` → https://tools.michaels-lab.com/ (primary)
  - **GitHub Pages** → https://majklzbastlirny.github.io/
  Never upload to either by hand — a manual upload silently detaches that copy from the repo.
- History was preserved through the 2026-07 reorganization with `git mv` — use `git mv` for
  any future moves too.
- The repo owner tests on the live site quickly; still, verify locally first (see Testing).
