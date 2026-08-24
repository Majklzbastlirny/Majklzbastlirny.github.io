/* app.js — Interactive BOM viewer for Sprint Layout .lay6 files.
 *
 * Single SVG with three view modes:
 *
 *   TOP    – outline + inner + top copper + top silk visible; no mirror
 *   BOTTOM – outline + inner + bottom copper + bottom silk; mirrored horizontally
 *            so the view matches what you see looking at the physical bottom.
 *   X-RAY  – every layer visible, no mirror. Bottom-side layers rendered
 *            dimmed via CSS so the top still reads first.
 *
 * Every renderable object carries data-cid="<componentId>" when it belongs to
 * a component, so clicking any pad, line, or label picks the whole part —
 * not just a 0.5 mm "hit" box.
 */

(() => {
  const { parseLay6, extractComponents, objectBBox, bboxOfObjects, buildNets, objectAt, drillTable,
          OBJ, LAYER, LAYER_NAME, LAYER_KEY, LAYER_IS_TOP, LAYER_IS_BOTTOM, THT_SHAPE } = window.LAY6;

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const UNIT = 10000;
  const MIN_LW_MM = 0.05;

  // Render order, back-to-front. This is also the order layer groups appear in the SVG.
  const Z_ORDER = [LAYER.O, LAYER.S1, LAYER.C1, LAYER.I2, LAYER.I1, LAYER.C2, LAYER.S2];

  // Layers that can carry copper — and therefore an automatic ground plane.
  const IS_COPPER = new Set([LAYER.C1, LAYER.C2, LAYER.I1, LAYER.I2]);

  // Which layers each mode shows by default.
  const MODE_LAYERS = {
    top:    new Set([LAYER.O, LAYER.I1, LAYER.I2, LAYER.C2, LAYER.S2]),
    bottom: new Set([LAYER.O, LAYER.I1, LAYER.I2, LAYER.C1, LAYER.S1]),
    xray:   new Set([LAYER.O, LAYER.C1, LAYER.S1, LAYER.I1, LAYER.I2, LAYER.C2, LAYER.S2]),
  };

  // Layer toggles in the topbar, in display order. `relevantIn` tells which modes
  // this toggle is meaningful in — it is greyed out in the others.
  const LAYER_TOGGLES = [
    { key: 'O',  label: 'Out',     layer: LAYER.O,  cssVar: '--layer-outline',  relevantIn: ['top','bottom','xray'] },
    { key: 'C2', label: 'Cu T',    layer: LAYER.C2, cssVar: '--layer-cu-top',   relevantIn: ['top','xray'] },
    { key: 'S2', label: 'Silk T',  layer: LAYER.S2, cssVar: '--layer-silk-top', relevantIn: ['top','xray'] },
    { key: 'I1', label: 'I1',      layer: LAYER.I1, cssVar: '--layer-i1',       relevantIn: ['top','bottom','xray'] },
    { key: 'I2', label: 'I2',      layer: LAYER.I2, cssVar: '--layer-i2',       relevantIn: ['top','bottom','xray'] },
    { key: 'C1', label: 'Cu B',    layer: LAYER.C1, cssVar: '--layer-cu-bot',   relevantIn: ['bottom','xray'] },
    { key: 'S1', label: 'Silk B',  layer: LAYER.S1, cssVar: '--layer-silk-bot', relevantIn: ['bottom','xray'] },
  ];

  // ---------- state ----------
  let parsed = null;
  let board = null;
  let components = [];
  let compById = new Map();
  let selectedCid = null;
  let placed = new Set();
  let placedKey = '';
  let sortKey = 'refdes';
  let sortDir = 1;
  let searchTerm = '';
  let mode = 'top';                  // 'top' | 'bottom' | 'xray'
  let showPour = true;               // render automatic ground planes
  let netInfo = null;                // { netOf, nets, items, pourNets }
  let netMode = false;               // clicking copper highlights its whole net
  let selectedNet = null;
  let netNames = new Map();          // stable net key -> user's name
  let measureMode = false;
  let measureFrom = null;            // {x, y} in lay units
  let measureTo = null;
  let partMode = false;              // clicking objects builds a new BOM part
  let partPick = new Set();          // object indices picked for the new part
  let userParts = [];                // parts the user defined by hand

  // Synthetic component ids for user-defined parts. Sprint's own ids are a
  // 16-bit field and in practice run from 1 upward, so starting high keeps the
  // two apart even on a board that already has components.
  const USER_CID_BASE = 40000;
  let userLayerHidden = new Set();   // layer keys the user has explicitly hidden

  let vb = { x: 0, y: 0, w: 1, h: 1 };

  // ---------- DOM ----------
  const el = (id) => document.getElementById(id);
  const fileInput    = el('fileInput');
  const bomCsvInput  = el('bomCsvInput');
  const modeButtons  = document.querySelectorAll('.seg-btn[data-mode]');
  const layerSeg     = el('layerSeg');
  const boardEmpty   = el('boardEmpty');
  const boardStage   = el('boardStage');
  const boardLabel   = el('boardLabel');
  const svgBoard     = el('svgBoard');
  const bomBody      = el('bomBody');
  const bomTable     = el('bomTable');
  const bomStats     = el('bomStats');
  const bomPanel     = el('bom');
  const layoutEl     = el('layout');
  const bomToggle    = el('bomToggle');
  const dismissBtn   = el('dismissWelcome');
  const search       = el('search');
  const statusEl     = el('status');
  const resetView    = el('resetView');
  const markAll      = el('markAll');
  const clearMarks   = el('clearMarks');
  const hideViasBtn  = el('hideVias');
  const pourBtn      = el('togglePour');
  const netBtn       = el('toggleNet');
  const partBtn      = el('definePart');
  const measureBtn   = el('measure');
  const infoBtn      = el('boardInfo');
  const infoOverlay  = el('infoOverlay');
  const infoCloseBtn = el('infoClose');
  const netBuilder   = el('netBuilder');
  const netCountEl   = el('netCount');
  const netNameEl    = el('netName');
  const netSaveBtn   = el('netSave');
  const netExportBtn = el('netExport');
  const netListEl    = el('netList');
  const infoStatsEl  = el('infoStats');
  const infoDrillsEl = el('infoDrills');
  const exportBtn    = el('exportBom');
  const partBuilder  = el('partBuilder');
  const pbCount      = el('pbCount');
  const pbRef        = el('pbRef');
  const pbValue      = el('pbValue');
  const pbPackage    = el('pbPackage');
  const pbCreate     = el('pbCreate');
  const pbClear      = el('pbClear');
  const showHelpBtn  = el('showHelp');
  const helpOverlay  = el('helpOverlay');
  const helpCloseBtn = el('helpClose');

  // ---------- helpers ----------
  function $svg(name, attrs = {}) {
    const e = document.createElementNS(SVG_NS, name);
    for (const k in attrs) {
      if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    }
    return e;
  }
  function hashString(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return ('0000000' + (h >>> 0).toString(16)).slice(-8);
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
  }
  function escapeAttr(s) { return escapeHtml(s); }

  // ---------- CSV merge ----------
  function parseCsv(text) {
    const rows = [];
    let i = 0, cell = '', row = [], quoted = false;
    while (i < text.length) {
      const c = text[i];
      if (quoted) {
        if (c === '"') {
          if (text[i+1] === '"') { cell += '"'; i += 2; continue; }
          quoted = false; i++; continue;
        }
        cell += c; i++; continue;
      }
      if (c === '"') { quoted = true; i++; continue; }
      if (c === ',') { row.push(cell); cell = ''; i++; continue; }
      if (c === '\r') { i++; continue; }
      if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++; continue; }
      cell += c; i++;
    }
    if (cell.length || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  function mergeBomCsv(text) {
    if (!components.length) { setStatus('Load a .lay6 file before merging a BOM CSV.'); return; }
    const rows = parseCsv(text).filter(r => r.length && r.some(c => c.trim()));
    if (rows.length < 2) { setStatus('CSV looks empty.'); return; }
    const headers = rows[0].map(h => h.trim().toLowerCase());
    const refIdx = headers.findIndex(h => /^ref(des|erence)?$/.test(h));
    const valIdx = headers.findIndex(h => /^(value|val)$/.test(h));
    const pkgIdx = headers.findIndex(h => /^(package|footprint|pkg)$/.test(h));
    const notesIdx = headers.findIndex(h => /^notes?$/.test(h));
    if (refIdx < 0) { setStatus('CSV missing a "refdes" / "ref" column.'); return; }

    let merged = 0;
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const ref = (row[refIdx] || '').trim();
      if (!ref) continue;
      const refs = ref.split(/[,;\s]+/).filter(Boolean);
      for (const rd of refs) {
        const c = components.find(c => c.refdes === rd);
        if (!c) continue;
        if (valIdx >= 0 && row[valIdx]) c.value = c.value || row[valIdx].trim();
        if (pkgIdx >= 0 && row[pkgIdx]) c.package = c.package || row[pkgIdx].trim();
        if (notesIdx >= 0 && row[notesIdx]) c.notes = row[notesIdx].trim();
        merged++;
      }
    }
    setStatus(`merged ${merged} BOM rows from CSV`);
    renderBom();
  }

  // For component selection (hit-box, highlight halo, focus-on-component) we
  // want the bbox to cover what a human would consider "the part": pads,
  // refdes, AND the silk body outline. We DON'T want it ballooned by silk
  // that's purely decorative (a 3-pin trimmer's round silk ring extends
  // ~3× the pad-triangle's size in both dimensions; including it covers
  // neighbouring parts).
  //
  // Heuristic: include silk-layer geometry on the part EXCEPT when the
  // collective silk bbox is much larger than the pad bbox in BOTH X and Y
  // (>2× each). Real component bodies — radial caps, electrolytics, edge
  // connectors — are big in one dimension OR the other, but rarely both
  // (their pads usually run along one axis of the body). A symmetrical
  // 2D-decorative ring is the exception, and that's what we drop.
  function hitBoxFor(c) {
    if (!board) return null;
    const carrier = board.objects.find(o =>
      o.componentId === c.componentId && o.type === OBJ.TEXT && o.component);

    const pads = c.members.filter(m =>
      m.type === OBJ.THT_PAD || m.type === OBJ.SMD_PAD);
    const padsAndLabel = pads.slice();
    if (carrier) padsAndLabel.push(carrier);

    // A user-defined part has no refdes carrier and may have no pads at all
    // (someone can outline a part from silk alone), so fall back to everything
    // that was picked for it.
    const base = bboxOfObjects(padsAndLabel) || bboxOfObjects(c.members);
    if (!base) return null;

    const silk = c.members.filter(m =>
      (m.type === OBJ.LINE || m.type === OBJ.CIRCLE || m.type === OBJ.POLY)
      && (m.layer === LAYER.S2 || m.layer === LAYER.S1));
    if (!silk.length || !pads.length) return base;

    const padBB = bboxOfObjects(pads);
    const silkBB = bboxOfObjects(silk);
    if (!silkBB) return base;

    // Reference pad dimensions used for the decorative test. Floor avoids a
    // divide-near-zero on standing 2-pin parts (pad bbox can be 1.0×0 mm).
    const padW = Math.max((padBB.maxX - padBB.minX) / UNIT, 0.5);
    const padH = Math.max((padBB.maxY - padBB.minY) / UNIT, 0.5);
    const silkW = (silkBB.maxX - silkBB.minX) / UNIT;
    const silkH = (silkBB.maxY - silkBB.minY) / UNIT;
    if (silkW / padW > 2 && silkH / padH > 2) {
      // Decorative ring (R11 trimmer, etc.) — keep base bbox, don't expand.
      return base;
    }

    // Otherwise the silk is the real body outline — union it with the base.
    return {
      minX: Math.min(base.minX, silkBB.minX),
      minY: Math.min(base.minY, silkBB.minY),
      maxX: Math.max(base.maxX, silkBB.maxX),
      maxY: Math.max(base.maxY, silkBB.maxY),
    };
  }

  // (hitMembersFor previously returned the list used to compute the hit
  // bbox; replaced by hitBoxFor() which does the bbox computation directly.)


  // ---------- rendering ----------

  // Draw a single object into a parent group. opts.mirroredText counter-mirrors
  // text glyphs so they read normally when the parent has scale(-1,1).
  // opts.grow (mm, > 0) switches this from "draw the object" to "draw the
  // keep-out this object punches in an automatic ground plane". Same geometry,
  // fattened by `grow` on every side — which for SVG is just extra stroke
  // width, so the offset is exact and needs no polygon-clipping library.
  // Sprint's own gerber export does precisely this: it fills the board
  // rectangle, then re-draws everything with apertures enlarged by
  // 2*groundDist in clear polarity.
  function renderObject(parent, o, opts = {}) {
    const grow = opts.grow || 0;
    const cid = o.componentId || 0;
    const cidAttr = grow ? null : (cid ? String(cid) : null);
    const CLEAR = 'pour-clear';

    switch (o.type) {
      case OBJ.LINE:
      case OBJ.POLY: {
        if (!o.polyPoints || o.polyPoints.length < 2) return null;
        const pts = o.polyPoints.map(p => `${(p.x/UNIT).toFixed(3)},${(p.y/UNIT).toFixed(3)}`).join(' ');
        const lwMm = Math.max((o.lineWidth || 0) / UNIT, MIN_LW_MM);
        // Sprint's POLY type is always a closed, filled polygon (the editor auto-
        // closes from last point back to first). LINEs and zero-width strokes stay
        // as polylines.
        if (o.type === OBJ.POLY && o.polyPoints.length >= 3) {
          // A zone is filled AND outlined: Sprint's manual notes the outline
          // width sets the corner radius, so the copper reaches lineWidth/2
          // beyond the stored vertices.
          const e = $svg('polygon', {
            points: pts,
            'stroke-width': (lwMm + 2*grow).toFixed(3),
            'data-cid': cidAttr,
          });
          e.setAttribute('class', grow ? CLEAR : 'lay-fill lay-fill-zone');
          if (!grow) e.style.opacity = '0.65';
          parent.appendChild(e);
          return e;
        }
        const e = $svg('polyline', {
          points: pts,
          'stroke-width': (lwMm + 2*grow).toFixed(3),
          'data-cid': cidAttr,
        });
        e.setAttribute('class', grow ? CLEAR + ' pour-clear-open' : 'lay-stroke');
        parent.appendChild(e);
        return e;
      }
      case OBJ.CIRCLE: {
        // A "circle" is really an arc. The two radii give the ring, and the
        // angular extent is hidden in fields that mean something else for
        // every other object type: `lineWidth` is the END angle and the
        // `thStyle` bytes are the START angle, both in millidegrees measured
        // counter-clockwise from east. Equal angles mean a full circle.
        // Verified against Sprint's own export: the arc at (169.5,-12.5)
        // carries start=270 end=90, and the gerber sweeps exactly that.
        const rin  = (o.out || 0) / UNIT;
        const rout = (o.inn || 0) / UNIT;
        const rMid = (rin + rout) / 2;
        const sw   = Math.max(Math.abs(rout - rin), MIN_LW_MM);
        const cx = o.x / UNIT, cy = o.y / UNIT;
        const b = o.thStyleBytes || [0, 0, 0, 0];
        const a0 = ((b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] << 24)) >>> 0) / 1000;
        const a1 = (o.lineWidth >>> 0) / 1000;
        let sweep = ((a1 - a0) % 360 + 360) % 360;

        let e;
        if (sweep < 0.05) {
          e = $svg('circle', {
            cx: cx.toFixed(3), cy: cy.toFixed(3), r: rMid.toFixed(3),
            'stroke-width': (sw + 2*grow).toFixed(3), 'data-cid': cidAttr,
          });
        } else {
          const pt = (deg) => {
            const t = deg * Math.PI / 180;
            return `${(cx + Math.cos(t)*rMid).toFixed(3)} ${(cy + Math.sin(t)*rMid).toFixed(3)}`;
          };
          // Angles are counter-clockwise in board space, and the path is
          // written in board coordinates, so SVG's sweep-flag 1 (positive
          // angle direction) is the one that matches. Checked against the two
          // real arcs on EDC-4, which sweep 270 -> 90 through east: flag 0
          // draws the other half of the ring.
          e = $svg('path', {
            d: `M${pt(a0)} A${rMid.toFixed(3)} ${rMid.toFixed(3)} 0 ${sweep > 180 ? 1 : 0} 1 ${pt(a1)}`,
            'stroke-width': (sw + 2*grow).toFixed(3), 'data-cid': cidAttr,
          });
        }
        e.setAttribute('class', grow ? CLEAR + ' pour-clear-open' : 'lay-stroke');
        parent.appendChild(e);
        return e;
      }
      case OBJ.THT_PAD: {
        // `out` and `inn` are RADII, not diameters — verified against Sprint's
        // own gerber export, where a pad with out=0.90 is flashed with a
        // C1.800 aperture (and Sprint's UI, which shows the diameter, reads
        // 1.80 mm for it). Same convention as CIRCLE objects.
        const x = (o.x / UNIT), y = (o.y / UNIT);
        const r  = ((o.out || 0) / UNIT);
        const rd = ((o.inn || 0) / UNIT);
        const pp = o.polyPoints || [];

        // Standalone pads (no componentId) are vias / mechanical holes. They
        // get a `via` class so the "Hide vias" toggle can collapse them all.
        const padClass = o.componentId ? 'pad' : 'pad via';
        const wrapClass = o.componentId ? '' : 'via-wrap';
        const g = $svg('g', { 'data-cid': cidAttr, class: wrapClass });

        // "Pure drilling": Sprint's manual says setting the inner and outer
        // diameter equal makes a bare mounting hole with no copper ring, drawn
        // with a cross. The gerber confirms it — no copper is exported at all.
        const drillOnly = rd >= r - 1e-6;

        if (grow) {
          // Keep-out for the pour. A bare drilling still clears copper —
          // Sprint's manual: "the drilling of a pad is always free of any
          // copper" — so fall back to the drill radius when there is no ring.
          const rr = Math.max(r, rd) + grow;
          let e;
          if (!drillOnly && pp.length >= 3) {
            e = $svg('polygon', {
              points: pp.map(q => `${(q.x/UNIT).toFixed(3)},${(q.y/UNIT).toFixed(3)}`).join(' '),
              'stroke-width': (2*grow).toFixed(3),
            });
          } else if (!drillOnly && pp.length === 2 && o.thtShape !== THT_SHAPE.ROUND) {
            e = $svg('line', {
              x1: (pp[0].x/UNIT).toFixed(3), y1: (pp[0].y/UNIT).toFixed(3),
              x2: (pp[1].x/UNIT).toFixed(3), y2: (pp[1].y/UNIT).toFixed(3),
              'stroke-width': (2*rr).toFixed(3), fill: 'none',
            });
          } else {
            e = $svg('circle', {
              cx: x.toFixed(3), cy: y.toFixed(3), r: rr.toFixed(3), 'stroke-width': 0,
            });
          }
          e.setAttribute('class', CLEAR);
          parent.appendChild(e);
          return e;
        }

        if (!drillOnly) {
          let shape;
          if (pp.length >= 3) {
            // Square / octagon / rotated pads carry their exact corners, and
            // Sprint exports those same corners as a G36 filled region.
            shape = $svg('polygon', {
              points: pp.map(q => `${(q.x/UNIT).toFixed(3)},${(q.y/UNIT).toFixed(3)}`).join(' '),
            });
          } else if (pp.length === 2 && o.thtShape !== THT_SHAPE.ROUND) {
            // Elongated pad. polyPoints holds the two end centres; Sprint
            // exports it as a stroke of aperture 2·out along that segment,
            // i.e. a stadium. A round linecap reproduces it exactly.
            shape = $svg('line', {
              x1: (pp[0].x/UNIT).toFixed(3), y1: (pp[0].y/UNIT).toFixed(3),
              x2: (pp[1].x/UNIT).toFixed(3), y2: (pp[1].y/UNIT).toFixed(3),
              'stroke-width': (r*2).toFixed(3),
            });
            shape.setAttribute('class', padClass + ' pad-oblong');
          } else {
            shape = $svg('circle', { cx: x.toFixed(3), cy: y.toFixed(3), r: r.toFixed(3) });
          }
          if (!shape.getAttribute('class')) shape.setAttribute('class', padClass);
          g.appendChild(shape);
        }

        const drill = $svg('circle', {
          cx: x.toFixed(3), cy: y.toFixed(3), r: Math.max(rd, 0.05).toFixed(3),
        });
        drill.setAttribute('class', 'pad-drill');
        g.appendChild(drill);

        if (drillOnly) {
          // Sprint marks bare drillings with a cross so they read as holes
          // rather than as unfilled pads.
          const k = $svg('path', {
            d: `M${(x-rd).toFixed(3)} ${y.toFixed(3)}H${(x+rd).toFixed(3)}` +
               `M${x.toFixed(3)} ${(y-rd).toFixed(3)}V${(y+rd).toFixed(3)}`,
            'stroke-width': Math.max(rd * 0.18, MIN_LW_MM).toFixed(3),
          });
          k.setAttribute('class', 'drill-cross');
          g.appendChild(k);
        }

        parent.appendChild(g);
        return g;
      }
      case OBJ.SMD_PAD: {
        // SMD pads carry their real outline in polyPoints: absolute board
        // coordinates with any rotation already baked into the corners.
        // o.x/o.y/o.out/o.inn are only a template origin — on boards where
        // the components have been exploded they are frequently 0, which
        // dumps every such pad on the board origin. Trust polyPoints when
        // the file has them; fall back to the template for older files.
        //
        // SMD pads sit on a single copper layer, so they take that layer's
        // colour (`currentColor`) rather than the silver THT-pad fill used
        // for plated-through pads.
        if (o.polyPoints && o.polyPoints.length >= 3) {
          const pts = o.polyPoints
            .map(p => `${(p.x/UNIT).toFixed(3)},${(p.y/UNIT).toFixed(3)}`).join(' ');
          const e = $svg('polygon', {
            points: pts, 'data-cid': cidAttr,
            'stroke-width': grow ? (2*grow).toFixed(3) : null,
          });
          if (grow && !(2*grow)) e.setAttribute('stroke-width', 0);
          e.setAttribute('class', grow ? CLEAR : 'smd-pad');
          parent.appendChild(e);
          return e;
        }
        const x = (o.x / UNIT), y = (o.y / UNIT);
        const w = (o.out || 0) / UNIT;
        const h = (o.inn || 0) / UNIT;
        // NB: no rotation here. `thsize` on a pad is not an angle at all —
        // it is the thermal-spoke width ratio (see thermalSpokes), which is
        // why it reads as a constant 100 on every non-thermal pad. Rotation
        // for SMD pads lives in polyPoints, which the branch above uses.
        const rot = 0;
        const r = $svg('rect', {
          x: (-w/2 - grow).toFixed(3), y: (-h/2 - grow).toFixed(3),
          width: (w + 2*grow).toFixed(3), height: (h + 2*grow).toFixed(3),
          transform: `translate(${x.toFixed(3)} ${y.toFixed(3)}) rotate(${rot.toFixed(3)})`,
          'data-cid': cidAttr,
          'stroke-width': grow ? 0 : null,
        });
        r.setAttribute('class', grow ? CLEAR : 'smd-pad');
        parent.appendChild(r);
        return r;
      }
      case OBJ.TEXT: {
        if (!o.text) return null;       // skip empty text holders
        const isComponentLabel = !!o.component;

        // Sprint draws text with a stroke font, and it stores the result: a
        // TEXT object's `textObjects` children are LINE records holding the
        // actual glyph polylines, in absolute board coordinates, each with the
        // pen width Sprint used. So there is no font to reconstruct and no
        // metrics to guess — draw the children and the text is pixel-identical
        // to Sprint's own output, for any character in any language.
        //
        // Because the polylines are ordinary board geometry, they need no
        // transform of their own: the world transform flips Y and mirrors
        // bottom-side text exactly the way Sprint does.
        const glyphs = (o.textObjects || []).filter(c => c.polyPoints && c.polyPoints.length >= 2);
        if (glyphs.length) {
          const g = $svg('g', { 'data-cid': cidAttr });
          g.setAttribute('class', grow ? 'glyph-run pour-clear pour-clear-open' : 'glyph-run');
          const pen = (c) => Math.max((c.lineWidth || 0) / UNIT, MIN_LW_MM);
          const path = (c) => c.polyPoints
            .map(p => `${(p.x/UNIT).toFixed(3)},${(p.y/UNIT).toFixed(3)}`).join(' ');
          // A refdes has to stay readable where it crosses a via or a track.
          // `paint-order: stroke fill` did that for <text>; for strokes the
          // equivalent is drawing each polyline twice, fat in the substrate
          // colour first.
          if (!grow && isComponentLabel) {
            for (const c of glyphs) {
              const e = $svg('polyline', {
                points: path(c), 'stroke-width': (pen(c) + 0.30).toFixed(3),
              });
              e.setAttribute('class', 'glyph-halo');
              g.appendChild(e);
            }
          }
          for (const c of glyphs) {
            const e = $svg('polyline', {
              points: path(c), 'stroke-width': (pen(c) + 2*grow).toFixed(3),
            });
            if (!grow) e.setAttribute('class', 'glyph');
            g.appendChild(e);
          }
          parent.appendChild(g);
          return g;
        }

        // Fallback for a TEXT that carries no glyph children. No file seen so
        // far is like this — Sprint always writes them — but a hand-built or
        // truncated file could be, and an approximate label beats none.
        const h = Math.max((o.out || 0) / UNIT, 0.8);
        const rot = (o.thsize || 0);    // degrees (not millidegrees)
        const dx = isComponentLabel ? -h * 0.55 : 0;
        const dyVisual = isComponentLabel ? h * 0.9 : 0;
        const tx = (o.x / UNIT + dx).toFixed(3);
        const ty = (o.y / UNIT + dyVisual).toFixed(3);
        const transform =
          `translate(${tx} ${ty}) scale(1 -1) rotate(${rot}) translate(${-tx} ${-ty})`;
        const t = $svg('text', {
          x: tx, y: ty,
          'font-size': h.toFixed(2),
          'data-cid': cidAttr,
          transform,
        });
        if (grow) {
          t.setAttribute('class', 'pour-clear pour-clear-text');
          t.setAttribute('stroke-width', (2*grow).toFixed(3));
        } else {
          t.setAttribute('class', isComponentLabel ? 'silk-text component-label' : 'silk-text');
        }
        t.textContent = o.text;
        parent.appendChild(t);
        return t;
      }
    }
    return null;
  }

  // A thermal pad stays connected to the ground plane by a few narrow spokes,
  // so it can still be soldered without the plane sinking all the heat.
  //
  // `thStyle` is a bitmask of the 8 possible spoke positions, bit i at i·45°.
  // The spoke width is not stored directly: Sprint keeps the ratio of width to
  // pad radius, scaled by 150. Recovered empirically — the widths this yields
  // (1.002, 1.008, 1.013, 1.015 mm) are exactly the odd C-apertures Sprint
  // generated for KovalDRSSTC's thermal pads, on the nose for all four.
  function thermalSpokes(o, growMm) {
    if (o.thermobarier !== 1) return null;
    const bits = o.thStyleBytes ? o.thStyleBytes[0] : 0;
    if (!bits) return null;                       // mask 0 = fully isolated

    // Centre, reference radius, and "how far to the pad edge in direction a".
    // Round pads carry all three in x/y/out; polygon and SMD pads describe
    // themselves with corners, so take the centroid and shoot a ray.
    const pp = o.polyPoints || [];
    const poly = pp.length >= 3;
    let cx, cy, rRef, edgeAt;
    if (poly) {
      let sx = 0, sy = 0, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const q of pp) {
        sx += q.x; sy += q.y;
        if (q.x < x0) x0 = q.x; if (q.x > x1) x1 = q.x;
        if (q.y < y0) y0 = q.y; if (q.y > y1) y1 = q.y;
      }
      cx = sx / pp.length; cy = sy / pp.length;
      // The width ratio is against half the pad's SHORTEST dimension — that is
      // what reproduces Sprint's own spoke apertures for both of KovalDRSSTC's
      // SMD thermals (10.5x10.5 -> C,8.540 and 2.4x1.2 -> C,1.004).
      rRef = Math.min(x1 - x0, y1 - y0) / 2;
      edgeAt = (a) => rayExit(pp, cx, cy, a) || rRef;
    } else {
      cx = o.x; cy = o.y; rRef = o.out || 0;
      edgeAt = () => rRef;
    }
    const wMm = (o.thsize || 0) * rRef / 1.5e6;
    if (!(wMm > 0)) return null;

    const g = $svg('g');
    for (let i = 0; i < 8; i++) {
      if (!(bits & (1 << i))) continue;
      const a = i * Math.PI / 4;
      const reach = edgeAt(a) / UNIT + growMm + wMm / 2;
      const e = $svg('line', {
        x1: (cx / UNIT).toFixed(3), y1: (cy / UNIT).toFixed(3),
        x2: (cx / UNIT + Math.cos(a) * reach).toFixed(3),
        y2: (cy / UNIT + Math.sin(a) * reach).toFixed(3),
        'stroke-width': wMm.toFixed(3),
      });
      e.setAttribute('class', 'pour-keep');
      g.appendChild(e);
    }
    return g.childElementCount ? g : null;
  }

  // Distance from an interior point to a polygon's boundary along angle `a`.
  function rayExit(pts, cx, cy, a) {
    const dx = Math.cos(a), dy = Math.sin(a);
    let best = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      const ex = q.x - p.x, ey = q.y - p.y;
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-9) continue;
      const t = ((p.x - cx) * ey - (p.y - cy) * ex) / den;
      const u = ((p.x - cx) * dy - (p.y - cy) * dx) / den;
      if (t > 0 && u >= 0 && u <= 1 && t > best) best = t;
    }
    return best;
  }

  // Sprint's "automatic ground plane" is not stored as geometry — the file
  // carries one on/off flag per layer plus a per-object keep-out distance, and
  // the editor floods whatever is left. Reproduce that with an SVG mask: paint
  // the board rectangle white, punch every object on the layer out in black at
  // its own groundDist, and use it to mask a rect of the layer colour.
  //
  // Through-hole pads clear the plane on EVERY copper layer, not just the one
  // they are stored on — the drill goes through the board. Verified against
  // Sprint's gerber, where all 314 of KovalDRSSTC's pads (157 on each copper
  // layer) appear in the clear-polarity section of the bottom-copper file.
  function renderPour(world, layer, defs, layerGroup) {
    if (!board.groundPane || !board.groundPane[layer - 1]) return;
    const x0 = 0, y0 = -(board.sizeY || 0) / UNIT;
    const w = (board.sizeX || 0) / UNIT, h = (board.sizeY || 0) / UNIT;
    if (!(w > 0 && h > 0)) return;

    const id = `pour-mask-${LAYER_KEY[layer]}`;
    const mask = $svg('mask', {
      id, maskUnits: 'userSpaceOnUse',
      x: (x0 - 1).toFixed(3), y: (y0 - 1).toFixed(3),
      width: (w + 2).toFixed(3), height: (h + 2).toFixed(3),
    });
    mask.appendChild($svg('rect', {
      x: x0.toFixed(3), y: y0.toFixed(3), width: w.toFixed(3), height: h.toFixed(3),
      fill: '#fff',
    }));
    for (const o of board.objects) {
      const isThruPad = o.type === OBJ.THT_PAD;
      if (o.layer !== layer && !isThruPad) continue;
      if (isThruPad && !IS_COPPER.has(o.layer)) continue;
      // Distance 0 is Sprint's documented way to say "let this element touch
      // the plane" — there is no keep-out to punch. Skipping is also what
      // keeps a 0 out of renderObject, where a falsy grow means "draw the
      // object normally", which inside a mask would paint the wrong colour.
      const grow = (o.groundDist || 0) / UNIT;
      if (!grow) continue;
      renderObject(mask, o, { grow });
    }
    // Thermal spokes come last, in one pass over the whole board. They have to:
    // a through-hole pad is stored once per copper layer on exploded boards,
    // and the copy that is NOT thermal punches a full ring — which would bury
    // the spokes of the copy that is, if these were emitted per object.
    for (const o of board.objects) {
      const isPad = o.type === OBJ.THT_PAD || o.type === OBJ.SMD_PAD;
      if (!isPad || !IS_COPPER.has(o.layer)) continue;
      if (o.type === OBJ.SMD_PAD && o.layer !== layer) continue;   // SMD is one-sided
      const sp = thermalSpokes(o, (o.groundDist || 0) / UNIT);
      if (sp) mask.appendChild(sp);
    }
    defs.appendChild(mask);

    const fill = $svg('rect', {
      x: x0.toFixed(3), y: y0.toFixed(3), width: w.toFixed(3), height: h.toFixed(3),
      mask: `url(#${id})`,
    });
    fill.setAttribute('class', 'pour');
    // First child, so the layer's own tracks and pads still draw on top of it.
    layerGroup.appendChild(fill);
  }

  // (Re)build the entire SVG for the current mode.
  function renderBoard() {
    while (svgBoard.firstChild) svgBoard.removeChild(svgBoard.firstChild);
    if (!board) return;

    // World transform composition:
    //   * Y-flip (scale(1,-1)) is applied in EVERY mode so Sprint's cartesian
    //     Y-up matches SVG's Y-down convention. Without it the board appears
    //     upside-down.
    //   * In bottom mode we additionally mirror X around the board's centre
    //     so the view matches the physical bottom face.
    //
    //   top / xray:  scale(1 -1)
    //   bottom:      translate(2*cx 0) scale(-1 -1)
    const world = $svg('g', { class: 'world' });
    if (mode === 'bottom' && contentBBox()) {
      world.setAttribute('transform', `translate(${(2*allCx()).toFixed(3)} 0) scale(-1 -1)`);
    } else {
      world.setAttribute('transform', `scale(1 -1)`);
    }

    // Substrate background
    const outlineObjs = board.objects.filter(o => o.layer === LAYER.O);
    if (outlineObjs.length) {
      const bb = bboxOfObjects(outlineObjs);
      if (bb) {
        const sub = $svg('rect', {
          x: (bb.minX / UNIT).toFixed(3),
          y: (bb.minY / UNIT).toFixed(3),
          width: ((bb.maxX - bb.minX) / UNIT).toFixed(3),
          height: ((bb.maxY - bb.minY) / UNIT).toFixed(3),
          rx: '0.2',
        });
        sub.setAttribute('fill', '#1a2030');
        sub.setAttribute('stroke', 'none');
        world.appendChild(sub);
      }
    }

    // Per-layer groups in z-order (back to front).
    // Note: silk layers (S1/S2) are created here but will be re-parented
    // AFTER the pad group below, so refdes labels and other silk markings
    // stay readable on top of THT drill holes / vias.
    const layerGroups = {};
    for (const L of Z_ORDER) {
      const g = $svg('g', { class: `layer-group layer-${LAYER_KEY[L]}`, 'data-layer': L });
      layerGroups[L] = g;
      world.appendChild(g);
    }

    // Automatic ground planes go in first so everything else lands on top.
    const defs = $svg('defs');
    svgBoard.appendChild(defs);
    if (showPour) for (const L of Z_ORDER) {
      if (IS_COPPER.has(L)) renderPour(world, L, defs, layerGroups[L]);
    }

    // Pass 1: lines / polys / circles by layer
    for (const o of board.objects) {
      if (o.type === OBJ.LINE || o.type === OBJ.POLY || o.type === OBJ.CIRCLE) {
        const g = layerGroups[o.layer];
        if (g) renderObject(g, o);
      }
    }

    // Pass 2: SMD pads — on their copper layer
    for (const o of board.objects) {
      if (o.type === OBJ.SMD_PAD) {
        const g = layerGroups[o.layer];
        if (g) renderObject(g, o);
      }
    }

    // Pass 3: text objects on every layer
    for (const o of board.objects) {
      if (o.type === OBJ.TEXT) {
        const g = layerGroups[o.layer];
        if (g) renderObject(g, o);
      }
    }

    // Pass 4: THT pads, always on top (they pass through every layer)
    const padGroup = $svg('g', { class: 'pads-group' });
    for (const o of board.objects) {
      if (o.type === OBJ.THT_PAD) renderObject(padGroup, o);
    }
    world.appendChild(padGroup);

    // Re-append silk layer groups so they render ABOVE the pad group.
    // (appendChild on an existing child moves it to the end of the parent.)
    if (layerGroups[LAYER.S1]) world.appendChild(layerGroups[LAYER.S1]);
    if (layerGroups[LAYER.S2]) world.appendChild(layerGroups[LAYER.S2]);

    // Pass 5: invisible hit-rects per component for reliable click pickup
    const hits = $svg('g', { class: 'hit-layer' });
    for (const c of components) {
      const bb = hitBoxFor(c);
      if (!bb) continue;
      const pad = 0.4 * UNIT;
      const rect = $svg('rect', {
        x: ((bb.minX - pad) / UNIT).toFixed(3),
        y: ((bb.minY - pad) / UNIT).toFixed(3),
        width: ((bb.maxX - bb.minX + 2*pad) / UNIT).toFixed(3),
        height: ((bb.maxY - bb.minY + 2*pad) / UNIT).toFixed(3),
        'data-cid-hit': c.componentId,
      });
      rect.setAttribute('class', 'hit-box');
      hits.appendChild(rect);
    }
    world.appendChild(hits);

    // Net highlight sits under the component halo so the halo stays visible.
    world.appendChild($svg('g', { class: 'net-layer' }));
    world.appendChild($svg('g', { class: 'pick-layer' }));
    world.appendChild($svg('g', { class: 'measure-layer' }));

    // Highlight overlay (populated on selection)
    const hl = $svg('g', { class: 'highlight-layer' });
    world.appendChild(hl);

    svgBoard.appendChild(world);

    // Apply mode + user layer visibility
    applyLayerVisibility();

    // Re-apply the active selection so the halo lives on a fresh SVG
    if (selectedCid) renderHighlight(selectedCid);
    if (selectedNet != null) renderNet(selectedNet);
    if (partPick.size) renderPartPick();
    if (measureFrom) renderMeasure();
  }

  function applyLayerVisibility() {
    const modeSet = MODE_LAYERS[mode];
    for (const L of Z_ORDER) {
      const g = svgBoard.querySelector(`.layer-group[data-layer="${L}"]`);
      if (!g) continue;
      const userHidden = userLayerHidden.has(LAYER_KEY[L]);
      const modeHidden = !modeSet.has(L);
      g.classList.toggle('hidden', userHidden);
      g.classList.toggle('mode-hidden', modeHidden);
    }
  }

  // ---------- mode ----------
  function setMode(newMode) {
    if (!['top','bottom','xray'].includes(newMode)) return;
    mode = newMode;
    boardStage.dataset.mode = mode;
    boardLabel.textContent = mode === 'top' ? 'TOP'
                          : mode === 'bottom' ? 'BOTTOM (mirrored)'
                          : 'X-RAY (combined)';
    modeButtons.forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
    updateLayerSegRelevance();
    if (board) renderBoard();
  }

  function updateLayerSegRelevance() {
    for (const t of LAYER_TOGGLES) {
      const btn = layerSeg.querySelector(`button[data-layer-key="${t.key}"]`);
      if (!btn) continue;
      btn.classList.toggle('disabled', !t.relevantIn.includes(mode));
    }
  }

  // ---------- layer toggles UI ----------
  function buildLayerSeg() {
    layerSeg.innerHTML = '';
    for (const t of LAYER_TOGGLES) {
      const b = document.createElement('button');
      b.className = 'seg-btn active';
      const css = getComputedStyle(document.documentElement);
      const color = css.getPropertyValue(t.cssVar).trim();
      const sw = document.createElement('span');
      sw.className = 'swatch';
      sw.style.background = color;
      sw.style.color = color;
      b.appendChild(sw);
      b.appendChild(document.createTextNode(t.label));
      b.dataset.layerKey = t.key;
      b.title = LAYER_NAME[t.layer];
      b.addEventListener('click', () => {
        if (userLayerHidden.has(t.key)) {
          userLayerHidden.delete(t.key);
          b.classList.add('active');
          b.classList.remove('layer-off');
        } else {
          userLayerHidden.add(t.key);
          b.classList.remove('active');
          b.classList.add('layer-off');
        }
        applyLayerVisibility();
      });
      layerSeg.appendChild(b);
    }
    updateLayerSegRelevance();
  }

  // ---------- BOM ----------
  function renderBom() {
    let rows = components.slice();
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      rows = rows.filter(c =>
        c.refdes.toLowerCase().includes(q) ||
        (c.value || '').toLowerCase().includes(q) ||
        (c.package || '').toLowerCase().includes(q));
    }
    rows.sort((a, b) => {
      let va = a[sortKey] || '', vb = b[sortKey] || '';
      if (sortKey === 'refdes') {
        return naturalCompare(va, vb) * sortDir;
      }
      va = String(va).toLowerCase(); vb = String(vb).toLowerCase();
      return va < vb ? -1*sortDir : va > vb ? 1*sortDir : 0;
    });

    const html = rows.map(c => {
      const isPlaced = placed.has(c.componentId);
      const cls = [
        selectedCid === c.componentId ? 'selected' : '',
        isPlaced ? 'placed' : '',
      ].filter(Boolean).join(' ');
      const value = c.value ? escapeHtml(c.value) : '<span class="empty">—</span>';
      const pkg = c.package ? escapeHtml(c.package) : '<span class="empty">—</span>';
      return `<tr data-cid="${c.componentId}" data-ref="${escapeAttr(c.refdes)}" class="${cls}" tabindex="0">
        <td class="col-mark"><input type="checkbox" tabindex="-1" ${isPlaced ? 'checked' : ''}></td>
        <td class="col-ref">${escapeHtml(c.refdes || '?')}</td>
        <td>${value}</td>
        <td>${pkg}</td>
        <td class="col-side">${c.side}${c.userDefined
          ? ` <button class="row-del" data-del="${c.componentId}" title="Remove this user-defined part">×</button>`
          : ''}</td>
      </tr>`;
    }).join('');
    bomBody.innerHTML = html || emptyBomRow();
    updateStats(rows.length);
    updateSortArrows();
  }

  // A board with no components is normal, not a parse failure: Sprint only
  // creates one when you group objects into a component, and "explode
  // component" dissolves that grouping again. Plenty of layouts — hand-drawn
  // boards, extender cards, reverse-engineering traces — never have any.
  // Say so, instead of leaving an empty panel that looks like a bug.
  function emptyBomRow() {
    if (!board) return '';
    const why = components.length === 0
      ? `This layout has no Sprint <em>components</em> — every object is a
         plain pad, track or label. The board still renders in full; there is
         just nothing to list. Sprint creates components when you group
         objects and give them a name, and "explode component" removes that
         grouping again.`
      : `No component matches <strong>${escapeHtml(searchTerm)}</strong>.`;
    return `<tr class="bom-empty"><td colspan="5">${why}</td></tr>`;
  }

  function updateStats(visibleCount) {
    const n = components.length;
    const np = placed.size;
    const pct = n ? Math.round(100 * np / n) : 0;
    if (!n) {
      bomStats.innerHTML = `<span>${board ? 'no components in this file' : 'no file loaded'}</span>`;
      return;
    }
    bomStats.innerHTML = `
      <span>${visibleCount}/${n} comp${n===1?'':'s'} · ${np} placed · ${pct}%</span>
      <span class="progress"><i style="width:${pct}%"></i></span>
    `;
  }

  function updateSortArrows() {
    bomTable.querySelectorAll('thead th').forEach(th => {
      const a = th.querySelector('.sort-arrow');
      if (!a) return;
      if (th.dataset.sort === sortKey) a.textContent = sortDir > 0 ? '↑' : '↓';
      else a.textContent = '';
    });
  }

  function naturalCompare(a, b) {
    return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
  }

  // ---------- user-defined parts ----------
  //
  // Boards with no Sprint components are common and legitimate — exploded
  // footprints, hand-drawn layouts, an extender card that is nothing but
  // pads and tracks. Sprint leaves nothing behind to reconstruct them from:
  // its `groups[]` field is the generic "group these objects" feature, and on
  // real files it holds silk-only groups and 62-pad connector blobs just as
  // often as anything footprint-shaped. So rather than guess, let the user say
  // what a part is; the result then behaves like any other BOM row.

  function partsKey() { return 'ibom-sprint:parts:' + placedKey; }

  function loadUserParts() {
    userParts = [];
    if (!placedKey) return;
    try {
      const raw = localStorage.getItem(partsKey());
      if (!raw) return;
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) userParts = arr.filter(p =>
        p && Array.isArray(p.objIdx) && p.objIdx.every(i => i >= 0 && i < board.objects.length));
    } catch (_) {}
  }
  function saveUserParts() {
    if (!placedKey) return;
    try { localStorage.setItem(partsKey(), JSON.stringify(userParts)); } catch (_) {}
  }

  // Tag the picked objects with the part's id so every existing mechanism —
  // data-cid on the rendered SVG, member lookup, the halo — just works.
  function applyUserParts() {
    for (const p of userParts)
      for (const i of p.objIdx)
        if (board.objects[i]) board.objects[i].componentId = p.cid;
  }

  function userPartComponents() {
    return userParts.map(p => {
      const members = p.objIdx.map(i => board.objects[i]).filter(Boolean);
      const bb = bboxOfObjects(members);
      const layer = members.length ? members[0].layer : LAYER.S2;
      return {
        refdes: p.refdes || '?', package: p.package || '', value: p.value || '',
        componentId: p.cid,
        x: bb ? (bb.minX + bb.maxX) / 2 : 0,
        y: bb ? (bb.minY + bb.maxY) / 2 : 0,
        rotation: 0, layer,
        side: LAYER_IS_BOTTOM[layer] ? 'bottom' : 'top',
        members, userDefined: true,
      };
    });
  }

  function rebuildComponents() {
    applyUserParts();
    components = extractComponents(board).concat(userPartComponents());
    compById = new Map(components.map(c => [c.componentId, c]));
  }

  // Pick the object under the point, preferring pads and then the smallest
  // thing that contains it. Pads come first because they are what someone
  // actually aims at when outlining a part, and a silk ring drawn around a pad
  // can easily have the tighter bounding box of the two.
  function pickAnyObject(x, y, slack) {
    let best = -1, bestRank = Infinity, bestArea = Infinity;
    for (let i = 0; i < board.objects.length; i++) {
      const o = board.objects[i];
      if (o.layer === LAYER.O) continue;              // never pick the board outline
      // Anything that already belongs to a component — one of Sprint's own, or
      // a part defined earlier — is off limits. componentId is what ties an
      // object to its part, so letting a second part claim it would quietly
      // shrink the first one's hit-box and leave the object orphaned when
      // either part is deleted.
      if (o.componentId) continue;
      const bb = objectBBox(o);
      if (!bb) continue;
      if (x < bb.minX - slack || x > bb.maxX + slack ||
          y < bb.minY - slack || y > bb.maxY + slack) continue;
      const rank = (o.type === OBJ.THT_PAD || o.type === OBJ.SMD_PAD) ? 0
                 : (o.type === OBJ.TEXT) ? 2 : 1;
      const area = (bb.maxX - bb.minX + 2*slack) * (bb.maxY - bb.minY + 2*slack);
      if (rank < bestRank || (rank === bestRank && area < bestArea)) {
        bestRank = rank; bestArea = area; best = i;
      }
    }
    return best;
  }

  function togglePick(idx) {
    if (idx < 0) return;
    const o = board.objects[idx];
    // Sprint's own grouping is a good shortcut when it exists: if the clicked
    // object belongs to a group, take the whole group in one click.
    const grp = (o.groups && o.groups.length) ? o.groups[0] : null;
    const batch = [];
    if (grp != null) {
      board.objects.forEach((q, i) => { if (q.groups && q.groups.includes(grp)) batch.push(i); });
    }
    if (!batch.length) batch.push(idx);
    const removing = partPick.has(idx);
    for (const i of batch) { if (removing) partPick.delete(i); else partPick.add(i); }
    renderPartPick();
  }

  function renderPartPick() {
    const layer = svgBoard.querySelector('.pick-layer');
    if (layer) {
      while (layer.firstChild) layer.removeChild(layer.firstChild);
      const g = $svg('g');
      g.setAttribute('class', 'pick-hl');
      for (const i of partPick) renderObject(g, board.objects[i]);
      g.querySelectorAll('[data-cid]').forEach(e => e.removeAttribute('data-cid'));
      layer.appendChild(g);
    }
    const n = partPick.size;
    pbCount.textContent = n ? `${n} object${n===1?'':'s'} picked` : 'nothing picked yet';
    pbCreate.disabled = !n || !pbRef.value.trim();
  }

  function createUserPart() {
    const refdes = pbRef.value.trim();
    if (!refdes || !partPick.size) return;
    const cid = USER_CID_BASE + userParts.reduce((m, p) => Math.max(m, p.cid - USER_CID_BASE + 1), 1);
    userParts.push({
      cid, refdes, value: pbValue.value.trim(), package: pbPackage.value.trim(),
      objIdx: [...partPick].sort((a, b) => a - b),
    });
    saveUserParts();
    partPick.clear();
    pbRef.value = ''; pbValue.value = ''; pbPackage.value = '';
    rebuildComponents();
    renderBoard();
    renderBom();
    renderPartPick();
    setStatus(`added ${refdes} to the BOM`);
  }

  function deleteUserPart(cid) {
    const p = userParts.find(q => q.cid === cid);
    if (!p) return;
    for (const i of p.objIdx) if (board.objects[i]) board.objects[i].componentId = 0;
    userParts = userParts.filter(q => q.cid !== cid);
    placed.delete(cid);
    saveUserParts(); savePlaced();
    if (selectedCid === cid) selectComponent(null);
    rebuildComponents();
    renderBoard();
    renderBom();
    setStatus(`removed ${p.refdes}`);
  }

  // ---------- downloads ----------
  function download(text, mime, suffix) {
    const blob = new Blob([text], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (currentFileName || 'board').replace(/\.lay6$/i, '') + suffix;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  // ---------- board info ----------
  function showBoardInfo() {
    if (!board) { setStatus('load a board first'); return; }
    const bb = contentBBox();
    const counts = {};
    for (const o of board.objects) {
      const k = Object.keys(OBJ).find(n => OBJ[n] === o.type) || o.type;
      counts[k] = (counts[k] || 0) + 1;
    }
    const layers = {};
    for (const o of board.objects) layers[LAYER_NAME[o.layer] || o.layer] =
      (layers[LAYER_NAME[o.layer] || o.layer] || 0) + 1;
    const row = (k, v) => `<div><dt>${k}</dt><dd>${v}</dd></div>`;
    infoStatsEl.innerHTML =
      row('File', escapeHtml(currentFileName || '\u2014')) +
      row('Board size', `${(board.sizeX/UNIT).toFixed(1)} \u00d7 ${(board.sizeY/UNIT).toFixed(1)} mm`) +
      (bb ? row('Content extent',
        `${((bb.maxX-bb.minX)/UNIT).toFixed(1)} \u00d7 ${((bb.maxY-bb.minY)/UNIT).toFixed(1)} mm`) : '') +
      row('Objects', board.numObjects) +
      row('Components', components.length) +
      row('Nets', netInfo ? netInfo.nets.length : 0) +
      row('Named nets', [...netNames.keys()].filter(k => netInfo && netInfo.netKeys.includes(k)).length) +
      row('By type', Object.entries(counts).map(([k,v]) => `${k} ${v}`).join(', ')) +
      row('By layer', Object.entries(layers).map(([k,v]) => `${k} ${v}`).join(', '));

    const t = drillTable(board);
    const total = t.reduce((a, r) => a + r.count, 0);
    infoDrillsEl.innerHTML = t.length
      ? `<table class="drill-table"><thead><tr><th>Ø mm</th><th>holes</th><th>plated</th><th>no ring</th></tr></thead><tbody>` +
        t.map(r => `<tr><td>${r.mm.toFixed(2)}</td><td>${r.count}</td><td>${r.plated}</td><td>${r.bare || ''}</td></tr>`).join('') +
        `<tr class="sum"><td>total</td><td>${total}</td><td></td><td></td></tr></tbody></table>` +
        (t.conflicts ? `<p class="info-note warn">${t.conflicts} hole${t.conflicts===1?'':'s'} ` +
          `${t.conflicts===1?'is':'are'} specified twice at different diameters. Sprint drills the ` +
          `one under the larger pad, which is what is counted here \u2014 worth checking before ` +
          `you drill.</p>` : '')
      : '<p class="info-note">This board has no drilled holes.</p>';
    infoOverlay.hidden = false;
  }

  // ---------- view export ----------
  // Everything the app can hand back has to work from a file:// page, so no
  // network requests: the stylesheet cannot be fetched and inlined. Instead
  // each element's *computed* style is copied onto it, which is better anyway
  // — it resolves currentColor and every CSS variable, so the result stands
  // alone with no classes to honour.
  const EXPORT_PROPS = ['fill', 'stroke', 'stroke-width', 'stroke-linecap',
                        'stroke-linejoin', 'opacity', 'fill-opacity', 'stroke-opacity',
                        'font-family', 'font-size', 'font-weight', 'text-anchor',
                        'dominant-baseline', 'paint-order', 'mask'];
  function inlineStyles(liveRoot, cloneRoot) {
    const live = [liveRoot, ...liveRoot.querySelectorAll('*')];
    const cl = [cloneRoot, ...cloneRoot.querySelectorAll('*')];
    for (let i = 0; i < live.length; i++) {
      const cs = getComputedStyle(live[i]);
      const c = cl[i];
      if (!c) continue;
      if (cs.display === 'none') { c.remove(); continue; }
      let css = '';
      for (const prop of EXPORT_PROPS) {
        const v = cs.getPropertyValue(prop);
        if (v && v !== 'normal' && v !== 'auto' && v !== 'none' || (v === 'none' && prop === 'fill'))
          css += `${prop}:${v};`;
      }
      c.setAttribute('style', css);
      c.removeAttribute('class');
    }
  }

  function buildExportSvg() {
    const clone = svgBoard.cloneNode(true);
    inlineStyles(svgBoard, clone);
    // hit targets are invisible helpers, not artwork
    clone.querySelectorAll('[data-cid-hit]').forEach(e => e.remove());
    const vb = svgBoard.getAttribute('viewBox').split(/\s+/).map(Number);
    clone.setAttribute('xmlns', SVG_NS);
    clone.setAttribute('width', vb[2].toFixed(3) + 'mm');
    clone.setAttribute('height', vb[3].toFixed(3) + 'mm');
    clone.removeAttribute('id');
    const bg = document.createElementNS(SVG_NS, 'rect');
    bg.setAttribute('x', vb[0]); bg.setAttribute('y', vb[1]);
    bg.setAttribute('width', vb[2]); bg.setAttribute('height', vb[3]);
    bg.setAttribute('fill', getComputedStyle(boardStage).backgroundColor || '#0c0f13');
    clone.insertBefore(bg, clone.firstChild);
    return { text: new XMLSerializer().serializeToString(clone), vb };
  }

  function exportView(kind) {
    if (!board) { setStatus('load a board first'); return; }
    const { text, vb } = buildExportSvg();
    if (kind === 'svg') {
      download(text, 'image/svg+xml;charset=utf-8', '-view.svg');
      setStatus('exported view as SVG');
      return;
    }
    const W = 2000, H = Math.max(1, Math.round(W * vb[3] / vb[2]));
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      c.getContext('2d').drawImage(img, 0, 0, W, H);
      c.toBlob((blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = (currentFileName || 'board').replace(/\.lay6$/i, '') + '-view.png';
        document.body.appendChild(a); a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
        setStatus(`exported view as PNG (${W}\u00d7${H})`);
      }, 'image/png');
    };
    img.onerror = () => setStatus('could not rasterise the view');
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(text)));
  }

  // ---------- CSV export ----------
  function bomToCsv() {
    const esc = (v) => {
      const t = String(v == null ? '' : v);
      return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
    };
    const rows = [['refdes', 'value', 'package', 'side', 'placed', 'source']];
    for (const c of components.slice().sort((a, b) => naturalCompare(a.refdes, b.refdes)))
      rows.push([c.refdes, c.value || '', c.package || '', c.side,
                 placed.has(c.componentId) ? 'yes' : 'no',
                 c.userDefined ? 'user' : 'lay6'].map(esc));
    return rows.map(r => r.join(',')).join('\r\n') + '\r\n';
  }

  // ---------- selection / highlight ----------
  function selectComponent(cid, opts = {}) {
    selectedCid = cid;

    bomBody.querySelectorAll('tr[data-cid]').forEach(tr => {
      tr.classList.toggle('selected', Number(tr.dataset.cid) === cid);
    });
    if (cid && opts.scrollBom !== false) {
      const row = bomBody.querySelector(`tr[data-cid="${cid}"]`);
      if (row && typeof row.scrollIntoView === 'function') {
        try { row.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (_) {}
      }
    }

    renderHighlight(cid);

    if (cid) {
      const c = compById.get(cid);
      const placedStr = placed.has(c.componentId) ? '  •  PLACED' : '';
      setStatus(`${c.refdes}   ${c.value || '—'}   ${c.package || '—'}   ${c.side.toUpperCase()}${placedStr}`);
    } else {
      setStatus('');
    }
  }

  function renderHighlight(cid) {
    svgBoard.querySelectorAll('.member-hl').forEach(e => e.classList.remove('member-hl'));
    const hl = svgBoard.querySelector('.highlight-layer');
    if (hl) { while (hl.firstChild) hl.removeChild(hl.firstChild); }
    if (!cid) return;
    svgBoard.querySelectorAll(`[data-cid="${cid}"]`).forEach(e => e.classList.add('member-hl'));
    const comp = compById.get(cid);
    if (!comp || !hl) return;
    const bb = hitBoxFor(comp);
    if (!bb) return;
    const pad = 0.4 * UNIT;
    const rect = $svg('rect', {
      x: ((bb.minX - pad) / UNIT).toFixed(3),
      y: ((bb.minY - pad) / UNIT).toFixed(3),
      width: ((bb.maxX - bb.minX + 2*pad) / UNIT).toFixed(3),
      height: ((bb.maxY - bb.minY + 2*pad) / UNIT).toFixed(3),
      rx: 0.3,
    });
    rect.setAttribute('class', 'hl-halo');
    hl.appendChild(rect);
  }

  function setStatus(text) { statusEl.textContent = text; }

  // Highlight every object on one electrical net by re-drawing its members
  // into the overlay group. Re-drawing (rather than tagging the originals)
  // keeps the net highlight independent of component selection, and works for
  // bare copper that belongs to no component at all.
  function renderNet(netId) {
    const layer = svgBoard.querySelector('.net-layer');
    if (!layer) return;
    while (layer.firstChild) layer.removeChild(layer.firstChild);
    selectedNet = netId;
    if (netId == null || !netInfo) return;
    const g = $svg('g');
    g.setAttribute('class', 'net-hl');
    for (const idx of netInfo.nets[netId]) renderObject(g, board.objects[idx]);
    // These are copies; leaving data-cid on them would make one component look
    // like it had twice as many members.
    g.querySelectorAll('[data-cid]').forEach(e => e.removeAttribute('data-cid'));
    layer.appendChild(g);
  }

  // ---------- net names ----------
  // Sprint stores no nets and therefore no net names. These are the user's,
  // keyed by a stable signature of the net (see buildNets) so that a label
  // survives reloading the file.
  function netsKey() { return 'ibom-sprint:nets:' + placedKey; }
  function loadNetNames() {
    netNames = new Map();
    if (!placedKey) return;
    try {
      const raw = localStorage.getItem(netsKey());
      if (raw) for (const [k, v] of Object.entries(JSON.parse(raw))) netNames.set(k, v);
    } catch (_) {}
  }
  function saveNetNames() {
    if (!placedKey) return;
    // Names whose net is not in the current file are kept, not dropped: the
    // board may simply have been edited and re-saved, and losing a session of
    // reverse-engineering labels to a stray edit would be unforgivable.
    try { localStorage.setItem(netsKey(), JSON.stringify(Object.fromEntries(netNames))); } catch (_) {}
  }
  function netNameOf(netId) {
    if (!netInfo) return '';
    return netNames.get(netInfo.netKeys[netId]) || '';
  }
  function netLabel(netId) {
    return netNameOf(netId) || `net #${netId}`;
  }

  function renderNetPanel() {
    if (!netInfo) return;
    const named = [];
    netInfo.netKeys.forEach((k, id) => {
      const nm = netNames.get(k);
      if (nm) named.push({ id, nm });
    });
    named.sort((a, b) => naturalCompare(a.nm, b.nm));
    netListEl.innerHTML = named.length
      ? named.map(n => `<li data-net="${n.id}"${n.id === selectedNet ? ' class="on"' : ''}>` +
          `<span>${escapeHtml(n.nm)}</span><em>${netInfo.nets[n.id].length}</em>` +
          `<button class="row-del" data-unname="${n.id}" title="Remove this name">\u00d7</button></li>`).join('')
      : '<li class="none">no names yet</li>';
    const has = selectedNet != null;
    netNameEl.disabled = !has;
    netSaveBtn.disabled = !has;
    if (has) {
      const m = netInfo.nets[selectedNet];
      const pads = m.filter(i => board.objects[i].type === OBJ.THT_PAD ||
                                 board.objects[i].type === OBJ.SMD_PAD).length;
      netCountEl.textContent = `${netLabel(selectedNet)} \u00b7 ${pads} pad${pads === 1 ? '' : 's'}`;
      netNameEl.value = netNameOf(selectedNet);
    } else {
      netCountEl.textContent = 'click a track or pad';
      netNameEl.value = '';
    }
  }

  function saveCurrentNetName() {
    if (selectedNet == null || !netInfo) return;
    const key = netInfo.netKeys[selectedNet];
    const v = netNameEl.value.trim();
    if (v) netNames.set(key, v); else netNames.delete(key);
    saveNetNames();
    renderNetPanel();
    setStatus(v ? `named ${v}` : 'name cleared');
  }

  // One row per pad, which is the shape you want when working out what a
  // board does: every pad, what it is called, and where it is.
  function netsToCsv() {
    const esc = (v) => {
      const t = String(v == null ? '' : v);
      return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
    };
    const rows = [['net', 'refdes', 'x_mm', 'y_mm', 'layer', 'type']];
    const refOf = new Map();
    for (const c of components) for (const m of c.members) refOf.set(m, c.refdes);
    const order = netInfo.nets.map((_, id) => id)
      .sort((a, b) => naturalCompare(netLabel(a), netLabel(b)));
    for (const id of order) {
      for (const i of netInfo.nets[id]) {
        const o = board.objects[i];
        const isPad = o.type === OBJ.THT_PAD || o.type === OBJ.SMD_PAD;
        if (!isPad) continue;
        rows.push([netLabel(id), refOf.get(o) || '', (o.x / UNIT).toFixed(3),
                   (o.y / UNIT).toFixed(3), LAYER_NAME[o.layer] || o.layer,
                   o.type === OBJ.THT_PAD ? 'THT' : 'SMD'].map(esc));
      }
    }
    return rows.map(r => r.join(',')).join('\r\n') + '\r\n';
  }

  function describeNet(netId) {
    const members = netInfo.nets[netId];
    let pads = 0, tracks = 0;
    for (const i of members) {
      const t = board.objects[i].type;
      if (t === OBJ.THT_PAD || t === OBJ.SMD_PAD) pads++;
      else tracks++;
    }
    const gnd = netInfo.pourNets && netInfo.pourNets.has(netId)
      ? '   •  tied to the ground plane' : '';
    return `${netLabel(netId)}   ${pads} pad${pads===1?'':'s'}   ${tracks} track${tracks===1?'':'s'}${gnd}`;
  }

  // Screen -> board coordinates. Asking the <g class="world"> for its own CTM
  // means the viewBox, the Y flip and bottom mode's X mirror all come out in
  // the wash — no need to re-derive any of them here.
  function clientToWorld(clientX, clientY) {
    const world = svgBoard.querySelector('.world');
    if (!world || !world.getScreenCTM) return null;
    const m = world.getScreenCTM();
    if (!m) return null;
    const p = svgBoard.createSVGPoint();
    p.x = clientX; p.y = clientY;
    const q = p.matrixTransform(m.inverse());
    return { x: q.x * UNIT, y: q.y * UNIT };
  }

  // ---------- measure ----------
  // Snaps to pad centres, because the distances actually wanted on an old
  // board are pad-to-pad: lead pitch, connector spacing, mounting-hole
  // positions.
  function snapToPad(wx, wy, slack) {
    let best = null, bd = slack * slack;
    for (const o of board.objects) {
      if (o.type !== OBJ.THT_PAD && o.type !== OBJ.SMD_PAD) continue;
      let cx = o.x, cy = o.y;
      const pp = o.polyPoints || [];
      if (o.type === OBJ.SMD_PAD && pp.length >= 3) {
        cx = 0; cy = 0;
        for (const q of pp) { cx += q.x; cy += q.y; }
        cx /= pp.length; cy /= pp.length;
      }
      const d = (cx - wx) * (cx - wx) + (cy - wy) * (cy - wy);
      if (d < bd) { bd = d; best = { x: cx, y: cy }; }
    }
    return best || { x: wx, y: wy };
  }

  function renderMeasure() {
    const layer = svgBoard.querySelector('.measure-layer');
    if (!layer) return;
    while (layer.firstChild) layer.removeChild(layer.firstChild);
    const dot = (p, cls) => {
      const c = $svg('circle', { cx: (p.x/UNIT).toFixed(3), cy: (p.y/UNIT).toFixed(3), r: 0.35 });
      c.setAttribute('class', cls);
      layer.appendChild(c);
    };
    if (measureFrom) dot(measureFrom, 'measure-end');
    if (measureFrom && measureTo) {
      const l = $svg('line', {
        x1: (measureFrom.x/UNIT).toFixed(3), y1: (measureFrom.y/UNIT).toFixed(3),
        x2: (measureTo.x/UNIT).toFixed(3), y2: (measureTo.y/UNIT).toFixed(3),
      });
      l.setAttribute('class', 'measure-line');
      layer.appendChild(l);
      dot(measureTo, 'measure-end');
    }
  }

  function measureStatus() {
    if (!measureFrom) { setStatus('measure: click the first point'); return; }
    if (!measureTo) { setStatus('measure: click the second point'); return; }
    const dx = (measureTo.x - measureFrom.x) / UNIT, dy = (measureTo.y - measureFrom.y) / UNIT;
    const d = Math.hypot(dx, dy);
    const ang = ((Math.atan2(dy, dx) * 180 / Math.PI) + 360) % 360;
    setStatus(`${d.toFixed(3)} mm    dx ${dx.toFixed(3)}    dy ${dy.toFixed(3)}    ${ang.toFixed(1)}\u00b0` +
              `    (${(d / 25.4).toFixed(4)} in)`);
  }

  // ---------- pan / zoom ----------
  function fitViewBox() {
    if (!board) return;
    const bb = contentBBox();
    if (!bb) return;
    const margin = 0.05 * Math.max(bb.maxX - bb.minX, bb.maxY - bb.minY);
    // World applies scale(_, -1), so the SVG-Y range is [-maxY, -minY] in lay6 units.
    vb.x = (bb.minX - margin) / UNIT;
    vb.y = (-bb.maxY - margin) / UNIT;
    vb.w = (bb.maxX - bb.minX + 2 * margin) / UNIT;
    vb.h = (bb.maxY - bb.minY + 2 * margin) / UNIT;
    applyViewBox();
  }

  function applyViewBox() {
    svgBoard.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  }

  function attachPanZoom(svg) {
    let dragging = false;
    let last = null;
    let downAt = null;
    let downTarget = null;       // pointer capture rewrites e.target → svg; we
                                 // record the actual hit target on pointerdown
                                 // so handleBoardClick can use it on pointerup.

    // Manual double-click tracking. The browser's synthesized `dblclick`
    // event proved unreliable when pointer-capture is in play (no event
    // fires at all in some setups), so we run our own detector against
    // the same pointerup stream that drives single-clicks. Two clicks on
    // the same component within DBL_MS together count as a double-click.
    const DBL_MS = 400;
    let lastClick = { time: 0, cid: null };

    svg.addEventListener('wheel', (e) => {
      if (!board) return;
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const sx = (e.clientX - rect.left) / rect.width;
      const sy = (e.clientY - rect.top) / rect.height;
      const factor = e.deltaY < 0 ? 0.85 : 1.18;
      const newW = vb.w * factor;
      const newH = vb.h * factor;
      vb.x = vb.x + (vb.w - newW) * sx;
      vb.y = vb.y + (vb.h - newH) * sy;
      vb.w = newW; vb.h = newH;
      applyViewBox();
    }, { passive: false });

    svg.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.button !== 1) return;
      dragging = true;
      last = { x: e.clientX, y: e.clientY };
      downAt = { x: e.clientX, y: e.clientY };
      downTarget = e.target;
      svg.classList.add('dragging');
      try { svg.setPointerCapture(e.pointerId); } catch (_) {}
    });
    svg.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const rect = svg.getBoundingClientRect();
      const dx = (e.clientX - last.x) / rect.width * vb.w;
      const dy = (e.clientY - last.y) / rect.height * vb.h;
      vb.x -= dx; vb.y -= dy;
      last.x = e.clientX; last.y = e.clientY;
      applyViewBox();
    });
    const endDrag = (e) => {
      if (!dragging) return;
      dragging = false;
      svg.classList.remove('dragging');
      try { svg.releasePointerCapture(e.pointerId); } catch (_) {}
      // distinguish click from drag: only treat as click if moved < 4 px
      if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 4) {
        // Resolve the cid under the pointer.
        const tagged = downTarget && downTarget.closest &&
                       downTarget.closest('[data-cid], [data-cid-hit]');
        const cid = tagged ?
          Number(tagged.getAttribute('data-cid') || tagged.getAttribute('data-cid-hit'))
          : null;
        const now = Date.now();
        // Resolve the net under the pointer before the component handling
        // below, but apply its status line after — selectComponent() rewrites
        // the status, so setting it here would just get overwritten.
        if (measureMode) {
          const rect = svg.getBoundingClientRect();
          const slack = (vb.w / Math.max(rect.width, 1)) * 10 * UNIT;
          const w = clientToWorld(e.clientX, e.clientY);
          if (w) {
            const p2 = snapToPad(w.x, w.y, slack);
            if (!measureFrom || measureTo) { measureFrom = p2; measureTo = null; }
            else measureTo = p2;
            renderMeasure();
            measureStatus();
          }
          downAt = null; downTarget = null;
          return;                       // measure owns the click
        }
        if (partMode) {
          const rect = svg.getBoundingClientRect();
          const slack = (vb.w / Math.max(rect.width, 1)) * 3 * UNIT;
          const w = clientToWorld(e.clientX, e.clientY);
          if (w) togglePick(pickAnyObject(w.x, w.y, slack));
          downAt = null; downTarget = null;
          return;                       // part mode owns the click
        }
        let net = -1;
        if (netMode && netInfo) {
          // A few pixels of slack, so a hairline track is still clickable when
          // zoomed out.
          const rect = svg.getBoundingClientRect();
          const slack = (vb.w / Math.max(rect.width, 1)) * 4 * UNIT;
          const w = clientToWorld(e.clientX, e.clientY);
          const hit = w ? objectAt(netInfo.items, w.x, w.y, slack) : -1;
          net = hit >= 0 ? netInfo.netOf[hit] : -1;
          renderNet(net >= 0 ? net : null);
          renderNetPanel();
        }
        if (cid && cid === lastClick.cid && now - lastClick.time < DBL_MS) {
          // Second click on the same component within the window → double-click.
          // Reset so a third quick click doesn't toggle again.
          lastClick = { time: 0, cid: null };
          if (compById.has(cid)) togglePlaced(cid);
        } else {
          handleBoardClick(downTarget);
          lastClick = { time: now, cid };
        }
        if (netMode) {
          const own = statusEl.textContent;
          setStatus(net >= 0 ? (own ? own + '   │   ' + describeNet(net) : describeNet(net))
                             : own);
        }
      }
      downAt = null;
      downTarget = null;
    };
    svg.addEventListener('pointerup', endDrag);
    svg.addEventListener('pointercancel', endDrag);
  }

  function handleBoardClick(target) {
    // Pick by data-cid on the click target (lines/pads/text inside a component
    // all carry data-cid), else fall back to hit-box (data-cid-hit covers
    // empty interior of a part).
    let cid = null;
    const tagged = target && target.closest && target.closest('[data-cid], [data-cid-hit]');
    if (tagged) {
      cid = tagged.getAttribute('data-cid') || tagged.getAttribute('data-cid-hit');
      cid = cid ? Number(cid) : null;
    }
    if (cid) {
      // Make sure the BOM panel is visible so the user can SEE the row jump.
      if (layoutEl.classList.contains('bom-hidden')) {
        layoutEl.classList.remove('bom-hidden');
      }
      selectComponent(cid);
      // Brief flash on the row so the change is obvious even when the row
      // was already scrolled into view. (selectComponent already scrolls
      // the row to the centre of the BOM panel.)
      const row = bomBody.querySelector(`tr[data-cid="${cid}"]`);
      if (row) {
        row.classList.remove('flash');
        // force reflow so the animation re-triggers
        void row.offsetWidth;
        row.classList.add('flash');
      }
    } else {
      selectComponent(null);
    }
  }

  // ---------- placed state persistence ----------
  // The "placed" Set is keyed by componentId (a number that's stable across
  // sessions, unique even when two parts share a refdes). Old persisted data
  // used refdes strings — silently dropped on load.
  function loadPlaced() {
    placed = new Set();
    if (!placedKey) return;
    try {
      const raw = localStorage.getItem('ibom-sprint:placed:' + placedKey);
      if (!raw) return;
      for (const v of JSON.parse(raw)) {
        if (typeof v === 'number') placed.add(v);
      }
    } catch (_) {}
  }
  function savePlaced() {
    if (!placedKey) return;
    try {
      localStorage.setItem('ibom-sprint:placed:' + placedKey, JSON.stringify([...placed]));
    } catch (_) {}
  }
  // Re-centre the viewBox on a component (auto-switching sides if needed).
  // Called both when a BOM row is clicked and when the user navigates with
  // the keyboard, so the board view always follows the highlighted part.
  function focusOnComponent(cid) {
    const c = compById.get(cid);
    if (!c) return;
    if (mode !== 'xray' && c.side !== mode) {
      setMode(c.side);
    }
    const bb = hitBoxFor(c);
    if (!bb) return;
    const cx = (bb.minX + bb.maxX) / 2 / UNIT;
    const cy = (bb.minY + bb.maxY) / 2 / UNIT;
    // World flips Y, so SVG-Y of this point is -cy. In bottom mode also
    // mirror X around the board centre.
    const focusX = (mode === 'bottom') ? (allCx() * 2 - cx) : cx;
    vb.x = focusX - vb.w / 2;
    vb.y = -cy - vb.h / 2;
    applyViewBox();
  }

  // Centre the view on a net (used when picking one from the list).
  function focusOnNet(netId) {
    if (!netInfo || !board) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const i of netInfo.nets[netId]) {
      const b = objectBBox(board.objects[i]);
      if (!b) continue;
      minX = Math.min(minX, b.minX); minY = Math.min(minY, b.minY);
      maxX = Math.max(maxX, b.maxX); maxY = Math.max(maxY, b.maxY);
    }
    if (!isFinite(minX)) return;
    const cx = (minX + maxX) / 2 / UNIT, cy = (minY + maxY) / 2 / UNIT;
    vb.x = ((mode === 'bottom') ? (allCx() * 2 - cx) : cx) - vb.w / 2;
    vb.y = -cy - vb.h / 2;
    applyViewBox();
  }

  function togglePlaced(cid) {
    if (placed.has(cid)) placed.delete(cid); else placed.add(cid);
    savePlaced();
    const wasFocused = document.activeElement && document.activeElement.closest &&
                       document.activeElement.closest('#bomBody tr');
    const cidToRefocus = wasFocused ? wasFocused.dataset.cid : null;
    renderBom();
    // The row we just toggled was destroyed and re-created; put focus back
    // so the user can keep hitting ↓ Enter ↓ Enter without losing their spot.
    if (cidToRefocus) {
      const row = bomBody.querySelector(`tr[data-cid="${cidToRefocus}"]`);
      if (row) row.focus();
    }
  }

  // ---------- event wiring ----------
  function wireEvents() {
    async function handleLay6File(f) {
      try {
        const buf = await f.arrayBuffer();
        loadFile(buf, f.name);
      } catch (err) {
        console.error(err);
        // The raw message is a byte offset, which tells a user nothing. The
        // overwhelmingly likely cause is the wrong kind of file — a Sprint 5
        // .lay, or a .lay6 saved by a version whose layout differs.
        setStatus(`could not read ${f.name}`);
        alert(
          `Could not read ${f.name}.

` +
          `This reads Sprint Layout 6 files. Older .lay files (Sprint 5) and ` +
          `files from other programs are not supported.

` +
          `If it really is a Sprint 6 board, the parser has hit something it ` +
          `does not know about — the details are in the browser console:
${err.message}`);
      }
    }
    async function handleCsvFile(f) {
      const text = await f.text();
      mergeBomCsv(text);
    }

    fileInput.addEventListener('change', () => {
      const f = fileInput.files[0];
      if (f) handleLay6File(f);
    });

    bomCsvInput.addEventListener('change', async () => {
      const f = bomCsvInput.files[0];
      if (!f) return;
      await handleCsvFile(f);
      bomCsvInput.value = '';
    });

    // Drag-and-drop anywhere on the page. .lay6 → board file; .csv/.txt → BOM.
    // A subtle "drop here" overlay appears while the user is dragging.
    const dropOverlay = (() => {
      const d = document.createElement('div');
      d.className = 'drop-overlay';
      d.innerHTML = '<div class="drop-card">Drop <code>.lay6</code> or <code>.csv</code> to load</div>';
      d.hidden = true;
      document.body.appendChild(d);
      return d;
    })();
    let dragDepth = 0;
    window.addEventListener('dragenter', (e) => {
      // Only react to file drags (not internal drags like text selection)
      if (!Array.from(e.dataTransfer?.types || []).includes('Files')) return;
      dragDepth++;
      dropOverlay.hidden = false;
    });
    window.addEventListener('dragleave', () => {
      if (--dragDepth <= 0) { dragDepth = 0; dropOverlay.hidden = true; }
    });
    window.addEventListener('dragover', (e) => {
      if (!Array.from(e.dataTransfer?.types || []).includes('Files')) return;
      e.preventDefault();  // required to allow drop
      e.dataTransfer.dropEffect = 'copy';
    });
    window.addEventListener('drop', async (e) => {
      if (!e.dataTransfer?.files?.length) return;
      e.preventDefault();
      dragDepth = 0; dropOverlay.hidden = true;
      const files = Array.from(e.dataTransfer.files);
      // Load .lay6 first (replaces the board), then merge any CSVs
      const lay = files.find(f => /\.lay6$/i.test(f.name));
      if (lay) await handleLay6File(lay);
      for (const f of files) {
        if (/\.(csv|txt)$/i.test(f.name)) await handleCsvFile(f);
      }
      if (!lay && !files.some(f => /\.(csv|txt)$/i.test(f.name))) {
        alert('Unsupported file type. Drop a .lay6 or .csv/.txt file.');
      }
    });

    modeButtons.forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));

    resetView.addEventListener('click', () => fitViewBox());

    markAll.addEventListener('click', () => {
      if (!components.length) return;
      if (placed.size === components.length) placed = new Set();
      else components.forEach(c => placed.add(c.componentId));
      savePlaced();
      renderBom();
    });
    clearMarks.addEventListener('click', () => {
      if (!components.length) return;
      placed = new Set();
      savePlaced();
      renderBom();
    });

    search.addEventListener('input', () => {
      searchTerm = search.value.trim();
      renderBom();
    });

    // BOM table click
    bomBody.addEventListener('click', (e) => {
      const tr = e.target.closest('tr[data-cid]');
      if (!tr) return;
      const cid = Number(tr.dataset.cid);
      if (e.target.matches('button[data-del]')) {
        deleteUserPart(Number(e.target.dataset.del));
        return;
      }
      if (e.target.matches('input[type=checkbox]')) {
        togglePlaced(cid);
        return;
      }
      tr.focus();
      selectComponent(cid);
      focusOnComponent(cid);
    });

    // BOM keyboard navigation. Active when a row is focused (which happens
    // either after a click or after the user Tabs into the BOM panel).
    //   ArrowDown / Tab       → next row
    //   ArrowUp / Shift+Tab   → previous row
    //   Enter / Space         → toggle "placed" for the focused row
    bomBody.addEventListener('keydown', (e) => {
      const tr = e.target.closest('tr[data-cid]');
      if (!tr || tr.parentNode !== bomBody) return;
      const rows = Array.from(bomBody.querySelectorAll('tr[data-cid]'));
      const idx = rows.indexOf(tr);
      if (idx < 0) return;
      let dest = null;
      if (e.key === 'ArrowDown') dest = rows[idx + 1];
      else if (e.key === 'ArrowUp') dest = rows[idx - 1];
      else if (e.key === 'Tab') {
        dest = e.shiftKey ? rows[idx - 1] : rows[idx + 1];
        // only intercept Tab when we have somewhere to go inside the list
        if (!dest) return;
      } else if (e.key === 'Enter' || e.key === ' ') {
        togglePlaced(Number(tr.dataset.cid));
        e.preventDefault();
        return;
      } else {
        return;
      }
      if (dest) {
        e.preventDefault();
        dest.focus();
        const cid = Number(dest.dataset.cid);
        selectComponent(cid);
        focusOnComponent(cid);
      }
    });

    bomTable.querySelector('thead').addEventListener('click', (e) => {
      const th = e.target.closest('th');
      if (!th || !th.dataset.sort) return;
      if (sortKey === th.dataset.sort) sortDir = -sortDir;
      else { sortKey = th.dataset.sort; sortDir = 1; }
      renderBom();
    });

    attachPanZoom(svgBoard);
    // (Double-click toggling is handled inside attachPanZoom's pointer
    // logic — see the manual DBL_MS detector. The browser's `dblclick`
    // event proved unreliable when pointer-capture is in play.)

    // BOM panel collapse
    bomToggle.addEventListener('click', () => {
      layoutEl.classList.toggle('bom-hidden');
    });

    // Dismiss welcome (the empty-board hint)
    dismissBtn.addEventListener('click', () => {
      boardEmpty.classList.add('dismissed');
    });

    // Help overlay: show / dismiss
    showHelpBtn.addEventListener('click', () => {
      helpOverlay.hidden = false;
    });
    helpCloseBtn.addEventListener('click', () => {
      helpOverlay.hidden = true;
    });
    // click outside the card also closes
    helpOverlay.addEventListener('click', (e) => {
      if (e.target === helpOverlay) helpOverlay.hidden = true;
    });

    // Hide-vias toggle: flips a class on the pads-group so CSS hides
    // standalone (componentId=0) THT pads and their drill holes.
    let viasHidden = false;
    hideViasBtn.addEventListener('click', () => {
      viasHidden = !viasHidden;
      hideViasBtn.setAttribute('aria-pressed', String(viasHidden));
      hideViasBtn.classList.toggle('active', viasHidden);
      const pg = svgBoard.querySelector('.pads-group');
      if (pg) pg.classList.toggle('hide-vias', viasHidden);
    });

    // Automatic ground plane on/off. Sprint treats it as a display option too
    // ("you may turn on/off the ground-plane whenever you like, without any
    // loss of information"), so this is a view toggle, not an edit.
    function setPour(on) {
      showPour = on;
      pourBtn.setAttribute('aria-pressed', String(on));
      pourBtn.classList.toggle('active', on);
      if (board) renderBoard();
    }
    pourBtn.addEventListener('click', () => setPour(!showPour));

    // Net mode. Sprint has no netlist to read — these nets are worked out from
    // the copper itself, so they also exist on boards with no components.
    // Net, part and measure mode all take over the board click, so at most
    // one of them can be on.
    function exclusive(except) {
      if (except !== 'net' && netMode) setNetMode(false);
      if (except !== 'part' && partMode) setPartMode(false);
      if (except !== 'measure' && measureMode) setMeasureMode(false);
    }
    function setNetMode(on) {
      netMode = on;
      netBtn.setAttribute('aria-pressed', String(on));
      netBtn.classList.toggle('active', on);
      netBuilder.hidden = !on;
      if (!on) { renderNet(null); setStatus(''); }
      else {
        exclusive('net');
        if (layoutEl.classList.contains('bom-hidden')) layoutEl.classList.remove('bom-hidden');
        renderNetPanel();
        setStatus('net mode: click any track or pad to trace its connections');
      }
    }
    netBtn.addEventListener('click', () => setNetMode(!netMode));
    netSaveBtn.addEventListener('click', saveCurrentNetName);
    netNameEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveCurrentNetName(); });
    netListEl.addEventListener('click', (e) => {
      const un = e.target.closest('button[data-unname]');
      if (un) {
        netNames.delete(netInfo.netKeys[Number(un.dataset.unname)]);
        saveNetNames(); renderNetPanel();
        return;
      }
      const li = e.target.closest('li[data-net]');
      if (!li) return;
      const id = Number(li.dataset.net);
      renderNet(id); renderNetPanel();
      setStatus(describeNet(id));
      focusOnNet(id);
    });
    netExportBtn.addEventListener('click', () => {
      if (!netInfo || !netInfo.nets.length) { setStatus('no nets to export'); return; }
      download(netsToCsv(), 'text/csv;charset=utf-8', '-nets.csv');
    });

    function setMeasureMode(on) {
      measureMode = on;
      measureBtn.setAttribute('aria-pressed', String(on));
      measureBtn.classList.toggle('active', on);
      if (!on) { measureFrom = measureTo = null; renderMeasure(); setStatus(''); }
      else { exclusive('measure'); measureStatus(); }
    }
    measureBtn.addEventListener('click', () => setMeasureMode(!measureMode));

    function setPartMode(on) {
      partMode = on;
      partBtn.setAttribute('aria-pressed', String(on));
      partBtn.classList.toggle('active', on);
      partBuilder.hidden = !on;
      if (on) exclusive('part');
      if (!on) { partPick.clear(); renderPartPick(); setStatus(''); }
      else {
        if (layoutEl.classList.contains('bom-hidden')) layoutEl.classList.remove('bom-hidden');
        setStatus('part mode: click the objects that make up one part, then name it');
      }
    }
    partBtn.addEventListener('click', () => setPartMode(!partMode));
    infoBtn.addEventListener('click', () => showBoardInfo());
    infoCloseBtn.addEventListener('click', () => { infoOverlay.hidden = true; });
    infoOverlay.addEventListener('click', (e) => { if (e.target === infoOverlay) infoOverlay.hidden = true; });
    el('exportPng').addEventListener('click', () => exportView('png'));
    el('exportSvg').addEventListener('click', () => exportView('svg'));
    el('exportDrills').addEventListener('click', () => {
      if (!board) return;
      const rows = [['diameter_mm', 'holes', 'plated', 'unplated_or_bare']];
      for (const r of drillTable(board))
        rows.push([r.mm.toFixed(2), r.count, r.plated, r.bare]);
      download(rows.map(r => r.join(',')).join('\r\n') + '\r\n', 'text/csv;charset=utf-8', '-drills.csv');
    });
    pbCreate.addEventListener('click', createUserPart);
    pbClear.addEventListener('click', () => { partPick.clear(); renderPartPick(); });
    pbRef.addEventListener('input', () => { pbCreate.disabled = !partPick.size || !pbRef.value.trim(); });
    for (const f of [pbRef, pbValue, pbPackage])
      f.addEventListener('keydown', (e) => { if (e.key === 'Enter') createUserPart(); });

    exportBtn.addEventListener('click', () => {
      if (!components.length) { setStatus('nothing to export yet'); return; }
      download(bomToCsv(), 'text/csv;charset=utf-8', '-bom.csv');
    });

    // Keyboard
    document.addEventListener('keydown', (e) => {
      // Don't hijack typing in the search box, and let the BOM keydown
      // handler above own all input when a row is focused.
      if (e.target === search) return;
      if (e.target.closest && e.target.closest('tr[tabindex]')) return;

      if (e.key === 'Escape') {
        if (!helpOverlay.hidden) { helpOverlay.hidden = true; e.preventDefault(); return; }
        if (!infoOverlay.hidden) { infoOverlay.hidden = true; e.preventDefault(); return; }
        if (measureFrom) { measureFrom = measureTo = null; renderMeasure(); measureStatus(); }
        renderNet(null);
        selectComponent(null);
      } else if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        helpOverlay.hidden = !helpOverlay.hidden;
        e.preventDefault();
      } else if (e.key === 'r' || e.key === 'R') {
        fitViewBox(); e.preventDefault();
      } else if (e.key === 't' || e.key === 'T') {
        setMode('top');
      } else if (e.key === 'b' || e.key === 'B') {
        setMode('bottom');
      } else if (e.key === 'x' || e.key === 'X') {
        setMode('xray');
      } else if (e.key === 'g' || e.key === 'G') {
        setPour(!showPour);
      } else if (e.key === 'n' || e.key === 'N') {
        setNetMode(!netMode);
      } else if (e.key === 'p' || e.key === 'P') {
        setPartMode(!partMode);
      } else if (e.key === 'm' || e.key === 'M') {
        setMeasureMode(!measureMode);
      } else if (e.key === 'i' || e.key === 'I') {
        showBoardInfo();
      } else if (e.key === 'Tab') {
        layoutEl.classList.toggle('bom-hidden');
        e.preventDefault();
      }
    });
  }

  // The bbox of everything on the board, cached per loaded file.
  //
  // One bbox has to serve three callers — the bottom-mode X mirror, the
  // fit-to-view, and focusOnComponent's mirror maths. They MUST agree: the
  // mirror maps x -> 2*cx - x, which only maps the viewport onto itself when
  // cx is the centre of the very box being fitted. Fitting to the outline
  // layer while mirroring about the all-objects centre (what this used to do)
  // put the bottom view off-centre by twice the difference, and silently
  // cropped anything drawn outside the outline — e.g. MaraAMPCaps, which has
  // its date stamp 5.4 mm off the left edge of the board.
  let _contentBb = null;
  function contentBBox() {
    if (_contentBb === null && board) _contentBb = bboxOfObjects(board.objects) || false;
    return _contentBb || null;
  }
  function allCx() {
    const bb = contentBBox();
    return bb ? (bb.minX + bb.maxX) / 2 / UNIT : 0;
  }

  // ---------- load ----------
  let currentFileName = '';
  function loadFile(buf, filename) {
    parsed = parseLay6(buf);
    board = parsed.boards[0];
    currentFileName = filename;
    components = extractComponents(board);
    // Keyed on the file's own shape, so renaming the file keeps your progress.
    // Computed from the Sprint components only — user-defined parts must not
    // feed back into the key that decides which saved parts to load.
    placedKey = hashString([parsed.projectName, board.name, components.length, board.numObjects].join('|'));
    loadPlaced();
    loadNetNames();
    loadUserParts();
    rebuildComponents();
    _contentBb = null;
    partPick.clear();
    measureFrom = measureTo = null;
    netInfo = buildNets(board);
    selectedNet = null;
    selectedCid = null;
    userLayerHidden = new Set();

    boardEmpty.classList.add('dismissed');
    boardStage.hidden = false;

    setMode(mode);    // also triggers the initial renderBoard()
    fitViewBox();
    renderBom();
    // re-set toggle visuals to all-on
    layerSeg.querySelectorAll('.seg-btn').forEach(b => {
      b.classList.add('active'); b.classList.remove('layer-off');
    });

    const cu = components.filter(c => c.side === 'top').length;
    const cd = components.filter(c => c.side === 'bottom').length;
    const nets = netInfo ? `  •  ${netInfo.nets.length} nets` : '';
    setStatus(`${filename}  •  ${(board.sizeX/UNIT).toFixed(1)}×${(board.sizeY/UNIT).toFixed(1)} mm  •  ${components.length} comp (${cu} top / ${cd} bot)${nets}`);
  }

  // ---------- init ----------
  buildLayerSeg();
  wireEvents();
  setStatus('');
})();
