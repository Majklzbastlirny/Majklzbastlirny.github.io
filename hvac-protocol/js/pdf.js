// Czech PDF protocol, generated in the browser with jsPDF.
// Port of hvac_protocol.generate_pdf(): same A4 layout, one page per HVAC unit.
// Font: Carlito (metric-compatible with Calibri, SIL OFL), see tools/make_pdf_font.py.

import { steps, getValue, calc, units } from './model.js';
import { stepLabel, calcLabel } from './i18n.js';

const LANG = 'cs';
const K = 72 / 25.4;            // pt per mm
const LM = 10;                  // left margin
const TOP = 10;                 // top margin
const BREAK_Y = 297 - 18;       // auto page break (fpdf: margin=18)
const C_MARGIN = 1;             // cell text padding (fpdf default)
const LABEL_W = 120;
const VALUE_W = 30;
const UNIT_W = 20;
const FULL_W = LABEL_W + VALUE_W + UNIT_W;
const ROW_H = 5.5;

let libPromise = null;
let fontPromise = null;

function loadJsPdf() {
  if (!libPromise) {
    libPromise = new Promise((resolve, reject) => {
      if (window.jspdf) return resolve(window.jspdf);
      const s = document.createElement('script');
      s.src = new URL('../vendor/jspdf.umd.min.js', import.meta.url).href;
      s.onload = () => resolve(window.jspdf);
      s.onerror = () => { libPromise = null; reject(new Error('Could not load jsPDF')); };
      document.head.append(s);
    });
  }
  return libPromise;
}

function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

function loadFonts() {
  if (!fontPromise) {
    const get = async (name) => {
      const res = await fetch(new URL(`../fonts/${name}`, import.meta.url));
      if (!res.ok) throw new Error(`fonts/${name}: HTTP ${res.status}`);
      return toBase64(await res.arrayBuffer());
    };
    fontPromise = Promise.all([get('Carlito-Regular.ttf'), get('Carlito-Bold.ttf')])
      .then(([regular, bold]) => ({ regular, bold }))
      .catch((e) => { fontPromise = null; throw e; });
  }
  return fontPromise;
}

const fmtVal = (v, decimals = 3) => (v === null || v === undefined ? '-' : Number(v).toFixed(decimals));

/**
 * @param protocol   protocol object
 * @param selection  [{carIdx, key}] units to include (null = all)
 * @returns Blob (application/pdf)
 */
