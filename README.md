# Railway & Test Tools

A small collection of self-contained, browser-based utilities, served via GitHub Pages at
**https://majklzbastlirny.github.io/**. No build step, no backend, no data leaves the browser.

## Tools

| Tool | Path | What it does |
|---|---|---|
| **ETCS Inclinometer Helper V2** | [`/etcs-v2/`](https://majklzbastlirny.github.io/etcs-v2/index.html) | Inclinometer readings → pitch coefficient, tilt and track-slope means for ETCS radar installation. Radar orientation visual with mirror, EN/CZ, history with autosave, PNG + TXT export. |
| **UIC 7-Digit Check Calculator** | [`/uic7/`](https://majklzbastlirny.github.io/uic7/index.html) | Check digit for 7-digit rolling-stock numbers (CZ/DE shorthand marking). |
| **UIC 12-Digit EVN Calculator** | [`/uic12/`](https://majklzbastlirny.github.io/uic12/index.html) | Full European Vehicle Number with type/country code awareness (UIC 438-1/2/3). |
| **Fluke ScopeMeter Viewer** | [`/fluke/`](https://majklzbastlirny.github.io/fluke/index.html) | Receives PostScript screen dumps from older Fluke ScopeMeters over Web Serial (IR optical cable), renders them live, exports PNG. Chrome/Edge only. |
| **Orientation Sensor Lab** | [`/orientation/`](https://majklzbastlirny.github.io/orientation/index.html) | Live readout of deviceorientation / devicemotion / Generic Sensor API — tilt, compass, rotation rate, acceleration, with per-sensor diagnostics. Best on a phone. |
| **sensor::calc** | [`/sensorcalc/`](https://majklzbastlirny.github.io/sensorcalc/index.html) | Bidirectional temperature-sensor calculator: RTD (IEC 60751), NTC (β / Steinhart–Hart + fitter), KTY silicon PTC, thermocouples K–B (ITS-90), diode junctions. |

Legacy, still served: [`/etcs/`](https://majklzbastlirny.github.io/etcs/index.html) (original ETCS helper),
[`/fluke-postscript/`](https://majklzbastlirny.github.io/fluke-postscript/index.html) (older Fluke viewer).

## Layout

One tool = one folder with an `index.html`. Shared assets live in `/assets/`. Root `index.html` is the
landing page; flat `.html` files at the root are redirect stubs kept so pre-reorganization bookmarks
survive. See `CLAUDE.md` for conventions and how to add a tool.

No warranty — bench tools, verify against authoritative references before relying on results.
