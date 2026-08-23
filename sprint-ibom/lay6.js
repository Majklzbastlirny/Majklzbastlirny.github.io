/* lay6.js — Sprint Layout .lay6 binary parser.
 * Based on the reverse-engineering work at github.com/sergey-raevskiy/xlay
 * License of that work is unclear; this is an independent reimplementation
 * in JavaScript from the documented field layout in their lay6.h.
 *
 * Coordinate units: all "world" coordinates are stored as float in
 * units of mm × 10000.
 */

const OBJ = Object.freeze({
  THT_PAD: 2,
  POLY:    4,
  CIRCLE:  5,
  LINE:    6,
  TEXT:    7,
  SMD_PAD: 8,
});

// Sprint Layout 6 stores objects with a layer value in the range 1..7 (0 is unused).
// Determined empirically against the user's gerber export: "B0724 P.V.B" is on top
// copper in copper_top.gbr — that same text is on layer 1 in the binary; ČKD logo,
// "+" marks, diamond polygon, and "B0824 P.V.B" are on the bottom copper gerber,
// and all live on layer 3 in the binary. Therefore:
//
//   L1 = top copper, L2 = top silk, L3 = bottom copper,
//   L4 = inner 1,    L5 = inner 2,  L6 = bottom silk,  L7 = outline
const LAYER = Object.freeze({
  C2: 1,  // top copper
  S2: 2,  // top silk (component refdes/outlines)
  C1: 3,  // bottom copper (most THT-pad copper rings, ČKD logo, hand-drawn "4")
  I1: 4,  // inner copper 1
  I2: 5,  // inner copper 2
  S1: 6,  // bottom silk
  O:  7,  // board outline
});

// indexed by layer value (0..7). LAYER 0 is unused.
const LAYER_NAME = [
  '',           // 0 (unused)
  'Cu top',     // 1  C2
  'Silk top',   // 2  S2
  'Cu bottom',  // 3  C1
  'Inner 1',    // 4  I1
  'Inner 2',    // 5  I2
  'Silk bot',   // 6  S1
  'Outline',    // 7  O
];

// Which side a component on this layer belongs to (used to label the BOM "Side" column).
const LAYER_IS_TOP    = [false, true,  true,  false, false, false, false, false];
const LAYER_IS_BOTTOM = [false, false, false, true,  false, false, true,  false];

// Short code per layer value (used as CSS class suffix).
const LAYER_KEY = ['','C2','S2','C1','I1','I2','S1','O'];

// Pad shapes. Only ROUND (1) is confirmed to be a plain circle; every other
// shape seen in real files carries its exact geometry in `polyPoints` — either
// the corner list of a polygon pad (Sprint exports those verbatim as a G36
// region) or the two end centres of an elongated pad (exported as a stroke of
// aperture 2·out). Renderers should read polyPoints and use this only to tell
// a round pad from a 2-point elongated one.
const THT_SHAPE = Object.freeze({ ROUND: 1, OCT: 2, POLY: 3, OBLONG: 4 });

class Reader {
  constructor(buf) {
    this.dv = new DataView(buf);
    this.u8 = new Uint8Array(buf);
    this.pos = 0;
  }
  _need(n) {
    if (this.pos + n > this.dv.byteLength)
      throw new Error(`EOF: need ${n} bytes at 0x${this.pos.toString(16)}, only ${this.dv.byteLength - this.pos} left`);
  }
  readU8()  { this._need(1); const v = this.dv.getUint8(this.pos);            this.pos += 1; return v; }
  readU16() { this._need(2); const v = this.dv.getUint16(this.pos, true);     this.pos += 2; return v; }
  readU32() { this._need(4); const v = this.dv.getUint32(this.pos, true);     this.pos += 4; return v; }
  readI32() { this._need(4); const v = this.dv.getInt32(this.pos, true);      this.pos += 4; return v; }
  readF32() { this._need(4); const v = this.dv.getFloat32(this.pos, true);    this.pos += 4; return v; }
  readF64() { this._need(8); const v = this.dv.getFloat64(this.pos, true);    this.pos += 8; return v; }
  readBytes(n) { this._need(n); const out = this.u8.subarray(this.pos, this.pos + n); this.pos += n; return out; }
  // Pascal-style fixed-size string: 1-byte length + max_len bytes (latin-1)
  readFixStr(maxLen) {
    const n = this.readU8();
    const raw = this.readBytes(maxLen);
    return decodeLatin1(raw.subarray(0, n));
  }
  // Variable-size string: 4-byte length + that many bytes
  readVarStr() {
    const n = this.readU32();
    return decodeLatin1(this.readBytes(n));
  }
  skip(n) { this._need(n); this.pos += n; }
}

