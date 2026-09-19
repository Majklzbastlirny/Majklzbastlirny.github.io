"use strict";

/* ---------- helpers ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const catById = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));

function imgPath(sym, file) {
  const folder = catById[sym.cat].folder;
  return "assets/symbols/" + encodeURIComponent(folder) + "/" + encodeURIComponent(file || sym.file);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
}

/* ---------- i18n ---------- */
const EN_UI = {
  sub: 'All Driver Machine Interface symbols with their meaning, on-screen location and display conditions. Source: <a href="https://www.era.europa.eu/era-folder/1-ccs-tsi-appendix-mandatory-specifications-etcs-b4-r1-rmr-gsm-r-b1-mr1-frmcs-b0-ato-b1" target="_blank" rel="noopener">ERA — CCS TSI Appendix A, index 6</a>. Click any symbol for details.',
  searchPh: "Search… (e.g. pantograph, MO04, acknowledgement)",
  colorAll: "Any colour",
  colorGrey: "Grey (info / automatic)",
  colorYellow: "Yellow (driver action)",
  colorRed: "Red (intervention / failure)",
  colorWhite: "White",
  colorDarkgrey: "Dark grey (disabled)",
  allChip: "All",
  filtersBtn: "Filters",
  filtersShow: "Show filters",
  filtersHide: "Hide filters",
  symbols: n => n + " symbol" + (n === 1 ? "" : "s"),
  empty: "No symbols match your filter.",
  soundsTitle: "DMI sounds (chapter 14)",
  soundsDesc: "Audible information used to draw the driver's attention to the display.",
  where: "Where on the DMI",
  when: "When you will see it",
  remarks: "Remarks",
  specref: "Spec reference",
  specrefBody: ref => "ERA_ERTMS_015560 v4.0.0 — § " + ref + "; symbol tables in chapter 13.",
  mapNote: "Schematic touch-screen layout (640×480 grid, chapter 6.2/6.3). Soft-key layouts differ (H keys below, F keys along the bottom).",
  related: "Related symbols",
  legacyBadge: "not used in v4.0.0",
  missingBadge: "bitmap missing",
  noimg: "bitmap not<br>in symbol set",
  noimgBig: "bitmap not included<br>in the published set",
  cells: "cells",
  example: "(example)",
  close: "✕ close",
  footer: 'Data and bitmaps © European Union Agency for Railways — ERA_ERTMS_015560 v4.0.0 (ETCS Driver Machine Interface), CCS TSI Appendix A index 6. This catalogue is an unofficial study aid; the <a href="index006_-_ERA_ERTMS_015560_v400/ERA_ERTMS_015560_v400.pdf" target="_blank" rel="noopener">specification PDF</a> prevails.',
  quizBtn: "Quiz",
  quizTitle: "DMI symbol quiz",
  qCat: "Categories",
  qAllCats: "All categories",
  qLen: "Questions per round",
  qStart: "Start quiz",
  qDiff: "Difficulty",
  qDiffEasy: "Easy — meanings only, distinct options",
  qDiffNormal: "Normal — meanings + locations",
  qDiffHard: "Hard — 6 options, similar symbols, more locations",
  qMeaning: "What does this symbol mean?",
  qArea: "Where does this symbol appear? Click the area on the DMI.",
  qScore: "Score",
  qStreak: "Streak",
  qOf: (i, n) => "Question " + i + " / " + n,
  qNext: "Next →",
  qFinish: "Finish",
  qCorrect: "Correct!",
  qWrong: "Wrong — correct answer:",
  qOpen: "Open details",
  qDone: "Round finished",
  qResult: (s, n) => "Score: " + s + " of " + n,
  qPerfect: "Perfect round — well done!",
  qWrongNote: "Missed symbols come up more often in later questions until you get them right.",
  qWrongCount: n => "To practise: " + n + " symbol" + (n === 1 ? "" : "s"),
  qAgain: "New round",
  qQuit: "Close",
  /* chapter 15 — system status messages */
  msgsTitle: "System status messages (chapter 15)",
  msgsDesc: "Plain-text messages displayed in the text message area (E5–E9) to explain brake applications, train trips and other system events (Tables 68–70). Clause references point to the SUBSET shown on each message. Only “[name of NTC] failed” and “NL no longer permitted” must be acknowledged by the driver.",
  msgSearchPh: "Filter messages… (e.g. trip, balise, NTC)",
  msgCount: n => n + " message" + (n === 1 ? "" : "s"),
  msgEmpty: "No messages match your filter.",
  msgAck: "must be acknowledged",
  msgConds: n => "Display conditions (" + n + ")",
  msgStart: "Start condition",
  msgEnd: "End condition",
  msgReason: "Reason (table 4.7.2 row)",
  /* reverse lookup by area */
  mapBtn: "Areas",
  mapTitle: "Find symbols by DMI area",
  mapHint: "Click an area in the layout to list every symbol that can appear there. Dotted areas have no symbol assigned.",
  mapPick: "Select an area on the layout.",
  mapOther: "Areas not in the touch layout:"
};

