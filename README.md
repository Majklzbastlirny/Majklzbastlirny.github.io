# Railway & Test Tools

A small collection of self-contained, browser-based utilities, served at
**https://tools.michaels-lab.com/** (primary) and **https://majklzbastlirny.github.io/**.
No build step, no backend, no data leaves the browser.

Both URLs serve this same repository: Cloudflare Pages deploys `main` to the custom domain, and
GitHub Pages serves it too. Push once, both update.

## Tools

| Tool | Path | What it does |
|---|---|---|
| **ETCS Inclinometer Helper V2** | [`/etcs-v2/`](https://majklzbastlirny.github.io/etcs-v2/index.html) | Inclinometer readings → pitch coefficient, tilt and track-slope means for ETCS radar installation. Radar orientation visual with mirror, EN/CZ, history with autosave, PNG + TXT export. |
| **UIC 7-Digit Check Calculator** | [`/uic7/`](https://majklzbastlirny.github.io/uic7/index.html) | Check digit for 7-digit rolling-stock numbers (CZ/DE shorthand marking). |
| **UIC 12-Digit EVN Calculator** | [`/uic12/`](https://majklzbastlirny.github.io/uic12/index.html) | Full European Vehicle Number with type/country code awareness (UIC 438-1/2/3). |
| **Fluke ScopeMeter Viewer** | [`/fluke/`](https://majklzbastlirny.github.io/fluke/index.html) | Receives PostScript screen dumps from older Fluke ScopeMeters over Web Serial (IR optical cable), renders them live, exports PNG. Chrome/Edge only. |
| **Orientation Sensor Lab** | [`/orientation/`](https://majklzbastlirny.github.io/orientation/index.html) | Live readout of deviceorientation / devicemotion / Generic Sensor API — tilt, compass, rotation rate, acceleration, with per-sensor diagnostics. Best on a phone. |
| **sensor::calc** | [`/sensorcalc/`](https://majklzbastlirny.github.io/sensorcalc/index.html) | Bidirectional temperature-sensor calculator: RTD (IEC 60751), NTC (β / Steinhart–Hart + fitter), KTY silicon PTC, thermocouples K–B (ITS-90), diode junctions. |
| **Interactive BOM — Sprint Layout** | [`/sprint-ibom/`](https://majklzbastlirny.github.io/sprint-ibom/index.html) | Sprint Layout `.lay6` → interactive board view with a linked BOM: highlight parts, trace and name nets, measure distances, drill table, placed-part marks, CSV/PNG/SVG export. Parsed entirely in the browser. |
| **NanoVNA Viewer** | [`/vna-viewer/`](https://majklzbastlirny.github.io/vna-viewer/index.html) | Touchstone `.s1p` / `.s2p` plots — return loss, SWR, impedance, phase, \|S21\|, group delay, Smith chart — with markers, band overlays, limit lines and CSV/PNG export. Live sweeps and calibration over Web Serial (Chrome/Edge, HTTPS or localhost). |
| **ETCS DMI Symbol Catalogue** | [`/etcs-dmi/`](https://majklzbastlirny.github.io/etcs-dmi/index.html) | Every DMI symbol, sound and system status message from ERA_ERTMS_015560 v4.0.0 (CCS TSI Appendix A): search, colour filter, EN/CZ, related-symbol links, reverse lookup by DMI area, quiz mode. |
| **Antenna Pattern Analyzer** | [`/antenna-pattern/`](https://majklzbastlirny.github.io/antenna-pattern/index.html) | Radiation patterns for isotropic, short and ½λ dipoles, ¼λ monopole, phased pairs, collinear arrays and Yagi-Uda: E/H-plane polars plus a 3D lobe, with directivity, beamwidth, front/back and side-lobe readouts in absolute dBi. |
| **Thread Identifier** | [`/thread-id/`](https://majklzbastlirny.github.io/thread-id/index.html) | Caliper readings → thread designation: Ø over the crests, pitch (or a span over N crests) and optional depth, matched against metric, UNC/UNF/UNEF, BSW/BSF, G/NPT pipe, PG, Tr, GL/GPI bottle necks and RF connector threads, external or internal. Warns when two threads are caliper twins. |

Legacy, still served: [`/etcs/`](https://majklzbastlirny.github.io/etcs/index.html) (original ETCS helper),
[`/fluke-postscript/`](https://majklzbastlirny.github.io/fluke-postscript/index.html) (older Fluke viewer).

## Layout

One tool = one folder with an `index.html`. Shared assets live in `/assets/`. Root `index.html` is the
landing page; flat `.html` files at the root are redirect stubs kept so pre-reorganization bookmarks
survive. See `CLAUDE.md` for conventions and how to add a tool.

## Licence

MIT — see [`LICENSE`](LICENSE). That covers the code here.

It does **not** cover everything shipped alongside it: the ETCS DMI symbols are © European
Union Agency for Railways, the measurement geometry figures in `etcs-v2` come from DEUTA-WERKE
and Alstom manuals, and the bundled libraries and webfonts carry their own licences. See
[`THIRD-PARTY.md`](THIRD-PARTY.md) before redistributing any of it.

No warranty — bench tools, verify against authoritative references before relying on results.