function decodeLatin1(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

function readObject(r, textChild = false) {
  const o = {
    type:          r.readU8(),
    x:             r.readF32(),
    y:             r.readF32(),
    out:           r.readF32(),   // also: radius for THT/SMD/circle, height for text
    inn:           r.readF32(),   // also: drill for THT, line width for text
    lineWidth:     r.readU32(),   // also: end angle for circles
  };
  r.skip(1);
  o.layer         = r.readU8();
  o.thtShape      = r.readU8();
  r.skip(4);
  o.componentId   = r.readU16();
  o.selected      = r.readU8();
  o.thStyle       = r.readBytes(4); // union with start_angle (DWORD)
  o.thStyleBytes  = new Uint8Array(o.thStyle); // copy
  r.skip(5);
  o.thStyleCustom = r.readU8();
  o.groundDist    = r.readU32();
  r.skip(5);
  o.thermobarier  = r.readU8();
  o.flipVertical  = r.readU8();
  o.cutoff        = r.readU8();
  o.thsize        = r.readU32();   // also: rotation (millidegrees) for text/components
  o.metalisation  = r.readU8();
  o.soldermask    = r.readU8();
  r.skip(18);

  o.text = '';
  o.marker = '';
  o.groups = [];
  o.polyPoints = [];
  o.textObjects = [];
  o.component = null;

  if (!textChild) {
    o.text   = r.readVarStr();
    o.marker = r.readVarStr();
    const ng = r.readU32();
    for (let i = 0; i < ng; i++) o.groups.push(r.readU32());
  }

  if (o.type === OBJ.CIRCLE) return o;

  if (o.type === OBJ.TEXT) {
    const ntext = r.readU32();
    for (let i = 0; i < ntext; i++) o.textObjects.push(readObject(r, true));
    if (o.thtShape === 1) {
      o.component = readComponent(r);
    }
    return o;
  }

  const npts = r.readU32();
  for (let i = 0; i < npts; i++) {
    o.polyPoints.push({ x: r.readF32(), y: r.readF32() });
  }
  return o;
}

function readComponent(r) {
  return {
    offX:        r.readF32(),
    offY:        r.readF32(),
    centerMode:  r.readU8(),
    rotation:    r.readF64(),
    package:     r.readVarStr(),
    comment:     r.readVarStr(),
    use:         r.readU8(),
  };
}

/**
 * Parse a .lay6 ArrayBuffer.
 * @returns {{ projectName, projectAuthor, projectCompany, comment, boards: Board[] }}
 */
function parseLay6(arrayBuffer) {
  const r = new Reader(arrayBuffer);

  // File header
  const magic = r.readBytes(4);
  const numBoards = r.readU32();

  const boards = [];
  for (let b = 0; b < numBoards; b++) {
    const board = {};
    // Board header (534 bytes total)
    board.name           = r.readFixStr(30);
    r.skip(4);
    board.sizeX          = r.readU32();
    board.sizeY          = r.readU32();
    // One automatic-ground-plane flag per layer, indexed by layer-1. Sprint
    // stores no pour geometry at all: the flag plus each object's groundDist
    // is everything the editor needs to re-flood the layer.
    board.groundPane     = Array.from(r.readBytes(7));
    board.activeGridVal  = r.readF64();
    board.zoom           = r.readF64();
    r.skip(4); r.skip(4); // viewport_offset
    board.activeLayer    = r.readU8();
    r.skip(3);
    board.layerVisible   = Array.from(r.readBytes(7));
    board.showScanTop    = r.readU8();
    board.showScanBot    = r.readU8();
    board.scanPathTop    = r.readFixStr(200);
    board.scanPathBot    = r.readFixStr(200);
    r.skip(24); // dpi + shift fields
    r.skip(4); r.skip(4); // unk
    board.centerX        = r.readI32();
    board.centerY        = r.readI32();
    board.isMultilayer   = r.readU8();
    board.numObjects     = r.readU32();

    // Objects
    board.objects = [];
    for (let i = 0; i < board.numObjects; i++) {
      board.objects.push(readObject(r));
    }

    // Connections — one record per pad object, in pad-order
    board.connections = [];
    for (const o of board.objects) {
      if (o.type === OBJ.THT_PAD || o.type === OBJ.SMD_PAD) {
        const n = r.readU32();
        const conn = [];
        for (let i = 0; i < n; i++) conn.push(r.readU32());
        board.connections.push(conn);
      }
    }

    boards.push(board);
  }

  // Trailer
  const trailer = {};
  try {
    trailer.activeBoardTab = r.readU32();
    trailer.projectName    = r.readFixStr(100);
    trailer.projectAuthor  = r.readFixStr(100);
    trailer.projectCompany = r.readFixStr(100);
    const cmtLen           = r.readU32();
    trailer.comment        = decodeLatin1(r.readBytes(cmtLen));
  } catch (e) {
    // tolerate missing trailer
    trailer.projectName = ''; trailer.projectAuthor = ''; trailer.projectCompany = ''; trailer.comment = '';
  }

  return { magic, boards, ...trailer };
}

/**
 * Extract a structured list of components from a parsed board.
 * A "component" in Sprint Layout is a TEXT object that carries a Component sub-record;
 * its component_id ties to every pad / line / circle that belongs to its footprint.
 */
function extractComponents(board) {
  const comps = [];
  for (const o of board.objects) {
    if (o.type === OBJ.TEXT && o.component) {
      // The Component sub-record stores the user-set rotation as a double (degrees).
      const rotDeg = o.component.rotation || 0;
      comps.push({
        refdes: o.text || '',
        package: o.component.package || '',
        value: o.component.comment || '',   // Sprint uses "comment" as the visible value/text
        componentId: o.componentId,
        x: o.x,
        y: o.y,
        rotation: rotDeg,
        layer: o.layer,                      // layer of the refdes label -> side of the board
        side: LAYER_IS_TOP[o.layer] ? 'top' : 'bottom',
        members: [],                         // filled below
      });
    }
  }
  // Map each non-zero component_id to its member objects
  const byId = new Map();
  for (const c of comps) byId.set(c.componentId, c);
  for (const o of board.objects) {
    if (o.componentId && byId.has(o.componentId) && o.type !== OBJ.TEXT) {
      byId.get(o.componentId).members.push(o);
    }
  }
  return comps;
}

/** Compute the AABB of an object (in lay6 world units). */
function objectBBox(o) {
  let minX =  Infinity, minY =  Infinity, maxX = -Infinity, maxY = -Infinity;
  const ext = (x, y) => { if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y; };
  switch (o.type) {
    case OBJ.THT_PAD: {
      // `out` is the pad RADIUS (Sprint's gerber flashes these with a 2·out
      // aperture). Polygon pads and elongated pads reach further than that,
      // and both describe themselves in polyPoints — a polygon pad by its
      // corners, an elongated pad by the two end centres of its stadium.
      const r = (o.out || 0);
      const pp = o.polyPoints || [];
      if (pp.length >= 3) {
        for (const p of pp) ext(p.x, p.y);
      } else if (pp.length === 2 && o.thtShape !== THT_SHAPE.ROUND) {
        for (const p of pp) { ext(p.x - r, p.y - r); ext(p.x + r, p.y + r); }
      } else {
        ext(o.x - r, o.y - r); ext(o.x + r, o.y + r);
      }
      break;
    }
    case OBJ.SMD_PAD: {
      // Same story as the renderer: the true rectangle is in polyPoints
      // (absolute coords, rotation baked in). o.x/o.y is a template origin
      // that is 0 for exploded parts, so a bbox built from it lands on the
      // board origin and drags every hit-box / fit-to-view with it.
      if (o.polyPoints && o.polyPoints.length >= 3) {
        for (const p of o.polyPoints) ext(p.x, p.y);
        break;
      }
      // Fallback for files without polyPoints: `out` is the pad WIDTH and
      // `inn` its HEIGHT (unlike THT, where `out` is a diameter), rotated
      // by thsize millidegrees about o.x/o.y.
      const hw = (o.out || 0) / 2, hh = (o.inn || 0) / 2;
      const a = (o.thsize || 0) / 1000 * Math.PI / 180;
      const ca = Math.cos(a), sa = Math.sin(a);
      for (const [dx, dy] of [[-hw,-hh],[hw,-hh],[hw,hh],[-hw,hh]]) {
        ext(o.x + dx*ca - dy*sa, o.y + dx*sa + dy*ca);
      }
      break;
    }
    case OBJ.CIRCLE: {
      // out = rin, in = rout; use the larger
      const r = Math.max(o.out || 0, o.inn || 0);
      ext(o.x - r, o.y - r); ext(o.x + r, o.y + r);
      break;
    }
    case OBJ.TEXT: {
      // Empty TEXT objects are unused placeholder slots (Sprint's "value"
      // / "notes" fields when the user never filled them in). They should
      // not contribute to bboxes — otherwise component hit-boxes balloon
      // around invisible slots positioned next to the refdes.
      const txt = o.text || '';
      if (!txt) return null;
      const h = (o.out || 0);
      if (!h) return null;
      // Sprint's stroke font is roughly monospace; glyph advance ≈ 0.6·h.
      // Use the actual character count instead of a fixed multiplier — for
      // a 2-char refdes like "C2" the old `h*4` formula was 4× too wide.
      const longHalf  = h * 0.6 * txt.length / 2;
      const shortHalf = h * 0.55;
      // thsize is the text rotation in degrees (0 / 90 / 180 / 270).
      const rot = (((o.thsize || 0) % 360) + 360) % 360;
      if (rot === 90 || rot === 270) {
        ext(o.x - shortHalf, o.y - longHalf);
        ext(o.x + shortHalf, o.y + longHalf);
      } else {
        ext(o.x - longHalf, o.y - shortHalf);
        ext(o.x + longHalf, o.y + shortHalf);
      }
      break;
    }
    default: {
      // LINE / POLY — stroke half-width is lineWidth (the DWORD), NOT o.out
      // (o.out is garbage for in-component lines)
      const w = (o.lineWidth || 0) / 2;
      for (const p of o.polyPoints) {
        ext(p.x - w, p.y - w); ext(p.x + w, p.y + w);
      }
    }
  }
  if (!isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

function bboxOfObjects(objs) {
  let minX =  Infinity, minY =  Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const o of objs) {
    const b = objectBBox(o);
    if (!b) continue;
    if (b.minX < minX) minX = b.minX;
    if (b.minY < minY) minY = b.minY;
    if (b.maxX > maxX) maxX = b.maxX;
    if (b.maxY > maxY) maxY = b.maxY;
  }
  if (!isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

/* ---------------------------------------------------------------------------
 * Electrical nets, derived from the copper geometry.
 *
 * Sprint stores no netlist. `board.connections` looks like one but is the
 * ratsnest — hand-drawn "still to route" reminders that Sprint deletes once
 * the track exists, and empty on every finished board. So connectivity has to
 * come from the shapes: copper that overlaps copper is one net.
 *
 * Every copper object is reduced to a set of capsules (a segment plus a
 * radius), which covers everything Sprint can draw — a track is a chain of
 * them, a round pad is one with a zero-length segment, an elongated pad is one
 * with a real segment, and a polygon is its edges. Two objects touch when any
 * pair of their capsules comes within EPS, or when a vertex of one lands
 * inside the other's polygon. A union-find then merges them into nets.
 * ------------------------------------------------------------------------ */

const NET_COPPER_LAYERS = new Set([LAYER.C1, LAYER.C2, LAYER.I1, LAYER.I2]);
const NET_EPS = 100;             // 0.01 mm — overlapping copper is connected

function capsulesFor(o) {
  const caps = [];
  const seg = (x1, y1, x2, y2, r) => caps.push({ x1, y1, x2, y2, r });
  switch (o.type) {
    case OBJ.THT_PAD: {
      const r = o.out || 0, rd = o.inn || 0;
      if (rd >= r - 1e-6) return caps;            // pure drilling: no copper
      const pp = o.polyPoints || [];
      if (pp.length >= 3) {
        for (let i = 0; i < pp.length; i++) {
          const a = pp[i], b = pp[(i + 1) % pp.length];
          seg(a.x, a.y, b.x, b.y, 0);
        }
      } else if (pp.length === 2 && o.thtShape !== THT_SHAPE.ROUND) {
        seg(pp[0].x, pp[0].y, pp[1].x, pp[1].y, r);
      } else {
        seg(o.x, o.y, o.x, o.y, r);
      }
      break;
    }
    case OBJ.SMD_PAD: {
      const pp = o.polyPoints || [];
      if (pp.length >= 3) {
        for (let i = 0; i < pp.length; i++) {
          const a = pp[i], b = pp[(i + 1) % pp.length];
          seg(a.x, a.y, b.x, b.y, 0);
        }
      } else {
        const hw = (o.out || 0) / 2, hh = (o.inn || 0) / 2;
        seg(o.x - hw, o.y - hh, o.x + hw, o.y - hh, 0);
        seg(o.x + hw, o.y - hh, o.x + hw, o.y + hh, 0);
        seg(o.x + hw, o.y + hh, o.x - hw, o.y + hh, 0);
        seg(o.x - hw, o.y + hh, o.x - hw, o.y - hh, 0);
      }
      break;
    }
    case OBJ.LINE:
    case OBJ.POLY: {
      const pp = o.polyPoints || [];
      const r = (o.lineWidth || 0) / 2;
      for (let i = 0; i + 1 < pp.length; i++) seg(pp[i].x, pp[i].y, pp[i+1].x, pp[i+1].y, r);
      // Sprint auto-closes zones, so the last->first edge is real copper too.
      if (o.type === OBJ.POLY && pp.length >= 3) {
        const a = pp[pp.length - 1], b = pp[0];
        seg(a.x, a.y, b.x, b.y, r);
      }
      break;
    }
    case OBJ.CIRCLE: {
      const rMid = ((o.out || 0) + (o.inn || 0)) / 2;
      const half = Math.abs((o.out || 0) - (o.inn || 0)) / 2;
      const N = 24;
      for (let i = 0; i < N; i++) {
        const a1 = 2*Math.PI*i/N, a2 = 2*Math.PI*(i+1)/N;
        seg(o.x + Math.cos(a1)*rMid, o.y + Math.sin(a1)*rMid,
            o.x + Math.cos(a2)*rMid, o.y + Math.sin(a2)*rMid, half);
      }
      break;
    }
    // TEXT is deliberately absent: Sprint draws it with a stroke font that is
    // not in the file, so its true copper outline is unknowable here. Using
    // the text bbox instead would bridge everything it overlaps. Copper text
    // is decoration in practice, not routing.
  }
  return caps;
}

function pointSegDist2(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx*dx + dy*dy;
  let t = 0;
  if (len2 > 1e-12) {
    t = ((px - x1) * dx + (py - y1) * dy) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
  }
  const ex = px - (x1 + t*dx), ey = py - (y1 + t*dy);
  return ex*ex + ey*ey;
}

// Squared distance between two segments.
//
// The degenerate cases matter more than the general one here: a round pad is a
// zero-length capsule, so "segment vs point" is the single most common query
// on a through-hole board. The classic parallel-segment branch silently
// answers that one with the distance to segment A's *start*, which is how an
// earlier version of this failed to connect tracks to the pads they land on.
function segDist2(a, b) {
  const aDeg = (a.x1 - a.x2) * (a.x1 - a.x2) + (a.y1 - a.y2) * (a.y1 - a.y2) < 1e-9;
  const bDeg = (b.x1 - b.x2) * (b.x1 - b.x2) + (b.y1 - b.y2) * (b.y1 - b.y2) < 1e-9;
  if (aDeg && bDeg) {
    const dx = a.x1 - b.x1, dy = a.y1 - b.y1;
    return dx*dx + dy*dy;
  }
  if (aDeg) return pointSegDist2(a.x1, a.y1, b.x1, b.y1, b.x2, b.y2);
  if (bDeg) return pointSegDist2(b.x1, b.y1, a.x1, a.y1, a.x2, a.y2);

  // Proper segments: if they intersect the distance is zero, otherwise the
  // minimum is attained at one of the four endpoint-to-segment distances.
  const r1x = a.x2 - a.x1, r1y = a.y2 - a.y1;
  const r2x = b.x2 - b.x1, r2y = b.y2 - b.y1;
  const den = r1x * r2y - r1y * r2x;
  if (Math.abs(den) > 1e-12) {
    const qpx = b.x1 - a.x1, qpy = b.y1 - a.y1;
    const t = (qpx * r2y - qpy * r2x) / den;
    const u = (qpx * r1y - qpy * r1x) / den;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return 0;
  }
  return Math.min(
    pointSegDist2(a.x1, a.y1, b.x1, b.y1, b.x2, b.y2),
    pointSegDist2(a.x2, a.y2, b.x1, b.y1, b.x2, b.y2),
    pointSegDist2(b.x1, b.y1, a.x1, a.y1, a.x2, a.y2),
    pointSegDist2(b.x2, b.y2, a.x1, a.y1, a.x2, a.y2));
}

function capsTouch(A, B) {
  for (const a of A) for (const b of B) {
    const reach = a.r + b.r + NET_EPS;
    if (segDist2(a, b) <= reach * reach) return true;
  }
  return false;
}

function pointInPoly(pts, x, y) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y;
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Group every copper object on a board into electrical nets.
 *
 * @returns {{ netOf: Int32Array, nets: Array<number[]>, items: Array }}
 *   netOf[objectIndex] is the net id, or -1 for objects that carry no copper.
 *   nets[netId] is the list of object indices on that net.
 *   items[] carries the capsule geometry, reused for hit-testing.
 */
function buildNets(board) {
  const objs = board.objects;
  const n = objs.length;
  const items = new Array(n).fill(null);

  for (let i = 0; i < n; i++) {
    const o = objs[i];
    if (!NET_COPPER_LAYERS.has(o.layer)) continue;
    const caps = capsulesFor(o);
    if (!caps.length) continue;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const c of caps) {
      minX = Math.min(minX, c.x1 - c.r, c.x2 - c.r);
      minY = Math.min(minY, c.y1 - c.r, c.y2 - c.r);
      maxX = Math.max(maxX, c.x1 + c.r, c.x2 + c.r);
      maxY = Math.max(maxY, c.y1 + c.r, c.y2 + c.r);
    }
    items[i] = {
      i, caps, minX, minY, maxX, maxY, layer: o.layer,
      // A through-pad has copper on every layer, so it bridges them. Sprint:
      // "the pad will appear on both sides of the board automatically".
      thru: o.type === OBJ.THT_PAD && o.metalisation === 1,
      poly: (o.type === OBJ.SMD_PAD || o.type === OBJ.POLY ||
             (o.type === OBJ.THT_PAD && (o.polyPoints || []).length >= 3))
            && (o.polyPoints || []).length >= 3 ? o.polyPoints : null,
    };
  }

  // union-find. Slots n..n+6 are one virtual node per layer's ground plane.
  const POUR_BASE = n;
  const parent = new Int32Array(n + 8);
  for (let i = 0; i < parent.length; i++) parent[i] = i;
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[a] = b; };

  // Uniform grid over the live items, sized to the median object so that a
  // dense board does not degenerate into an all-pairs scan.
  const live = items.filter(Boolean);
  if (!live.length) return { netOf: new Int32Array(n).fill(-1), nets: [], items };
  let sx = 0;
  for (const it of live) sx += (it.maxX - it.minX) + (it.maxY - it.minY);
  const cell = Math.max(sx / (2 * live.length) * 2, 10000);   // >= 1 mm
  const grid = new Map();
  const key = (gx, gy) => gx * 100003 + gy;
  for (const it of live) {
    for (let gx = Math.floor(it.minX/cell); gx <= Math.floor(it.maxX/cell); gx++)
      for (let gy = Math.floor(it.minY/cell); gy <= Math.floor(it.maxY/cell); gy++) {
        const k = key(gx, gy);
        let b = grid.get(k); if (!b) grid.set(k, b = []);
        b.push(it);
      }
  }

  const tested = new Set();
  for (const bucket of grid.values()) {
    for (let a = 0; a < bucket.length; a++) for (let b = a + 1; b < bucket.length; b++) {
      const A = bucket[a], B = bucket[b];
      // Layers only meet through a plated-through pad.
      if (A.layer !== B.layer && !A.thru && !B.thru) continue;
      const pk = A.i < B.i ? A.i * 1000003 + B.i : B.i * 1000003 + A.i;
      if (tested.has(pk)) continue;
      tested.add(pk);
      if (A.maxX + NET_EPS < B.minX || B.maxX + NET_EPS < A.minX ||
          A.maxY + NET_EPS < B.minY || B.maxY + NET_EPS < A.minY) continue;
      let hit = capsTouch(A.caps, B.caps);
      // A pad or track end sitting inside a zone touches it even when no edge
      // comes close. Both ends of every capsule count.
      const inside = (poly, caps) => caps.some(c =>
        pointInPoly(poly, c.x1, c.y1) || pointInPoly(poly, c.x2, c.y2));
      if (!hit && A.poly) hit = inside(A.poly, B.caps);
      if (!hit && B.poly) hit = inside(B.poly, A.caps);
      if (hit) union(A.i, B.i);
    }
  }

  // Ground planes. An object joins its layer's plane when it is allowed to
  // touch it (ground_distance 0) or is bridged to it by thermal spokes.
  const gp = board.groundPane || [];
  for (const it of live) {
    if (!gp[it.layer - 1]) continue;
    const o = objs[it.i];
    const spoked = o.thermobarier === 1 && o.thStyleBytes && o.thStyleBytes[0] !== 0;
    if ((o.groundDist || 0) === 0 || spoked) union(it.i, POUR_BASE + it.layer);
  }

  const netOf = new Int32Array(n).fill(-1);
  const byRoot = new Map();
  const nets = [];
  for (const it of live) {
    const r = find(it.i);
    let id = byRoot.get(r);
    if (id === undefined) { id = nets.length; byRoot.set(r, id); nets.push([]); }
    netOf[it.i] = id;
    nets[id].push(it.i);
  }
  // Record which nets include a ground plane, so callers can say so.
  const pourNets = new Set();
  for (let L = 1; L <= 7; L++) {
    if (!gp[L - 1]) continue;
    const r = find(POUR_BASE + L);
    if (byRoot.has(r)) pourNets.add(byRoot.get(r));
  }
  return { netOf, nets, items, pourNets };
}

/** Topmost copper object whose capsules contain (x, y), or -1. */
function objectAt(items, x, y, slackUnits) {
  const slack = slackUnits || 0;
  let best = -1;
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (!it) continue;
    if (x < it.minX - slack || x > it.maxX + slack ||
        y < it.minY - slack || y > it.maxY + slack) continue;
    const p = { x1: x, y1: y, x2: x, y2: y, r: 0 };
    for (const c of it.caps) {
      const reach = c.r + slack;
      if (segDist2(p, c) <= reach * reach) return it.i;
    }
    if (it.poly && pointInPoly(it.poly, x, y)) return it.i;
  }
  return best;
}

// Expose globals for non-module usage
window.LAY6 = { parseLay6, extractComponents, objectBBox, bboxOfObjects,
                buildNets, objectAt,
                OBJ, LAYER, LAYER_NAME, LAYER_KEY, LAYER_IS_TOP, LAYER_IS_BOTTOM, THT_SHAPE };
