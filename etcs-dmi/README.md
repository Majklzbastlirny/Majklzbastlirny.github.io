# ETCS DMI Symbol Catalogue

A self-contained web catalogue of all ETCS Driver Machine Interface symbols from
**ERA_ERTMS_015560 v4.0.0** (CCS TSI Appendix A, index 6): what each symbol means,
where it appears on the DMI, and under which conditions it is displayed.
Also includes the four DMI sounds (chapter 14) with play buttons.

## Run it

Open `index.html` directly in a browser, or serve the folder:

```
python -m http.server 8000
# then open http://localhost:8000
```

Direct links to a symbol work via the hash, e.g. `index.html#MO04`.
URL parameters: `?lang=cs` forces Czech, `?quiz=1` opens the quiz directly,
`?map=1` opens the area map, `?area=B7` opens the area map with an area pre-selected.

## Features

- **EN/CZ toggle** (top right) — all symbol names, display conditions, categories,
  areas and UI are translated (`js/i18n_cs.js`); choice is remembered.
- **Quiz mode** — three difficulty levels: easy (meanings only, distinct options),
  normal (meanings + location questions, 4 options) and hard (6 options drawn from
  similar/related symbols, more location questions). Location questions show the
  DMI layout and you click the area where the symbol appears. Rounds of 10/20,
  optional category filter; missed symbols are stored locally and come up more
  often until answered correctly.
- **Related symbols** in the detail view — grey/yellow automatic-vs-driver-action
  pairs, mode ↔ acknowledgement, level ↔ announcement, track condition ↔ planning
  miniature, enabled ↔ disabled buttons, and functional families.
- **System status messages** (chapter 15, Tables 68–70) — every message with a
  plain-language explanation, start/end conditions and the table 4.7.2 reason row,
  filterable, fully translated.
- **Area map (reverse lookup)** — the "Areas" button opens an interactive DMI
  layout; click any area to list every symbol that can appear there.

## Contents

- `index.html`, `css/style.css`, `js/app.js` — the app (no dependencies, no build step)
- `js/data.js` — all 172 symbol entries + 4 sounds, hand-extracted from the spec
  (symbol tables in chapter 13, display rules in chapters 5, 8, 11, 14)
- `assets/symbols/` — PNG conversions of the official BMP bitmaps
- `assets/sounds/` — the official WAV files
- `index006_-_ERA_ERTMS_015560_v400/` — original ERA package (PDF + BMP + WAV)
- `tools/` — Python helper scripts used to extract the PDF text and convert the bitmaps

## Notes

- `ST07` (BMM reaction inhibition) is specified in Table 61 but its bitmap is not part
  of the published symbol folder — it is shown as a placeholder card.
- `LE_11.bmp` ships in the symbol folder but is not referenced anywhere in v4.0.0
  (legacy "Level 1 announcement acknowledgement"); it is marked accordingly.
- The DMI area map in the detail view uses the touch-screen layout (640×480 grid,
  spec chapter 6); soft-key layouts differ.

Source: [ERA — CCS TSI Appendix A mandatory specifications](https://www.era.europa.eu/era-folder/1-ccs-tsi-appendix-mandatory-specifications-etcs-b4-r1-rmr-gsm-r-b1-mr1-frmcs-b0-ato-b1).
Unofficial study aid — the specification PDF prevails.