const EN_REL = {
  gy: "Automatic execution vs driver action",
  ack: "Mode and its acknowledgement",
  lvl: "Level and its announcement",
  plan: "Same order in the planning area",
  dis: "Enabled vs disabled button",
  tech: "Touch screen vs soft key",
  fam: "Same family",
  ctx: "Related function"
};

let lang = new URLSearchParams(location.search).get("lang") || localStorage.getItem("dmi-lang") || "en";
if (lang !== "cs") lang = "en";

const trUI = key => (lang === "cs" && CS.ui[key] !== undefined) ? CS.ui[key] : EN_UI[key];
const relLabel = t => (lang === "cs") ? CS.rel[t] : EN_REL[t];
const csSym = sym => (lang === "cs" && CS.syms[sym.id]) || null;
const symName = sym => { const c = csSym(sym); return c ? c[0] : sym.name; };
const symWhen = sym => { const c = csSym(sym); return c ? c[1] : (sym.when || "—"); };
const symRemarks = sym => { const c = csSym(sym); return (c && c[2]) ? c[2] : sym.remarks; };
const symAreaText = sym => {
  if (!sym.areaText) return "";
  return (lang === "cs" && CS.areaTexts[sym.areaText]) ? CS.areaTexts[sym.areaText] : sym.areaText;
};
const symColor = sym => (lang === "cs" && CS.colors[sym.color]) ? CS.colors[sym.color] : (sym.color || "");
const catLabel = c => (lang === "cs" && CS.cats[c.id]) ? CS.cats[c.id][0] : c.label;
const catBlurb = c => (lang === "cs" && CS.cats[c.id]) ? CS.cats[c.id][1] : c.blurb;
const areaInfo = a => (lang === "cs" && CS.areas[a]) ? CS.areas[a] : AREA_INFO[a];
const soundName = s => (lang === "cs" && CS.sounds[s.file]) ? CS.sounds[s.file][0] : s.name;
const soundWhen = s => (lang === "cs" && CS.sounds[s.file]) ? CS.sounds[s.file][1] : s.when;
const msgKey = m => m.text + "@" + m.table;
const csMsg = m => (lang === "cs" && CS.msgs[msgKey(m)]) || null;
const msgText = m => { const c = csMsg(m); return c ? c[0] : m.text; };
const msgMeaning = m => { const c = csMsg(m); return c ? c[1] : m.meaning; };
const msgCond = s => (lang === "cs" && CS.msgConds[s]) ? CS.msgConds[s] : s;
const msgReason = r => (lang === "cs" && CS.msgReasons[r]) ? CS.msgReasons[r] : r;

/* ---------- state ---------- */
let activeCat = "all";
let query = "";
let colorFilter = "all";

