# Interactive BOM for Sprint Layout

A small, single-page web tool for inspecting and hand-assembling boards
designed in [Abacom Sprint Layout 6](https://www.abacom-online.de/uk/html/sprint-layout.html).
Inspired by KiCad's [InteractiveHtmlBom](https://github.com/openscopeproject/InteractiveHtmlBom).

Open `index.html` in any modern browser, drop a `.lay6` file on the page (or
click *Load .lay6*), and you get:

- a click-to-highlight BOM linked to the board, and vice versa — click a
  pad / trace / refdes on the board and the BOM jumps to that row
- text in Sprint's own stroke font, not an approximation: Sprint stores the
  drawn glyph outlines in the file, so labels are the exact shapes, positions
  and pen widths it would print
- three view modes: **Top**, **Bottom** (mirrored), and **X-Ray** — a
  single combined image that shows top + bottom + inner copper on one canvas,
  with the far side dimmed so the near side reads first
- four-layer support (Cu top, Cu bottom, Inner 1, Inner 2) plus silks and
  outline, each with an individual visibility toggle in the topbar, and a
  toggle that hides every hole (vias, mounting holes, THT drills) so silk
  stays readable
- the **automatic ground plane**, rendered the way Sprint floods it — keep-outs
  at each element's own distance, thermal-pad spokes and all
- **net mode**: click any track or pad and everything electrically connected to
  it lights up. Sprint files contain no netlist, so the nets are worked out
  from the copper itself — which means this works on boards that have no
  components at all
- **part mode**: on a board with no Sprint components (an exploded layout, a
  hand-drawn board, a reverse-engineering trace), click the objects that make
  up a part, name it, and it joins the BOM like any other row
- checkboxes to mark components as *placed* during hand-assembly. Both that
  and any parts you define are saved in your browser's `localStorage`, keyed
  to a hash of the board's own contents — so renaming the file does not lose
  progress, and it stays on your machine
- **name your nets** (GND, +15V, …) as you work a board out; names are saved
  per board and export with every pad as CSV
- a **measure** tool that snaps to pad centres — distance, dx, dy and angle
- a **drill table** that matches Sprint's own Excellon export hole-for-hole,
  including the awkward case of two pads sharing one hole
- **export the current view** as PNG or SVG — exactly what is on screen, and
  the SVG carries its own styling
- search / filter, natural-sorted columns, and CSV export of the whole BOM
- pan with mouse drag, zoom with the wheel; **R** resets the view

## Filling in component values

Sprint Layout's `comment` field is shown as the *Value* column. For boards
that don't carry values (e.g. reverse-engineering exports), drop a sidecar
CSV via the **+ BOM CSV** button:

```csv
refdes,value,package,notes
R1,10k,0805,
R2-R4,4.7k,0805,parallel pull-ups
C7,100nF,0805,
```

- `refdes` accepts a single ref or a comma/space-separated list.
- `value` and `package` are merged in only when the field is empty in the
  `.lay6`, so the `.lay6` always wins where it has data.

## Deployment

Everything is static. Drop the four files (`index.html`, `style.css`,
`lay6.js`, `app.js`) into a folder, on a personal site, or onto GitHub /
Codeberg Pages — no build step, no server, no dependencies. The app makes no
network requests at all once loaded, so your design data never leaves the
browser.

## Keyboard

| key | action |
|-----|--------|
| **R** | reset view |
| **T** / **B** / **X** | top / bottom / x-ray modes |
| **G** | automatic ground plane on / off |
| **N** | net mode — click copper to trace its connections |
| **P** | part mode — click objects to define a BOM part |
| **M** | measure — click two points (snaps to pads) |
| **I** | board info — stats, drill table, image export |
| **Tab** | toggle BOM panel |
| **Esc** | clear selection and net highlight |
| **?** | shortcuts overlay |
| double-click on board | toggle placed |

Net, part and measure mode all take over the board click, so switching one on
switches the others off.

## Known limits

- Ground-plane **cut-out areas** are not rendered. None of the boards available
  during development used one, so there was nothing to verify an
  implementation against.
- Everything tied to a ground plane is, correctly, one net — so clicking a
  ground pad lights up most of the board.
- The `.lay6` format is reverse-engineered (it isn't public). This parser
  started from the field layout in
  [sergey-raevskiy/xlay](https://github.com/sergey-raevskiy/xlay); most of it
  has since been re-derived by comparing against Sprint's own Gerber exports,
  which disagree with that reference in several places. See
  `../reference/lay6-format.md`. Older `.lay` (Sprint 5) files are not
  supported.

## How this is checked

Rendering is verified against Sprint's own Gerber exports rather than by eye:
each layer is rasterised from the app and from the `.gbr`, and the two are
diffed pixel by pixel. On the main test board the copper and silkscreen layers
agree to **99.8%**, the remainder being antialiasing along stroke edges; the
ground plane agrees to 98.7%. If you change the geometry code, redo that
comparison — several long-standing bugs (pads at half size, elongated pads
drawn as circles, full circles where Sprint draws an arc) were invisible until
it existed. The scripts live in `../tools/`.

## License

MIT.
