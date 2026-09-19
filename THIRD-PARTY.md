# Third-party content

The MIT licence in `LICENSE` covers the code in this repository — the tools themselves, their
markup, styling and JavaScript. It does **not** cover everything shipped here. The material below
belongs to other parties and keeps its own terms; MIT cannot be granted over it, and the licence
file should not be read as attempting to.

## ETCS DMI specification content — `etcs-dmi/`

The DMI symbols, sounds and system status messages are © **European Union Agency for Railways**,
from ERA_ERTMS_015560 v4.0.0 (CCS TSI Appendix A, index 6). They are reproduced here as an
unofficial study aid. The published specification is always the authority, and this catalogue has
no official status. Redistributing this folder means redistributing ERA material under ERA's
terms, not under MIT.

## Bundled libraries — `assets/`

| File | Project | Licence |
|---|---|---|
| `three.min.js` | [three.js](https://threejs.org/) r128 | MIT, © three.js authors |
| `html2canvas.min.js` | [html2canvas](https://html2canvas.hertzen.com/) | MIT, © Niklas von Hertzen |

Both are MIT like this repository, but they carry their own copyright notices, which must travel
with them.

## Webfonts — `assets/fonts/`

Chakra Petch, DM Sans, IBM Plex Mono, IBM Plex Sans and JetBrains Mono, all under the
**SIL Open Font License 1.1**, reproduced in `assets/fonts/OFL.txt`. The OFL requires the licence
to accompany the fonts wherever they are redistributed. See `assets/fonts/README.md` for the
copyright holder of each family.

## Manufacturer documentation figures — `etcs-v2`

Three figures in `etcs-v2` are reproduced from proprietary technical manuals. **None of them
are covered by the MIT grant**, and none are mine to relicense:

| Figure | Where | Source |
|---|---|---|
| Radar outline | inline `<svg id="radar-img">` in `etcs-v2/index.html` | DEUTA-WERKE manual — potrace-traced from the manual figure |
| Tilt geometry | `assets/tilt-diagram.png` | Alstom ETCS commissioning and maintenance guide |
| Track slope geometry | `assets/slope-diagram.png` | Alstom ETCS commissioning and maintenance guide |

They are used to show *where on the equipment* a measurement is taken, which is the whole point
of the tool — a number without the reference geometry is not actionable. They are reproduced in
good faith as a working aid for people who already hold the relevant documentation, not as a
substitute for it.

Note that the radar SVG being a *trace* rather than a copy does not change this: a traced
reproduction of a figure is a derivative of it.

If DEUTA-WERKE or Alstom object, these come out. Anyone redistributing this repository is
redistributing their material and should satisfy themselves they may do so. Replacing all three
with original drawings would remove the question entirely — they are simple geometry figures and
redrawing them is not a large job.

## Sprint Layout `.lay6` format — `sprint-ibom/`

The parser is reverse-engineered; the format is not public and the tool is not endorsed by or
affiliated with Abacom. The parser code itself began from
[sergey-raevskiy/xlay](https://github.com/sergey-raevskiy/xlay) and is MIT, as that project is.

## Trademarks

ETCS, ERTMS, Fluke, ScopeMeter, NanoVNA, Sprint Layout, Abacom, UIC and other product or company
names are trademarks of their respective owners. They are used here only to describe what these
tools interoperate with, and imply no affiliation or endorsement.