/* ---------- static texts / language ---------- */
function applyLang() {
  document.documentElement.lang = lang;
  $("#sub").innerHTML = trUI("sub");
  $("#search").placeholder = trUI("searchPh");
  const sel = $("#colorSel");
  const keep = sel.value || "all";
  sel.innerHTML =
    '<option value="all">' + escapeHtml(trUI("colorAll")) + "</option>" +
    '<option value="grey">' + escapeHtml(trUI("colorGrey")) + "</option>" +
    '<option value="yellow">' + escapeHtml(trUI("colorYellow")) + "</option>" +
    '<option value="red">' + escapeHtml(trUI("colorRed")) + "</option>" +
    '<option value="white">' + escapeHtml(trUI("colorWhite")) + "</option>" +
    '<option value="dark grey">' + escapeHtml(trUI("colorDarkgrey")) + "</option>";
  sel.value = keep;
  $("#quizBtn").textContent = "🎓 " + trUI("quizBtn");
  $("#mapBtn").textContent = "🗺 " + trUI("mapBtn");
  $("#mapTitle").textContent = trUI("mapTitle");
  $("#mapHint").textContent = trUI("mapHint");
  $("#soundsTitle").textContent = trUI("soundsTitle");
  $("#soundsDesc").textContent = trUI("soundsDesc");
  $("#msgsTitle").textContent = trUI("msgsTitle");
  $("#msgsDesc").textContent = trUI("msgsDesc");
  $("#msgSearch").placeholder = trUI("msgSearchPh");
  $("#footer").innerHTML = trUI("footer");
  $("#detailClose").textContent = trUI("close");
  $$(".lang-btn").forEach(b => b.classList.toggle("active", b.dataset.lang === lang));
  applyFiltersCollapsed();
  buildChips();
  buildSounds();
  renderMessages();
  render();
  buildAreaMap();
}

function setLang(l) {
  lang = l;
  localStorage.setItem("dmi-lang", l);
  const dlg = $("#detail");
  const openId = dlg.open ? decodeURIComponent(location.hash.slice(1)) : null;
  applyLang();
  if (openId) openDetail(openId);
}

/* ---------- filter bar ---------- */
/* header.app is sticky, so on a phone the filters can be collapsed out of the
   way. The class is set at every width but only acted on by the phone media
   query, so a stored preference never hides the filters on a desktop. */
let filtersCollapsed = localStorage.getItem("dmi-filters") === "collapsed";

function applyFiltersCollapsed() {
  $("header.app").classList.toggle("collapsed", filtersCollapsed);
  const b = $("#filtersToggle");
  b.textContent = (filtersCollapsed ? "▸ " : "▾ ") + trUI("filtersBtn");
  b.title = trUI(filtersCollapsed ? "filtersShow" : "filtersHide");
  b.setAttribute("aria-expanded", filtersCollapsed ? "false" : "true");
}

function toggleFilters() {
  filtersCollapsed = !filtersCollapsed;
  localStorage.setItem("dmi-filters", filtersCollapsed ? "collapsed" : "open");
  applyFiltersCollapsed();
}

function buildChips() {
  const bar = $("#catChips");
  bar.innerHTML = "";
  const mk = (id, label) => {
    const b = document.createElement("button");
    b.className = "chip" + (id === activeCat ? " active" : "");
    b.textContent = label;
    b.dataset.cat = id;
    b.addEventListener("click", () => { activeCat = id; render(); });
    return b;
  };
  bar.appendChild(mk("all", trUI("allChip")));
  CATEGORIES.forEach(c => bar.appendChild(mk(c.id, catLabel(c))));
}

/* ---------- grid ---------- */
function matches(sym) {
  if (activeCat !== "all" && sym.cat !== activeCat) return false;
  if (colorFilter !== "all" && !(sym.color || "").startsWith(colorFilter)) return false;
  if (query) {
    const hay = [sym.id, sym.name, symName(sym), sym.when, symWhen(sym), sym.remarks, sym.areaText,
                 (sym.areas || []).join(" "), catById[sym.cat].label, catLabel(catById[sym.cat])]
                .join(" ").toLowerCase();
    if (!query.split(/\s+/).every(t => hay.includes(t))) return false;
  }
  return true;
}

function symbolCard(sym) {
  const card = document.createElement("button");
  card.className = "card";
  card.dataset.id = sym.id;
  const imgBox = document.createElement("div");
  imgBox.className = "card-img";
  if (sym.file) {
    const img = document.createElement("img");
    img.alt = sym.id + " " + symName(sym);
    img.loading = "lazy";
    img.src = imgPath(sym);
    img.addEventListener("load", () => { img.style.width = Math.min(img.naturalWidth * 2, 116) + "px"; });
    imgBox.appendChild(img);
  } else {
    imgBox.innerHTML = '<span class="noimg">' + trUI("noimg") + "</span>";
  }
  const meta = document.createElement("div");
  meta.className = "card-meta";
  meta.innerHTML = '<span class="sym-id">' + escapeHtml(sym.id) + "</span>" +
                   '<span class="sym-name">' + escapeHtml(symName(sym)) + "</span>" +
                   '<span class="sym-area">' + escapeHtml(sym.areas && sym.areas.length ? collapseAreas(sym.areas) : (symAreaText(sym) || "")) + "</span>";
  card.appendChild(imgBox);
  card.appendChild(meta);
  card.addEventListener("click", () => openDetail(sym.id));
  return card;
}