export async function generatePdf(protocol, selection = null) {
  const [{ jsPDF }, fonts] = await Promise.all([loadJsPdf(), loadFonts()]);
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  doc.addFileToVFS('Carlito-Regular.ttf', fonts.regular);
  doc.addFont('Carlito-Regular.ttf', 'Carlito', 'normal');
  doc.addFileToVFS('Carlito-Bold.ttf', fonts.bold);
  doc.addFont('Carlito-Bold.ttf', 'Carlito', 'bold');
  doc.setProperties({ title: `Protokol HVAC ${protocol.train_id} ${protocol.date}`, creator: 'HVAC Protocol Tool' });
  doc.setLineWidth(0.2);
  doc.setDrawColor(0);

  let y = TOP;

  function setFont(size, bold = false, color = 0) {
    doc.setFont('Carlito', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.setTextColor(color);
  }

  // fpdf-style cell: optional fill, borders ('LTRB' subset or 1 = all), aligned text.
  function cell(x, top, w, hgt, text, { border = '', align = 'L', fill = null, size = 9, bold = false, color = 0 } = {}) {
    if (fill !== null) {
      doc.setFillColor(fill);
      doc.rect(x, top, w, hgt, 'F');
    }
    const b = border === 1 ? 'LTRB' : border;
    if (b.includes('L')) doc.line(x, top, x, top + hgt);
    if (b.includes('T')) doc.line(x, top, x + w, top);
    if (b.includes('R')) doc.line(x + w, top, x + w, top + hgt);
    if (b.includes('B')) doc.line(x, top + hgt, x + w, top + hgt);
    if (text) {
      setFont(size, bold, color);
      const baseline = top + 0.5 * hgt + 0.3 * (size / K);
      const tx = align === 'R' ? x + w - C_MARGIN : align === 'C' ? x + w / 2 : x + C_MARGIN;
      doc.text(String(text), tx, baseline, { align: align === 'R' ? 'right' : align === 'C' ? 'center' : 'left' });
    }
  }

  function ensure(hgt) {
    if (y + hgt > BREAK_Y) {
      doc.addPage();
      y = TOP;
    }
  }

  function tableRow(label, value, unit = '', { bold = false, bg = false } = {}) {
    ensure(ROW_H);
    const fill = bg ? 230 : null;
    cell(LM, y, LABEL_W, ROW_H, `  ${label}`, { border: 'LTB', fill, bold });
    cell(LM + LABEL_W, y, VALUE_W, ROW_H, value, { border: 'TB', align: 'R', fill, bold });
    cell(LM + LABEL_W + VALUE_W, y, UNIT_W, ROW_H, ` ${unit}`, { border: 'RTB', fill, bold });
    y += ROW_H;
  }

  function sectionHeader(title) {
    ensure(ROW_H + 1);
    cell(LM, y, FULL_W, ROW_H + 1, `  ${title}`, { border: 1, fill: 200, size: 10, bold: true });
    y += ROW_H + 1;
  }

  // Wrapped text rows framed left/right: first line gets `prefix`, the rest are indented to match.
  function wrappedRows(prefix, text, lineH, size, color) {
    setFont(size, false, color);
    const indent = doc.getTextWidth(prefix);
    const lines = doc.splitTextToSize(String(text), FULL_W - 2 * C_MARGIN - indent);
    lines.forEach((line, i) => {
      ensure(lineH);
      cell(LM, y, FULL_W, lineH, '', { border: 'LR' });
      setFont(size, false, color);
      doc.text(i === 0 ? prefix + line : line, LM + C_MARGIN + (i === 0 ? 0 : indent),
        y + 0.5 * lineH + 0.3 * (size / K));
      y += lineH;
    });
  }

  const wanted = selection
    ? units(protocol).filter((u) => selection.some((s) => s.carIdx === u.carIdx && s.key === u.key))
    : units(protocol);

  wanted.forEach(({ car, section }, pageIdx) => {
    const type = section.type;
    const isSalon = type === 'salon';
    const all = steps(type);
    const value = (st) => getValue(section, st);
    const note = (sid) => section.notes?.[sid];
    const renderNote = (sid) => { if (note(sid)) wrappedRows('    * ', note(sid), 4, 8, 100); };

    if (pageIdx > 0) doc.addPage();
    y = TOP;

    // --- Header ---
    cell(LM, y, 190, 8, `Protokol HVAC - ${isSalon ? 'Salon' : 'Kabina'}`, { size: 14, bold: true });
    y += 8;
    const yTop = y;
    const amb = protocol.ambient_temp;
    cell(LM, yTop, 50, 6, `Vůz: ${car.uic || '-'}`, { size: 10 });
    cell(110, yTop, 50, 6, `Datum: ${protocol.date || '-'}`, { size: 10 });
    cell(LM, yTop + 6, 50, 6, `Označení: ${car.label || '-'}`, { size: 10 });
    cell(110, yTop + 6, 50, 6, `Teplota okolí: ${amb === null || amb === undefined ? '-' : `${fmtVal(amb, 1)} °C`}`, { size: 10 });
    cell(LM, yTop + 12, 50, 6, `Vlak: ${protocol.train_id || '-'}`, { size: 10 });
    y = yTop + 20;

    // --- Checks ---
    sectionHeader('Kontroly / Zkoušky');
    all.filter((st) => st.kind === 'check').forEach((st, i) => {
      tableRow(stepLabel(LANG, type, st.id), value(st) || '-', '', { bg: i % 2 === 0 });
      renderNote(st.id);
    });
    y += 3;

    // --- Direct measurements + calculated values ---
    sectionHeader('Měření');
    let rowI = 0;
    for (const st of all.filter((s) => s.kind === 'meas' && !s.raw)) {
      tableRow(stepLabel(LANG, type, st.id), fmtVal(value(st)), st.unit, { bg: rowI % 2 === 0 });
      renderNote(st.id);
      rowI += 1;
    }
    const calcs = calc(section);
    if (calcs.length) {
      y += 1;
      ensure(4);
      cell(LM, y, FULL_W, 4, '  Vypočtené hodnoty (z raw dat):', { size: 8, bold: true, color: 100 });
      y += 4;
      for (const c of calcs) {
        tableRow(calcLabel(LANG, type, c.key), fmtVal(c.value), c.unit, { bg: rowI % 2 === 0 });
        rowI += 1;
      }
    }
    y += 3;

    // --- Raw data (clamp meter readings) ---
    const rawSteps = all.filter((s) => s.kind === 'meas' && s.raw);
    if (rawSteps.length) {
      sectionHeader('Surová data z měřidel');
      rawSteps.forEach((st, i) => {
        tableRow(stepLabel(LANG, type, st.id), fmtVal(value(st)), st.unit, { bg: i % 2 === 0 });
        renderNote(st.id);
      });
    }
    y += 3;

    // --- Notes summary ---
    const allNotes = Object.entries(section.notes || {}).filter(([, v]) => v);
    if (allNotes.length) {
      sectionHeader('Poznámky');
      for (const [sid, text] of allNotes) wrappedRows('  ', `${stepLabel(LANG, type, sid)}: ${text}`, 5, 8, 0);
      doc.line(LM, y, LM + FULL_W, y);
      y += 0.5;
    }
  });

  // --- Footer: "Strana X/Y" ---
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i += 1) {
    doc.setPage(i);
    cell(LM, 297 - 12, 190, 8, `Strana ${i}/${pages}`, { size: 8, color: 140, align: 'C' });
  }

  return doc.output('blob');
}
