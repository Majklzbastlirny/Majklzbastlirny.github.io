"use strict";

/* Quiz / training mode.
   - meaning questions: identify the symbol from 4 (easy/normal) or 6 (hard) options
   - location questions: click the DMI area where the symbol appears (normal/hard)
   - difficulty changes the question mix, option count and distractor similarity
   - wrong answers are stored (localStorage) and come up more often
   - bilingual via app.js helpers (trUI, symName, collapseAreas, symAreaText) */

const QUIZ_WRONG_KEY = "dmi-quiz-wrong";
const QUIZ_DIFF_KEY = "dmi-quiz-diff";

const Quiz = {
  pool: [], qcount: 10, idx: 0, score: 0, streak: 0,
  current: null, lastId: null, results: [],

  /* difficulty: question mix, number of options, distractor strategy */
  DIFF: {
    easy:   { opts: 4, mapProb: 0 },
    normal: { opts: 4, mapProb: 0.35 },
    hard:   { opts: 6, mapProb: 0.5 }
  },
  diff: "normal",

  wrongSet() {
    try { return new Set(JSON.parse(localStorage.getItem(QUIZ_WRONG_KEY) || "[]")); }
    catch { return new Set(); }
  },
  saveWrong(set) { localStorage.setItem(QUIZ_WRONG_KEY, JSON.stringify([...set])); },

  eligible(catId) {
    return SYMBOLS.filter(s => s.file && !s.legacy && (catId === "all" || s.cat === catId));
  },

  /* a symbol can be asked as a map-click question if it has at least one area on the touch layout */
  mapEligible(sym) {
    return (sym.areas || []).some(a => AREA_RECTS[a]);
  },

  areaStr(sym) {
    return (sym.areas && sym.areas.length) ? collapseAreas(sym.areas) : (symAreaText(sym) || "");
  },

  pickSym() {
    const wrong = [...this.wrongSet()].filter(id => this.pool.some(s => s.id === id && s.id !== this.lastId));
    if (wrong.length && Math.random() < 0.35) {
      const id = wrong[Math.floor(Math.random() * wrong.length)];
      return this.pool.find(s => s.id === id);
    }
    let sym;
    do { sym = this.pool[Math.floor(Math.random() * this.pool.length)]; }
    while (this.pool.length > 1 && sym.id === this.lastId);
    return sym;
  },

  makeQuestion() {
    const cfg = this.DIFF[this.diff] || this.DIFF.normal;
    const sym = this.pickSym();
    this.lastId = sym.id;

    if (this.mapEligible(sym) && Math.random() < cfg.mapProb) {
      this.current = { sym, type: "map", answered: false };
      return;
    }

    const correct = symName(sym);
    const sameCat = this.shuffle(SYMBOLS.filter(s => s.cat === sym.cat && s.id !== sym.id));
    const others = this.shuffle(SYMBOLS.filter(s => s.cat !== sym.cat));
    let ordered;
    if (this.diff === "easy") {
      ordered = [...others, ...sameCat];
    } else if (this.diff === "hard") {
      const relIds = new Set(RELATIONS.filter(g => g.ids.includes(sym.id)).flatMap(g => g.ids));
      relIds.delete(sym.id);
      const rel = this.shuffle(SYMBOLS.filter(s => relIds.has(s.id)));
      ordered = [...rel, ...sameCat.filter(s => !relIds.has(s.id)), ...others];
    } else {
      ordered = [...sameCat, ...others];
    }
    const candidates = ordered.map(s => symName(s));
    const opts = [correct];
    for (const c of candidates) {
      if (opts.length >= cfg.opts) break;
      if (!opts.includes(c)) opts.push(c);
    }
    this.shuffle(opts);
    this.current = { sym, type: "meaning", opts, correctIdx: opts.indexOf(correct), answered: false };
  },

  /* pure grading helper for map questions (also used by tools/verify_quiz.js) */
  mapCorrect(area) {
    return (this.current.sym.areas || []).includes(area);
  },

  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  },

  /* ---------- UI ---------- */
  open() {
    this.renderStart();
    const dlg = $("#quiz");
    if (!dlg.open) dlg.showModal();
  },

  renderStart() {
    const stored = localStorage.getItem(QUIZ_DIFF_KEY);
    if (this.DIFF[stored]) this.diff = stored;
    const catOpts = ['<option value="all">' + escapeHtml(trUI("qAllCats")) + "</option>"]
      .concat(CATEGORIES.map(c => '<option value="' + c.id + '">' + escapeHtml(catLabel(c)) + "</option>")).join("");
    const diffOpts = ["easy", "normal", "hard"].map(d =>
      '<option value="' + d + '"' + (d === this.diff ? " selected" : "") + ">" +
      escapeHtml(trUI("qDiff" + d[0].toUpperCase() + d.slice(1))) + "</option>").join("");
    const wrongN = [...this.wrongSet()].length;
    $("#quizBody").innerHTML =
      "<h2>" + escapeHtml(trUI("quizTitle")) + "</h2>" +
      '<div class="quiz-setup">' +
        "<label>" + escapeHtml(trUI("qDiff")) + '<br><select id="quizDiff">' + diffOpts + "</select></label>" +
        "<label>" + escapeHtml(trUI("qCat")) + '<br><select id="quizCat">' + catOpts + "</select></label>" +
        "<label>" + escapeHtml(trUI("qLen")) + '<br><select id="quizLen"><option>10</option><option>20</option></select></label>' +
      "</div>" +
      (wrongN ? '<p class="quiz-note">' + escapeHtml(trUI("qWrongCount")(wrongN)) + " — " + escapeHtml(trUI("qWrongNote")) + "</p>" : "") +
      '<div class="quiz-actions"><button id="quizStart" class="qbtn primary">' + escapeHtml(trUI("qStart")) + "</button></div>";
    $("#quizStart").addEventListener("click", () => {
      this.diff = $("#quizDiff").value;
      localStorage.setItem(QUIZ_DIFF_KEY, this.diff);
      this.pool = this.eligible($("#quizCat").value);
      if (this.pool.length < 4) this.pool = this.eligible("all");
      this.qcount = parseInt($("#quizLen").value, 10);
      this.idx = 0; this.score = 0; this.streak = 0; this.results = []; this.lastId = null;
      this.next();
    });
  },

  next() {
    if (this.idx >= this.qcount) return this.renderEnd();
    this.idx++;
    this.makeQuestion();
    this.renderQuestion();
  },

  renderQuestion() {
    const q = this.current;
    const head =
      '<div class="quiz-head">' +
        "<span>" + escapeHtml(trUI("qOf")(this.idx, this.qcount)) + "</span>" +
        "<span>" + escapeHtml(trUI("qScore")) + ": <b>" + this.score + "</b> · " + escapeHtml(trUI("qStreak")) + ": <b>" + this.streak + "</b></span>" +
      "</div>" +
      '<div class="quiz-symbol"><img id="quizImg" src="' + imgPath(q.sym) + '" alt="?"></div>';

    if (q.type === "map") {
      $("#quizBody").innerHTML = head +
        "<p class='quiz-q'>" + escapeHtml(trUI("qArea")) + "</p>" +
        '<div id="quizMap" class="quiz-map"></div>' +
        '<div id="quizFeedback"></div>';
    } else {
      const optsHtml = q.opts.map((o, i) =>
        '<button class="qopt" data-i="' + i + '">' + escapeHtml(o) + "</button>").join("");
      $("#quizBody").innerHTML = head +
        "<p class='quiz-q'>" + escapeHtml(trUI("qMeaning")) + "</p>" +
        '<div class="quiz-opts">' + optsHtml + "</div>" +
        '<div id="quizFeedback"></div>';
    }

    const img = $("#quizImg");
    const apply = () => { img.style.width = Math.min(img.naturalWidth * 3, 220) + "px"; };
    if (img.complete) apply(); else img.addEventListener("load", apply);

    if (q.type === "map") {
      const svg = dmiMapSvg([]);
      const NS = "http://www.w3.org/2000/svg";
      const clickable = Object.keys(AREA_RECTS).filter(a => AREA_SYMBOLS[a])
        .sort((x, y) => AREA_RECTS[y][2] * AREA_RECTS[y][3] - AREA_RECTS[x][2] * AREA_RECTS[x][3]);
      for (const a of clickable) {
        const r = AREA_RECTS[a];
        const el = document.createElementNS(NS, "rect");
        el.setAttribute("x", r[0]); el.setAttribute("y", r[1]);
        el.setAttribute("width", r[2]); el.setAttribute("height", r[3]);
        el.setAttribute("class", "map-pick");
        el.dataset.area = a;
        el.addEventListener("click", () => this.answerMap(a, svg));
        svg.appendChild(el);
      }
      $("#quizMap").appendChild(svg);
    } else {
      $$("#quizBody .qopt").forEach(b => b.addEventListener("click", () => this.answer(parseInt(b.dataset.i, 10))));
    }
  },

  answer(i) {
    const q = this.current;
    if (q.answered) return;
    q.answered = true;
    const ok = i === q.correctIdx;
    this.record(ok);
    $$("#quizBody .qopt").forEach((b, bi) => {
      b.disabled = true;
      if (bi === q.correctIdx) b.classList.add("correct");
      else if (bi === i) b.classList.add("wrong");
    });
    this.feedback(ok, q.opts[q.correctIdx]);
  },

  answerMap(area, svg) {
    const q = this.current;
    if (q.answered) return;
    q.answered = true;
    const ok = this.mapCorrect(area);
    this.record(ok);
    svg.classList.add("done");
    $$(".map-pick", svg).forEach(r => {
      const ra = r.dataset.area;
      if ((q.sym.areas || []).includes(ra)) r.classList.add("ok");
      else if (ra === area) r.classList.add("bad");
    });
    this.feedback(ok, this.areaStr(q.sym));
  },

  record(ok) {
    const q = this.current;
    const wrong = this.wrongSet();
    if (ok) { this.score++; this.streak++; wrong.delete(q.sym.id); }
    else { this.streak = 0; wrong.add(q.sym.id); }
    this.saveWrong(wrong);
    this.results.push({ id: q.sym.id, ok });
  },

  feedback(ok, correctText) {
    const q = this.current;
    const fb = $("#quizFeedback");
    fb.innerHTML =
      '<p class="' + (ok ? "fb-ok" : "fb-bad") + '"><b>' +
        escapeHtml(ok ? trUI("qCorrect") : trUI("qWrong")) + "</b>" +
        (ok ? "" : " " + escapeHtml(correctText)) + "</p>" +
      '<p class="fb-when">' + escapeHtml(q.sym.id) + " — " + escapeHtml(this.trim(symWhen(q.sym), 220)) + "</p>" +
      '<div class="quiz-actions">' +
        '<button id="quizDetail" class="qbtn">' + escapeHtml(trUI("qOpen")) + "</button>" +
        '<button id="quizNext" class="qbtn primary">' + escapeHtml(this.idx >= this.qcount ? trUI("qFinish") : trUI("qNext")) + "</button>" +
      "</div>";
    $("#quizNext").addEventListener("click", () => this.next());
    $("#quizDetail").addEventListener("click", () => openDetail(q.sym.id));
    $("#quizNext").focus();
  },

  trim(s, n) { return s.length > n ? s.slice(0, n).replace(/\s+\S*$/, "") + "…" : s; },

  renderEnd() {
    const missed = this.results.filter(r => !r.ok);
    $("#quizBody").innerHTML =
      "<h2>" + escapeHtml(trUI("qDone")) + "</h2>" +
      '<p class="quiz-result">' + escapeHtml(trUI("qResult")(this.score, this.qcount)) + "</p>" +
      (missed.length
        ? '<div class="quiz-missed">' + missed.map(r => '<button class="rel-thumb" data-rel="' + escapeHtml(r.id) + '"><span>' + escapeHtml(r.id) + "</span></button>").join("") + "</div>" +
          '<p class="quiz-note">' + escapeHtml(trUI("qWrongNote")) + "</p>"
        : '<p class="quiz-note">' + escapeHtml(trUI("qPerfect")) + "</p>") +
      '<div class="quiz-actions">' +
        '<button id="quizAgain" class="qbtn primary">' + escapeHtml(trUI("qAgain")) + "</button>" +
        '<button id="quizQuit" class="qbtn">' + escapeHtml(trUI("qQuit")) + "</button>" +
      "</div>";
    $("#quizAgain").addEventListener("click", () => this.renderStart());
    $("#quizQuit").addEventListener("click", () => $("#quiz").close());
    $$("#quizBody .rel-thumb").forEach(b => b.addEventListener("click", () => openDetail(b.dataset.rel)));
  }
};

document.addEventListener("DOMContentLoaded", () => {
  $("#quizBtn").addEventListener("click", () => Quiz.open());
  $("#quizClose").addEventListener("click", () => $("#quiz").close());
  $("#quiz").addEventListener("click", e => { if (e.target === $("#quiz")) $("#quiz").close(); });
  if (new URLSearchParams(location.search).get("quiz")) Quiz.open();
});