/* "B3,B4,B5" -> "B3/4/5" for compact display */
function collapseAreas(areas) {
  if (!areas.length) return "";
  const groups = {};
  for (const a of areas) {
    const m = a.match(/^([A-Z]+)(\d.*)$/);
    if (m) (groups[m[1]] = groups[m[1]] || []).push(m[2]);
    else (groups[a] = groups[a] || []);
  }
  return Object.entries(groups).map(([p, nums]) => nums.length ? p + nums.join("/") : p).join(", ");
}

function render() {
  $$("#catChips .chip").forEach(ch => ch.classList.toggle("active", ch.dataset.cat === activeCat));
  const grid = $("#grid");
  grid.innerHTML = "";
  let count = 0;
  let lastCat = null;
  for (const sym of SYMBOLS) {
    if (!matches(sym)) continue;
    if (sym.cat !== lastCat) {
      lastCat = sym.cat;
      const c = catById[sym.cat];
      const h = document.createElement("div");
      h.className = "cat-head";
      h.innerHTML = "<h2>" + escapeHtml(catLabel(c)) + "</h2><p>" + escapeHtml(catBlurb(c)) + "</p>";
      grid.appendChild(h);
    }
    grid.appendChild(symbolCard(sym));
    count++;
  }
  $("#count").textContent = trUI("symbols")(count);
  if (!count) grid.innerHTML = '<p class="empty">' + escapeHtml(trUI("empty")) + "</p>";
}

/* ---------- DMI map (SVG, touch-screen layout 640x480) ---------- */
const MAP_BASE_AREAS = [
  ["A", 0, 15, 54, 300], ["B", 54, 15, 280, 300], ["C", 0, 315, 334, 50],
  ["D", 334, 15, 246, 300], ["E", 0, 365, 334, 100], ["F", 580, 15, 60, 450],
  ["G", 334, 315, 246, 150]
];

function dmiMapSvg(highlights) {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 640 480");
  svg.setAttribute("class", "dmi-map");
  const rect = (x, y, w, h, cls) => {
    const r = document.createElementNS(NS, "rect");
    r.setAttribute("x", x); r.setAttribute("y", y);
    r.setAttribute("width", w); r.setAttribute("height", h);
    r.setAttribute("class", cls);
    svg.appendChild(r);
    return r;
  };
  const label = (x, y, text, cls) => {
    const t = document.createElementNS(NS, "text");
    t.setAttribute("x", x); t.setAttribute("y", y);
    t.setAttribute("class", cls || "map-label");
    t.textContent = text;
    svg.appendChild(t);
  };
  rect(0, 0, 640, 480, "map-bg");
  for (const [name, x, y, w, h] of MAP_BASE_AREAS) {
    rect(x, y, w, h, "map-area");
    label(x + 5, y + 16, name);
  }
  const c = document.createElementNS(NS, "circle");
  c.setAttribute("cx", 194); c.setAttribute("cy", 165); c.setAttribute("r", 125);
  c.setAttribute("class", "map-dial");
  svg.appendChild(c);

  (highlights || []).forEach(a => {
    const r = AREA_RECTS[a];
    if (!r) return;
    rect(r[0], r[1], r[2], r[3], "map-hl");
    if (r[2] >= 24 && r[3] >= 16) label(r[0] + r[2] / 2, r[1] + r[3] / 2 + 4, a, "map-hl-label");
  });
  return svg;
}

/* ---------- related symbols ---------- */
function relatedHtml(sym) {
  const groups = RELATIONS.filter(g => g.ids.includes(sym.id));
  if (!groups.length) return "";
  let html = "<h4>" + escapeHtml(trUI("related")) + "</h4>";
  for (const g of groups) {
    const others = g.ids.filter(id => id !== sym.id);
    if (!others.length) continue;
    html += '<div class="rel-group"><span class="rel-label">' + escapeHtml(relLabel(g.t)) + "</span><div class='rel-row'>";
    for (const id of others) {
      const other = SYMBOLS.find(s => s.id === id);
      if (!other) continue;
      html += '<button class="rel-thumb" data-rel="' + escapeHtml(id) + '" title="' + escapeHtml(symName(other)) + '">' +
              (other.file ? '<img src="' + imgPath(other) + '" alt="">' : "") +
              "<span>" + escapeHtml(id) + "</span></button>";
    }
    html += "</div></div>";
  }
  return html;
}

