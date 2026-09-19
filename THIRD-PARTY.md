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

## Installation diagrams — `assets/tilt-diagram.png`, `assets/slope-diagram.png`

Radar installation geometry diagrams used by `etcs-v2`. **Not covered by the MIT grant** unless
and until their provenance is confirmed as original work. If they were traced or reproduced from
manufacturer or commissioning documentation, they remain the property of that publisher; if they
are original drawings, this entry can be removed and they fall under MIT with the rest.

## Sprint Layout `.lay6` format — `sprint-ibom/`

The parser is reverse-engineered; the format is not public and the tool is not endorsed by or
affiliated with Abacom. The parser code itself began from
[sergey-raevskiy/xlay](https://github.com/sergey-raevskiy/xlay) and is MIT, as that project is.

## Trademarks

ETCS, ERTMS, Fluke, ScopeMeter, NanoVNA, Sprint Layout, Abacom, UIC and other product or company
names are trademarks of their respective owners. They are used here only to describe what these
tools interoperate with, and imply no affiliation or endorsement.
