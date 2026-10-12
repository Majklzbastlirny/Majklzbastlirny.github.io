# HVAC Protocol Tool — web app (handoff)

> **This file is deployed with the site** (everything in `web/` is served publicly).
> Never put secrets, customer/train data, URLs of private resources, or content from
> the Faiveley/ŠVAG documentation in here.

## What it is

An offline-first PWA for filling HVAC test protocols for Faiveley train HVAC units
(Czech rail units, one technician). The technician walks the train with an **Android
phone** (Chrome, installed to the home screen), records checks, clamp-meter readings
and notes per HVAC unit, and exports a **Czech PDF protocol**. It must also work in a
generic **Windows 11 browser** (Edge/Chrome).

- No server, no accounts, no analytics, no runtime network calls except loading its own
  static files. Protocol data lives **only in the browser's IndexedDB on that device**
  ("phone-only storage" — the user's explicit choice). Backups are manual JSON exports.
- It is the successor of a Python desktop tool that lives in the parent folder
  (`../hvac_gui.py` PyQt6 GUI, `../hvac_protocol.py` CLI + fpdf2 PDF, `../CLAUDE.md`).
  Both read **the same** `steps.toml` and `i18n/*.toml` from this folder and use **the
  same JSON protocol format**. The Python tool is kept as a fallback.
- Plain HTML/CSS/ES modules. **No build step, no npm, no framework.** Libraries are
  vendored in `vendor/`.

## What it does

- Protocol list (home) → protocol (train info + units) → unit form (steps).
- Train = N carriages (`HV1`, `VV`/`VV1..n`, `HV3`); every carriage has a **salon** unit
  (4 checks + 17 measurements), first and last also a **cabin** unit (3 + 14).
- Checks: OK / NOK toggle (tapping the active button clears it). Measurements: decimal
  input accepting `,` or `.`, Enter jumps to the next measurement, ± key on `signed`
  fields, expected range as placeholder, red warning when outside `range`
  (warning only — never blocks, PDF unaffected).
- Calculated values (raw clamp readings minus compressor-heater baseline, compressor
  minus fan currents) shown live.
- Per-step notes (saved live while typing), per-step instructions (bottom sheet on
  phones, side panel on wide screens), EN/CZ UI toggle.
- PDF export (selected units, completeness warning listing empty steps first).
- Save JSON (one protocol, Python-compatible), Back up all (bundle), Import (both),
  "not backed up" reminders, persistent-storage status, install button.
- Offline after the first visit; shows "new version — reload" when a deploy changed files.

## File map

| Path | Role |
|---|---|
| `index.html` | Shell; loads `style.css` and `js/app.js` (module). |
| `style.css` | All styling. Mobile first; `≥1000px` instructions panel, `≥1300px` also unit sidebar; dark mode via `prefers-color-scheme`. |
| `js/app.js` | Routing (`#/`, `#/new`, `#/p/<id>`, `#/p/<id>/<carIdx>/<salon\|cabin>`), views, save pipeline, import/export/backup, PDF flow, SW registration, install prompt. |
| `js/model.js` | Loads `steps.toml`; protocol structure, `calcSalon/calcCabin`, tolerance, number parsing, `normalizeProtocol` (import validation). Port of `../hvac_protocol.py`. |
| `js/i18n.js` | Loads `i18n/<lang>.toml`; `t()` for `[ui]` strings with `{placeholders}`, step/calc labels, instructions renderer. English fallback. |
| `js/store.js` | IndexedDB wrapper + `navigator.storage.persist()`. |
| `js/pdf.js` | Czech PDF with jsPDF; mirrors `generate_pdf()` in `../hvac_protocol.py`. |
| `js/ui.js` | `h()` DOM builder, inline SVG icons, `<dialog>` modals, toast, busy overlay. |
| `sw.js` | Service worker (offline cache + update detection). |
| `steps.toml` | **Shared** step manifest: order, unit, `range`, `raw`, `signed`. Python reads it too. |
| `i18n/en.toml`, `i18n/cs.toml` | **Shared** labels, step instructions, UI strings. Python reads them too. |
| `vendor/jspdf.umd.min.js` | jsPDF 3.0.4 (MIT), lazy-loaded at first PDF export. |
| `vendor/smol-toml.js` | smol-toml 1.9.0 (BSD-3), ESM build from jsDelivr. |
| `fonts/Carlito-*.ttf` | Carlito subset (SIL OFL), metric-compatible with Calibri so the PDF matches the desktop one. Rebuilt by `../tools/make_pdf_font.py`. Calibri itself must not be shipped. |
| `icons/` | PWA icons (generated with PIL). |
| `manifest.webmanifest` | PWA manifest (`start_url`/`scope` = `./`). |

## How it works

### Data and saving
- IndexedDB database `hvac-protocols`, object store `protocols`, keyPath `id`.
  Record: `{ id, protocol, savedAt, backedUpAt }` (ms timestamps).
- All records are loaded into memory at start (`state.records`). Every edit mutates the
  protocol object and calls `markDirty(rec)` → write within 300 ms
  (`SAVE_DELAY_MS`), plus an immediate flush on `visibilitychange` (hidden) and
  `pagehide`. Writes use `{ durability: 'strict' }` and resolve on `oncomplete`.
- App-bar pill: Saved / Saving / **NOT SAVED** (red, retries every 3 s).
- Verified 2026-10-07: hard-killing the browser processes mid-entry (note dialog open,
  number field not blurred) lost nothing typed more than ~0.3 s earlier.
- `needsBackup = !backedUpAt || savedAt > backedUpAt` drives the "not backed up" chips and
  the home banner. Save JSON / Back up all (after share or download) and Import set
  `backedUpAt`.

### Protocol JSON (contract with the Python tool — do not change casually)
```
{ train_id, date "YYYY-MM-DD", ambient_temp number|null, num_carriages,
  carriages: [{ position, label, uic, has_cabin,
                salon: { type, checks{id: "OK"|"NOK"|null}, measurements{id: number|null}, notes{id: text} },
                cabin?: { ...same } }],
  created, modified,            // local ISO time without zone, like Python's isoformat()
  id }                          // web-only UUID; Python ignores and preserves it
```
- Backup bundle: `{ "format": "hvac-protocols-backup", "version": 1, "exported", "protocols": [...] }`.
- Import accepts single protocols (from either app) and bundles, regardless of file
  extension. Match by `id`, else by `train_id + date` → identical: skipped; different:
  Replace / Keep both / Skip dialog. `normalizeProtocol` fills missing manifest steps
  with `null`, drops invalid values, keeps unknown keys.

### Manifest and texts
- `steps.toml` → `M.steps(type)` = checks then measurements, in file order.
- `i18n/<lang>.toml`: `[salon.<id>]` / `[cabin.<id>]` (label, summary, prerequisites,
  tools_needed, procedure, expected, troubleshooting, safety), `[salon_calc.<key>]`,
  `[cabin_calc.<key>]`, `[ui]`. Only `label` is required.
- Languages: `LANGS` / `LANG_NAMES` in `js/app.js`. Default EN, choice stored in
  `localStorage` (`hvac.lang`). The PDF is always Czech.

### PDF
- `generatePdf(protocol, [{carIdx, key}])` → Blob. A4 portrait, one page per unit (auto
  page break at 279 mm), fpdf-style cells (label 120 mm / value 30 / unit 20, row 5.5).
  Sections: Kontroly / Zkoušky · Měření (+ Vypočtené hodnoty) · Surová data z měřidel
  (`raw = true` steps) · Poznámky · footer "Strana X/Y". Values `toFixed(3)`.
- Fonts are fetched, base64-encoded and registered with jsPDF at first export.
- Verified side by side against the Python PDF (identical layout, all Czech
  diacritics, `Ω`, `°C`, `Δ`).

### Offline / updates (`sw.js`)
- On install, fetches **every file in `FILES`** into a new cache `hvac-app-<timestamp>`,
  marks it complete, deletes older caches. Requests are served cache-first; navigations
  get the cached `./`.
- On every app launch (when a SW already controls the page) the page posts
  `check-update`; the SW re-fetches all `FILES` with `cache: 'no-cache'`, compares bytes,
  and if anything changed builds a complete new cache and tells the page →
  "A new version… Reload" banner. If any fetch fails it keeps the current version.
- **There is no version number to bump.** A changed `sw.js` also triggers a normal SW
  update.

### Navigation and dialogs
- Hash routing; `navStack` makes the app-bar back arrow use real `history.back()` when
  the parent is the previous page, so Android's Back button behaves.
- Every `<dialog>` pushes a history entry; Back closes the top dialog instead of leaving
  the page. Note dialog: Cancel restores the original text; Back/Esc keeps what was typed.
- All user/imported text is rendered with `textContent` (no `innerHTML`).

## Deployment

**Pipeline (user's setup):** the whole project folder is a GitHub repository; Cloudflare
Pages is connected to it via Git integration and deploys automatically on every push.
Production URL / repo name are not recorded here — ask the user.

Cloudflare Pages build settings (must be exactly this):

| Setting | Value |
|---|---|
| Framework preset | None |
| Build command | *(empty — if the UI insists, `exit 0`)* |
| Build output directory | **`web`** |
| Root directory | *(empty = repo root)* |

- **Never** set the output directory to the repo root: the repo also contains
  Faiveley/ŠVAG drawings and manuals, `HVAC-Faivelery.xlsx` and `protocols/` (real
  train data). They must never be served.
- The GitHub repo should be **private** (Cloudflare deploys private repos fine).
  **Do not enable GitHub Pages** on it — on the free plan that requires a public repo
  and would publish the whole folder.
- No `_headers` / `_redirects` are needed. Cloudflare redirects `/index.html` → `/`;
  the SW caches `./` for that reason — don't hard-link `index.html` anywhere.
- HTTPS is required for the service worker and persistent storage (Pages provides it).
  All paths are relative, so a sub-path deployment also works.
- Limits are far away (Cloudflare Pages: 25 MiB per file, 20 000 files; this folder is ~1 MB).
- **Rollback:** Cloudflare dashboard → the project → Deployments → *Rollback*. Phones
  pick the rolled-back files up on the next launch like any update. Deploys and rollbacks
  never touch protocol data (IndexedDB is per device).

### After every deploy, check
1. The site loads at the production URL without console errors.
2. `steps.toml`, `i18n/cs.toml`, `vendor/jspdf.umd.min.js`, `fonts/Carlito-Regular.ttf`
   return 200 (a 404 on any `FILES` entry silently breaks offline install/updates).
3. On the phone: open the installed app → "new version — reload" banner → Reload →
   open a protocol → values still there → export a PDF.

## Rules — don't break these

1. **JSON format** stays compatible with `../hvac_protocol.py` (see contract above).
2. **`steps.toml` and `i18n/` stay at these paths** — the Python tool reads
   `web/steps.toml` and `web/i18n/`.
3. **Calculations exist twice**: `calcSalon/calcCabin` here and
   `calc_salon/calc_cabin` in `../hvac_protocol.py`. Change both.
4. **New file the app needs → add it to `FILES` in `sw.js`**, otherwise it's missing
   offline. A `FILES` entry that doesn't exist (404) makes the SW install/update fail.
5. **No build step, no npm, no runtime CDN** — the app must start offline. Vendor any
   new library into `vendor/` with its licence.
6. **IndexedDB schema**: changing the DB name, store or keyPath needs a version bump and
   a migration in `onupgradeneeded`. Never delete or clear the database in code.
7. **No `innerHTML` with data** — notes and imported files are untrusted text.
8. **PDF** stays Czech and visually identical to the Python one (same sizes/sections).
   Only ship OFL-licensed fonts (Carlito).
9. **Czech texts**: `cs.toml` was machine-translated and the `[ui]` block marked
   "doplněno 2026-10; ke kontrole" was written by Claude. The user does a manual review
   pass — point out wrong terminology, but don't silently rewrite Czech wording.
10. **Tolerance ranges** in `steps.toml` are seeded from historical data, **not official
    Faiveley spec**. Don't present them as limits.
11. Single technician: no accounts, no multi-user features, no telemetry. Cloud sync was
    explicitly declined for now (the agreed option if asked later: Cloudflare Pages
    Functions + D1/KV with a secret key).

## Adding things

- **Step:** add to `checks` or a `{ id, unit, range? }` entry in `steps.toml`, and a
  `[salon.<id>]` / `[cabin.<id>]` block to **both** `i18n/en.toml` and `i18n/cs.toml`.
  Appears automatically in web, Python GUI/CLI and both PDFs.
- **Calculated value:** both calc implementations + `[salon_calc.<key>]` /
  `[cabin_calc.<key>]` labels in both TOMLs.
- **UI string:** add the key to `[ui]` in both TOMLs, use `tr('key', {vars})` in `app.js`.
- **Language:** new `i18n/<code>.toml`, add to `LANGS`/`LANG_NAMES` in `js/app.js` and to
  `FILES` in `sw.js`.

## Running and testing locally

```
python -m http.server 8000 -d web      # from the project root
# open http://localhost:8000  (localhost counts as secure: SW + persist work)
```
- A phone opening the PC over plain LAN http gets IndexedDB but **no** service worker or
  persistent storage — test those on the HTTPS deployment.
- Resetting a dev browser: DevTools → Application → *Clear site data*. This **deletes the
  protocols stored in that browser** — export a backup first, and never do it on the
  technician's phone.
- Verification done 2026-10-07 (Playwright driving installed Edge, Pixel 7 emulation +
  1440 px desktop, light/dark): JS calc/tolerance/completeness identical to Python on 25
  real units; import → create → fill → note → Czech toggle → reload persistence;
  Android-Back closes dialogs; PDF + JSON + backup export; backup restore into a clean
  browser; conflict dialog; full offline reload and offline PDF export; update banner
  after a file changed on the server; hard-kill crash test; no horizontal overflow on
  phone screens; web JSON opens in the Python tool. The test scripts were not committed.

## Known limitations

- Data is per device **and** per browser — phone and PC don't see each other's protocols.
  Moving data = Back up all → Import.
- Android Chrome refuses to share `.json` files, so shares use `.txt` (same content;
  Import ignores the extension). The import picker has no `accept` filter on purpose
  (some Android pickers grey out `.json`).
- Persistent storage is usually granted only after installing the app (or with high site
  engagement); otherwise the home footer says "not protected".
- Two tabs editing the same protocol: last write wins (no cross-tab sync).
- "Install app" button needs Chromium's `beforeinstallprompt`; elsewhere use the browser
  menu. `navigator.share` must be called directly inside the click handler (user
  activation).
- Date field uses `<input type="date">` only when the stored date is ISO `YYYY-MM-DD`.

## Backlog (only on request)

Previous-protocol comparison (deltas vs last test of the same train), side-by-side unit
comparison table, technician name + signature block in the PDF, optional Cloudflare sync.