/* ---------- detail dialog ---------- */
function openDetail(id) {
  const sym = SYMBOLS.find(s => s.id === id);
  if (!sym) return;
  const cat = catById[sym.cat];
  const dlg = $("#detail");
  const colorClass = (sym.color || "").includes("yellow") ? "c-yellow" :
                     (sym.color || "").includes("red") ? "c-red" :
                     (sym.color || "").includes("white") ? "c-white" :
                     (sym.color || "").includes("dark grey") ? "c-darkgrey" : "c-grey";

  let imgsHtml = "";
  if (sym.file) {
    imgsHtml = '<img class="detail-img" src="' + imgPath(sym) + '" alt="' + escapeHtml(sym.id) + '">';
    (sym.extra || []).forEach(f => {
      imgsHtml += '<figure class="extra"><img class="detail-img" src="' + imgPath(sym, f) + '" alt=""><figcaption>' + escapeHtml(f.replace(".png", "")) + " " + escapeHtml(trUI("example")) + "</figcaption></figure>";
    });
  } else {
    imgsHtml = '<span class="noimg big">' + trUI("noimgBig") + "</span>";
  }

  const areaList = (sym.areas && sym.areas.length)
    ? sym.areas.map(a => "<li><b>" + escapeHtml(a) + "</b>" + (areaInfo(a) ? " — " + escapeHtml(areaInfo(a)) : "") + "</li>").join("")
    : "";
  const remarks = symRemarks(sym);

  $("#detailBody").innerHTML =
    '<div class="detail-top">' +
      '<div class="detail-imgs">' + imgsHtml + "</div>" +
      '<div class="detail-id">' +
        "<h2>" + escapeHtml(sym.id) + (sym.legacy ? ' <span class="badge legacy">' + escapeHtml(trUI("legacyBadge")) + "</span>" : "") + (sym.missing ? ' <span class="badge legacy">' + escapeHtml(trUI("missingBadge")) + "</span>" : "") + "</h2>" +
        "<h3>" + escapeHtml(symName(sym)) + "</h3>" +
        '<p class="tags">' +
          '<span class="badge cat">' + escapeHtml(catLabel(cat)) + "</span>" +
          '<span class="badge ' + colorClass + '">' + escapeHtml(symColor(sym)) + "</span>" +
          '<span class="badge">' + escapeHtml(sym.size) + " " + escapeHtml(trUI("cells")) + "</span>" +
          (sym.tech ? '<span class="badge">' + escapeHtml(sym.tech) + "</span>" : "") +
        "</p>" +
      "</div>" +
    "</div>" +
    '<div class="detail-grid">' +
      "<section><h4>" + escapeHtml(trUI("where")) + "</h4>" +
        (sym.areaText ? "<p>" + escapeHtml(symAreaText(sym)) + "</p>" : "") +
        (areaList ? "<ul>" + areaList + "</ul>" : (sym.areaText ? "" : "<p>—</p>")) +
        '<div id="mapHolder"></div>' +
        '<p class="map-note">' + escapeHtml(trUI("mapNote")) + "</p>" +
      "</section>" +
      "<section><h4>" + escapeHtml(trUI("when")) + "</h4><p>" + escapeHtml(symWhen(sym)) + "</p>" +
        (remarks ? "<h4>" + escapeHtml(trUI("remarks")) + "</h4><p>" + escapeHtml(remarks) + "</p>" : "") +
        "<h4>" + escapeHtml(trUI("specref")) + "</h4><p>" + escapeHtml(trUI("specrefBody")(sym.ref || "13")) + "</p>" +
        relatedHtml(sym) +
      "</section>" +
    "</div>";

  $("#mapHolder").appendChild(dmiMapSvg(sym.areas));

  $$("#detailBody img.detail-img").forEach(img => {
    const apply = () => { img.style.width = Math.min(img.naturalWidth * 4, 300) + "px"; };
    if (img.complete) apply(); else img.addEventListener("load", apply);
  });

  $$("#detailBody .rel-thumb").forEach(btn => {
    btn.addEventListener("click", () => openDetail(btn.dataset.rel));
  });

  if (!dlg.open) dlg.showModal();
  $(".detail-wrap").scrollTop = 0;
  history.replaceState(null, "", "#" + encodeURIComponent(sym.id));
}

/* ---------- sounds ---------- */
function buildSounds() {
  const wrap = $("#sounds");
  wrap.innerHTML = "";
  SOUNDS.forEach(s => {
    const div = document.createElement("div");
    div.className = "sound";
    div.innerHTML =
      '<button class="play" aria-label="Play ' + escapeHtml(soundName(s)) + '">&#9654;</button>' +
      '<div class="sound-meta"><b>' + escapeHtml(soundName(s)) + "</b> " +
      '<span class="badge">' + escapeHtml(s.file) + '</span><span class="badge">§ ' + escapeHtml(s.ref) + "</span>" +
      "<p>" + escapeHtml(soundWhen(s)) + "</p></div>";
    const audio = new Audio("assets/sounds/" + s.file);
    div.querySelector(".play").addEventListener("click", () => { audio.currentTime = 0; audio.play(); });
    wrap.appendChild(div);
  });
}

/* ---------- system status messages (chapter 15) ---------- */
let msgQuery = "";

function renderMessages() {
  const wrap = $("#msgList");
  wrap.innerHTML = "";
  let count = 0;
  for (const m of MESSAGES) {
    if (msgQuery) {
      const hay = [m.text, msgText(m), m.meaning, msgMeaning(m), MSG_TABLES[m.table],
                   m.rows.map(r => r.s + " " + r.r + " " + msgReason(r.r)).join(" ")].join(" ").toLowerCase();
      if (!msgQuery.split(/\s+/).every(t => hay.includes(t))) continue;
    }
    count++;
    const rows = m.rows.map(r =>
      "<tr><td>" + escapeHtml(msgCond(r.s)) + "</td><td>" + escapeHtml(msgCond(r.e)) + "</td><td>" + escapeHtml(msgReason(r.r)) + "</td></tr>").join("");
    const div = document.createElement("div");
    div.className = "msg";
    div.innerHTML =
      '<div class="msg-head"><span class="msg-text">' + escapeHtml(msgText(m)) + "</span>" +
      (msgText(m) !== m.text ? '<span class="msg-orig">' + escapeHtml(m.text) + "</span>" : "") +
      '<span class="badge">' + escapeHtml(MSG_TABLES[m.table]) + "</span>" +
      (m.ack ? '<span class="badge ack">' + escapeHtml(trUI("msgAck")) + "</span>" : "") +
      "</div>" +
      '<p class="msg-meaning">' + escapeHtml(msgMeaning(m)) + "</p>" +
      "<details><summary>" + escapeHtml(trUI("msgConds")(m.rows.length)) + "</summary>" +
      '<table class="msg-table"><thead><tr><th>' + escapeHtml(trUI("msgStart")) + "</th><th>" +
      escapeHtml(trUI("msgEnd")) + "</th><th>" + escapeHtml(trUI("msgReason")) + "</th></tr></thead>" +
      "<tbody>" + rows + "</tbody></table></details>";
    wrap.appendChild(div);
  }
  $("#msgCount").textContent = trUI("msgCount")(count);
  if (!count) wrap.innerHTML = '<p class="empty">' + escapeHtml(trUI("msgEmpty")) + "</p>";
}

/* ---------- reverse lookup: symbols by DMI area ---------- */
const AREA_SYMBOLS = (() => {
  const m = {};
  for (const s of SYMBOLS) for (const a of (s.areas || [])) (m[a] = m[a] || []).push(s.id);
  return m;
})();
let mapSelected = null;

function buildAreaMap() {
  const holder = $("#areaMapHolder");
  holder.innerHTML = "";
  const svg = dmiMapSvg([]);
  const NS = "http://www.w3.org/2000/svg";
  // big areas first so small ones (track-condition slots etc.) stay clickable on top
  const clickable = Object.keys(AREA_RECTS).filter(a => AREA_SYMBOLS[a])
    .sort((a, b) => AREA_RECTS[b][2] * AREA_RECTS[b][3] - AREA_RECTS[a][2] * AREA_RECTS[a][3]);
  for (const a of clickable) {
    const r = AREA_RECTS[a];
    const el = document.createElementNS(NS, "rect");
    el.setAttribute("x", r[0]); el.setAttribute("y", r[1]);
    el.setAttribute("width", r[2]); el.setAttribute("height", r[3]);
    el.setAttribute("class", "map-pick" + (a === mapSelected ? " sel" : ""));
    const t = document.createElementNS(NS, "title");
    t.textContent = a + (areaInfo(a) ? " — " + areaInfo(a) : "");
    el.appendChild(t);
    el.addEventListener("click", () => selectArea(a));
    svg.appendChild(el);
  }
  holder.appendChild(svg);

  const other = $("#areaOther");
  other.innerHTML = "";
  const noRect = Object.keys(AREA_SYMBOLS).filter(a => !AREA_RECTS[a]).sort();
  if (noRect.length) {
    const lab = document.createElement("span");
    lab.className = "rel-label";
    lab.textContent = trUI("mapOther");
    other.appendChild(lab);
    for (const a of noRect) {
      const b = document.createElement("button");
      b.className = "chip" + (a === mapSelected ? " active" : "");
      b.textContent = a;
      b.addEventListener("click", () => selectArea(a));
      other.appendChild(b);
    }
  }
  renderAreaResult();
}

function selectArea(a) {
  mapSelected = a;
  buildAreaMap();
}

function renderAreaResult() {
  const box = $("#areaResult");
  if (!mapSelected || !AREA_SYMBOLS[mapSelected]) {
    box.innerHTML = '<p class="map-pick-hint">' + escapeHtml(trUI("mapPick")) + "</p>";
    return;
  }
  const ids = AREA_SYMBOLS[mapSelected];
  let html = '<h3>' + escapeHtml(mapSelected) +
             (areaInfo(mapSelected) ? " — " + escapeHtml(areaInfo(mapSelected)) : "") +
             ' <span class="badge">' + escapeHtml(trUI("symbols")(ids.length)) + "</span></h3>" +
             '<div class="rel-row area-row">';
  for (const id of ids) {
    const sym = SYMBOLS.find(s => s.id === id);
    html += '<button class="rel-thumb" data-rel="' + escapeHtml(id) + '" title="' + escapeHtml(symName(sym)) + '">' +
            (sym.file ? '<img src="' + imgPath(sym) + '" alt="">' : "") +
            "<span>" + escapeHtml(id) + "</span></button>";
  }
  box.innerHTML = html + "</div>";
  $$("#areaResult .rel-thumb").forEach(btn => {
    btn.addEventListener("click", () => openDetail(btn.dataset.rel));
  });
}

/* ---------- init ---------- */
document.addEventListener("DOMContentLoaded", () => {
  $("#search").addEventListener("input", e => { query = e.target.value.trim().toLowerCase(); render(); });
  $("#colorSel").addEventListener("change", e => { colorFilter = e.target.value; render(); });
  $$(".lang-btn").forEach(b => b.addEventListener("click", () => setLang(b.dataset.lang)));
  $("#filtersToggle").addEventListener("click", toggleFilters);
  $("#detailClose").addEventListener("click", () => $("#detail").close());
  $("#detail").addEventListener("click", e => { if (e.target === $("#detail")) $("#detail").close(); });
  $("#detail").addEventListener("close", () => history.replaceState(null, "", location.pathname + location.search));
  $("#msgSearch").addEventListener("input", e => { msgQuery = e.target.value.trim().toLowerCase(); renderMessages(); });
  $("#mapBtn").addEventListener("click", () => $("#areamap").showModal());
  $("#mapClose").addEventListener("click", () => $("#areamap").close());
  $("#areamap").addEventListener("click", e => { if (e.target === $("#areamap")) $("#areamap").close(); });
  applyLang();
  const hash = decodeURIComponent(location.hash.slice(1));
  if (hash) openDetail(hash);
  const params = new URLSearchParams(location.search);
  const area = params.get("area");
  if (area && AREA_SYMBOLS[area]) selectArea(area);
  if (params.get("map") || (area && AREA_SYMBOLS[area])) $("#areamap").showModal();
});
