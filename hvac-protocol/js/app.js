// HVAC Protocol Tool - web app (phone + desktop).
// Screens: home (protocol list) -> protocol (train info + units) -> unit (steps).
// Every change is written to IndexedDB within ~0.3 s (see markDirty / flushSave).

import * as M from './model.js';
import * as I from './i18n.js';
import * as store from './store.js';
import { generatePdf } from './pdf.js';
import { h, icon, openDialog, alertDialog, closeAllDialogs, toast, busy, KEEP_OPEN } from './ui.js';

const LANGS = ['en', 'cs'];
const LANG_NAMES = { en: 'EN', cs: 'CZ' };
const BACKUP_FORMAT = 'hvac-protocols-backup';
const SAVE_DELAY_MS = 300;
const WIDE = window.matchMedia('(min-width: 1000px)');
const FINE_POINTER = window.matchMedia('(pointer: fine)');

const state = {
  lang: LANGS.includes(pref('lang')) ? pref('lang') : 'en',
  records: new Map(),          // id -> {id, protocol, savedAt, backedUpAt}
  storage: 'unknown',
  installEvent: null,
  saveState: 'saved',          // 'saved' | 'saving' | 'error'
  saveError: '',
};

const tr = (key, vars) => I.t(state.lang, key, vars);

function pref(key) {
  try { return localStorage.getItem(`hvac.${key}`); } catch { return null; }
}
function setPref(key, value) {
  try { localStorage.setItem(`hvac.${key}`, value); } catch { /* private mode */ }
}

// === Saving ======================================================================

const pending = new Set();
let saveTimer = null;
let saveEl = null;

function markDirty(rec) {
  rec.protocol.modified = M.localIso();
  pending.add(rec);
  setSaveState('saving');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, SAVE_DELAY_MS);
}

async function flushSave() {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (!pending.size) return;
  const recs = [...pending];
  pending.clear();
  const now = Date.now();
  for (const r of recs) r.savedAt = now;
  try {
    await store.putMany(recs);
    if (!pending.size) setSaveState('saved');
  } catch (e) {
    for (const r of recs) pending.add(r);
    setSaveState('error', e?.message || String(e));
    saveTimer = setTimeout(flushSave, 3000);
  }
}

function setSaveState(s, error = '') {
  state.saveState = s;
  state.saveError = error;
  renderSaveState();
}

function renderSaveState() {
  if (!saveEl) return;
  const s = state.saveState;
  saveEl.className = `save-state ${s}`;
  saveEl.replaceChildren(
    s === 'error' ? icon('alert') : s === 'saved' ? icon('check') : h('span', { class: 'dot' }),
    h('span', null, s === 'error' ? tr('not_saved') : s === 'saved' ? tr('saved') : tr('saving')),
  );
  saveEl.title = s === 'error' ? state.saveError : '';
  document.body.classList.toggle('save-error', s === 'error');
}

const needsBackup = (rec) => !rec.backedUpAt || rec.savedAt > rec.backedUpAt;

async function markBackedUp(recs) {
  const now = Date.now();
  for (const r of recs) r.backedUpAt = Math.max(now, r.savedAt || 0);
  try {
    await store.putMany(recs);
  } catch (e) {
    toast(`${tr('not_saved')}: ${e?.message || e}`, { kind: 'error' });
  }
}

// === Routing =====================================================================

const navStack = [];
let replacing = false;

function currentHash() {
  return location.hash || '#/';
}

function parseRoute() {
  const parts = currentHash().replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  if (parts[0] === 'new') return { name: 'new' };
  if (parts[0] === 'p' && parts[1]) {
    if (parts.length >= 4) return { name: 'unit', id: parts[1], car: Number(parts[2]), sec: parts[3] };
    return { name: 'protocol', id: parts[1] };
  }
  return { name: 'home' };
}

const protocolHash = (id) => `#/p/${encodeURIComponent(id)}`;
const unitHash = (id, u) => `${protocolHash(id)}/${u.carIdx}/${u.key}`;

function navigate(hash, { replace = false } = {}) {
  if (hash === currentHash()) return render();
  if (replace) {
    replacing = true;
    location.replace(hash);
  } else {
    location.hash = hash;
  }
}

/** App-bar back button: real history back when the parent is the previous page. */
function goUp(parentHash) {
  if (navStack.length >= 2 && navStack[navStack.length - 2] === parentHash) history.back();
  else navigate(parentHash, { replace: true });
}

function onHashChange() {
  const hash = currentHash();
  if (replacing) {
    navStack[navStack.length - 1] = hash;
    replacing = false;
  } else if (navStack.length >= 2 && navStack[navStack.length - 2] === hash) {
    navStack.pop();
  } else {
    navStack.push(hash);
  }
  closeAllDialogs();
  render();
}

function render({ keepScroll = false } = {}) {
  const route = parseRoute();
  let view;
  try {
    if (route.name === 'new') view = viewNew();
    else if (route.name === 'protocol') view = viewProtocol(route);
    else if (route.name === 'unit') view = viewUnit(route);
    else view = viewHome();
  } catch (e) {
    console.error(e);
    view = viewError(e);
  }
  if (!view) return;
  const y = window.scrollY;
  document.getElementById('app').replaceChildren(...[view].flat());
  document.documentElement.lang = state.lang;
  renderSaveState();
  window.scrollTo(0, keepScroll ? y : 0);
}

// === Shared pieces ===============================================================

function appBar({ back, title, sub }) {
  saveEl = h('div', { class: 'save-state', role: 'status' });
  return h('header', { class: 'appbar' },
    back
      ? h('button', { class: 'icon-btn', type: 'button', 'aria-label': tr('back'), onclick: () => goUp(back) }, icon('back'))
      : h('div', { class: 'appbar-logo' }, icon('snow')),
    h('div', { class: 'appbar-title' },
      h('h1', null, title),
      sub ? h('div', { class: 'appbar-sub' }, sub) : null),
    saveEl,
    h('div', { class: 'lang-toggle', role: 'group', 'aria-label': 'Language' },
      LANGS.map((lang) => h('button', {
        type: 'button',
        class: lang === state.lang ? 'active' : '',
        'aria-pressed': String(lang === state.lang),
        onclick: () => {
          if (lang === state.lang) return;
          state.lang = lang;
          setPref('lang', lang);
          render({ keepScroll: true });
        },
      }, LANG_NAMES[lang]))),
  );
}

function progressBar(filled, total) {
  const pct = total ? Math.round((filled / total) * 100) : 0;
  return h('div', { class: `progress ${filled === total ? 'done' : ''}` },
    h('div', { class: 'progress-track' }, h('div', { class: 'progress-fill', style: `width:${pct}%` })),
    h('span', { class: 'progress-text' }, `${filled}/${total}`));
}

function field(label, control, hint) {
  return h('label', { class: 'field' },
    h('span', { class: 'field-label' }, label),
    control,
    hint ? h('span', { class: 'field-hint' }, hint) : null);
}

/** Decimal input: accepts ',' or '.', optional ± key (keeps focus/keyboard open). */
function numberInput({ value, signed = false, placeholder = '', label = '', onValue, onEnter, enterHint = 'next' }) {
  let current = value;
  const input = h('input', {
    type: 'text', inputmode: 'decimal', enterkeyhint: enterHint, autocomplete: 'off',
    autocorrect: 'off', spellcheck: 'false', class: 'num', placeholder, 'aria-label': label,
    value: M.fmtNumber(value),
  });
  input.addEventListener('input', () => {
    const r = M.parseNumber(input.value);
    input.classList.toggle('invalid', !r.ok);
    if (r.ok && r.value !== current) {
      current = r.value;
      onValue(r.value);
    }
  });
  input.addEventListener('blur', () => {
    input.classList.remove('invalid');
    input.value = M.fmtNumber(current);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (onEnter) onEnter(); else input.blur();
    }
  });
  const pm = signed
    ? h('button', {
      type: 'button', class: 'pm-btn', 'aria-label': '±', tabindex: '-1',
      onpointerdown: (e) => e.preventDefault(),
      onclick: () => {
        const v = input.value.trim();
        input.value = v.startsWith('-') ? v.slice(1) : `-${v}`;
        input.dispatchEvent(new Event('input'));
        input.focus();
      },
    }, '±')
    : null;
  return { input, wrap: h('div', { class: 'num-wrap' }, pm, input) };
}

function unitTitle(u) {
  return `${M.carriageName(u.car)} – ${tr(u.key)}`;
}

function fmtWhen(ms) {
  return new Date(ms).toLocaleString(state.lang === 'cs' ? 'cs-CZ' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' });
}

function sortedRecords() {
  return [...state.records.values()].sort((a, b) =>
    String(b.protocol.date).localeCompare(String(a.protocol.date)) ||
    String(b.protocol.modified).localeCompare(String(a.protocol.modified)));
}

// === Home ========================================================================

function viewHome() {
  document.title = tr('app_title');
  const recs = sortedRecords();
  const unbacked = recs.filter(needsBackup);
  const lastBackup = Math.max(0, ...recs.map((r) => r.backedUpAt || 0));

  return [
    appBar({ title: tr('app_title'), sub: tr('app_subtitle') }),
    h('main', { class: 'page' },
      h('div', { class: 'actions-row' },
        h('button', { class: 'btn primary big', type: 'button', onclick: () => navigate('#/new') }, icon('plus'), tr('new_protocol')),
        h('button', { class: 'btn big', type: 'button', onclick: pickImport }, icon('import'), tr('import'))),

      unbacked.length
        ? h('div', { class: 'banner warn' },
          icon('alert'),
          h('div', { class: 'banner-text' },
            h('strong', null, tr('backup_banner_title')),
            h('div', null, tr('backup_banner_text', { n: unbacked.length }))),
          h('button', { class: 'btn', type: 'button', onclick: backupAll }, icon('archive'), tr('backup_now')))
        : null,

      recs.length
        ? h('ul', { class: 'cards' }, recs.map(protocolCard))
        : h('p', { class: 'empty' }, tr('no_protocols')),

      h('footer', { class: 'page-footer' },
        h('div', { class: `storage-line ${state.storage}` },
          icon(state.storage === 'persistent' ? 'shield' : 'alert'),
          h('span', null, tr(state.storage === 'persistent' ? 'storage_persistent' : 'storage_best_effort'))),
        h('p', null, tr('stored_locally')),
        h('p', null, tr('last_backup', { date: lastBackup ? fmtWhen(lastBackup) : tr('never') })),
        h('div', { class: 'actions-row' },
          recs.length ? h('button', { class: 'btn', type: 'button', onclick: backupAll }, icon('archive'), tr('backup_all')) : null,
          state.installEvent ? h('button', { class: 'btn', type: 'button', onclick: installApp }, icon('install'), tr('install_app')) : null)),
    ),
  ];
}

function protocolCard(rec) {
  const p = rec.protocol;
  const [filled, total] = M.totalProgress(p);
  return h('li', null,
    h('a', { class: 'card', href: protocolHash(rec.id) },
      h('div', { class: 'card-main' },
        h('div', { class: 'card-title' }, p.train_id),
        h('div', { class: 'card-sub' }, `${p.date} · ${p.carriages.map((c) => c.label).join(' · ')}`),
        needsBackup(rec) ? h('span', { class: 'chip warn' }, tr('not_backed_up')) : null),
      h('div', { class: 'card-side' }, progressBar(filled, total)),
      icon('chevron-right')));
}

// === New protocol ================================================================

function viewNew() {
  document.title = tr('new_protocol');
  const form = { trainId: '', date: M.today(), num: 3, ambient: null, ambientOk: true, uics: [] };

  const uicBox = h('div', { class: 'uic-list' });
  const renderUics = () => {
    uicBox.replaceChildren(...M.generateLabels(form.num).map((lbl, i) => field(lbl, h('input', {
      type: 'text', autocomplete: 'off', placeholder: tr('optional'), value: form.uics[i] || '',
      oninput: (e) => { form.uics[i] = e.target.value.trim(); },
    }))));
  };
  renderUics();

  const numEl = h('output', { class: 'stepper-value' }, String(form.num));
  const setNum = (n) => {
    form.num = Math.min(10, Math.max(2, n));
    numEl.textContent = String(form.num);
    renderUics();
  };

  const amb = numberInput({
    value: null, signed: true, label: tr('ambient_temp'), enterHint: 'done',
    onValue: (v) => { form.ambient = v; },
  });
  amb.input.addEventListener('input', () => { form.ambientOk = M.parseNumber(amb.input.value).ok; });

  async function create() {
    if (!form.ambientOk) {
      amb.input.focus();
      return;
    }
    const p = M.newProtocol({
      trainId: form.trainId.trim(),
      numCarriages: form.num,
      ambientTemp: form.ambient,
      uics: form.uics.slice(0, form.num),
      date: form.date || M.today(),
    });
    const rec = { id: store.newId(), protocol: p, savedAt: 0, backedUpAt: null };
    p.id = rec.id;
    state.records.set(rec.id, rec);
    markDirty(rec);
    await flushSave();
    navigate(protocolHash(rec.id), { replace: true });
  }

  return [
    appBar({ back: '#/', title: tr('new_protocol') }),
    h('main', { class: 'page narrow' },
      h('form', { class: 'card-box form', onsubmit: (e) => { e.preventDefault(); create(); } },
        field(tr('train_id'), h('input', {
          type: 'text', autocomplete: 'off', placeholder: tr('train_id_placeholder'), autofocus: true,
          oninput: (e) => { form.trainId = e.target.value; },
        })),
        field(tr('date'), h('input', { type: 'date', value: form.date, oninput: (e) => { form.date = e.target.value; } })),
        h('div', { class: 'field' },
          h('span', { class: 'field-label' }, tr('num_carriages')),
          h('div', { class: 'stepper' },
            h('button', { type: 'button', class: 'btn', 'aria-label': '-', onclick: () => setNum(form.num - 1) }, '−'),
            numEl,
            h('button', { type: 'button', class: 'btn', 'aria-label': '+', onclick: () => setNum(form.num + 1) }, '+'))),
        field(`${tr('ambient_temp')} (°C)`, amb.wrap),
        h('h3', { class: 'form-sub' }, tr('uic_numbers')),
        uicBox,
        h('div', { class: 'actions-row end' },
          h('button', { type: 'button', class: 'btn', onclick: () => goUp('#/') }, tr('cancel')),
          h('button', { type: 'submit', class: 'btn primary' }, tr('create'))))),
  ];
}

// === Protocol overview ===========================================================

function viewProtocol(route) {
  const rec = state.records.get(route.id);
  if (!rec) {
    navigate('#/', { replace: true });
    return null;
  }
  const p = rec.protocol;
  document.title = `${p.train_id} – ${tr('app_title')}`;

  const titleEl = h('h1', null, p.train_id);
  const subEl = h('div', { class: 'appbar-sub' }, p.date);
  const bar = appBar({ back: '#/', title: '' });
  bar.querySelector('.appbar-title').replaceChildren(titleEl, subEl);

  const unitsBox = h('div', { class: 'units' });
  const renderUnits = () => unitsBox.replaceChildren(...p.carriages.map((car, carIdx) =>
    h('section', { class: 'carriage' },
      h('h3', null, M.carriageName(car)),
      M.units(p).filter((u) => u.carIdx === carIdx).map((u) => {
        const [f, t] = M.countFilled(u.section);
        return h('a', { class: 'unit-link', href: unitHash(rec.id, u) },
          h('span', { class: 'unit-name' }, tr(u.key)),
          progressBar(f, t),
          icon('chevron-right'));
      }))));
  renderUnits();

  const dateIsIso = /^\d{4}-\d{2}-\d{2}$/.test(p.date);
  const amb = numberInput({
    value: p.ambient_temp, signed: true, label: tr('ambient_temp'), enterHint: 'done',
    onValue: (v) => { p.ambient_temp = v; markDirty(rec); },
  });

  const trainCard = h('section', { class: 'card-box form' },
    h('h2', null, tr('train')),
    field(tr('train_id'), h('input', {
      type: 'text', autocomplete: 'off', value: p.train_id,
      oninput: (e) => {
        const v = e.target.value.trim();
        if (v && v !== p.train_id) {
          p.train_id = v;
          titleEl.textContent = v;
          markDirty(rec);
        }
      },
      onblur: (e) => { e.target.value = p.train_id; },
    })),
    field(tr('date'), h('input', {
      type: dateIsIso ? 'date' : 'text', value: p.date,
      oninput: (e) => {
        const v = e.target.value.trim();
        if (v && v !== p.date) {
          p.date = v;
          subEl.textContent = v;
          markDirty(rec);
        }
      },
    })),
    field(`${tr('ambient_temp')} (°C)`, amb.wrap),
    h('div', { class: 'field' },
      h('span', { class: 'field-label' }, tr('carriages')),
      h('span', { class: 'field-static' }, `${p.num_carriages}  (${p.carriages.map((c) => c.label).join(', ')})`)),
    h('h3', { class: 'form-sub' }, tr('uic_numbers')),
    h('div', { class: 'uic-list' }, p.carriages.map((car) => field(car.label, h('input', {
      type: 'text', autocomplete: 'off', placeholder: tr('optional'), value: car.uic || '',
      oninput: (e) => {
        car.uic = e.target.value.trim();
        markDirty(rec);
        renderUnits();
      },
    })))));

  return [
    bar,
    h('main', { class: 'page protocol-page' },
      h('div', { class: 'protocol-grid' },
        h('div', null,
          h('section', { class: 'card-box' }, h('h2', null, tr('units')), unitsBox),
          h('div', { class: 'actions-col' },
            h('button', { class: 'btn primary big', type: 'button', onclick: () => exportPdf(rec) }, icon('file'), tr('export_pdf')),
            h('button', { class: 'btn big', type: 'button', onclick: () => saveJson(rec) }, icon('download'), tr('save_json')))),
        h('div', null,
          trainCard,
          h('button', { class: 'btn danger-outline', type: 'button', onclick: () => deleteProtocol(rec) }, icon('trash'), tr('delete_protocol'))))),
  ];
}

// === Unit form ===================================================================

function viewUnit(route) {
  const rec = state.records.get(route.id);
  const car = rec?.protocol.carriages[route.car];
  const section = car && (route.sec === 'salon' || (route.sec === 'cabin' && car.has_cabin)) ? car[route.sec] : null;
  if (!section) {
    navigate(rec ? protocolHash(route.id) : '#/', { replace: true });
    return null;
  }
  const p = rec.protocol;
  const type = section.type;
  const allSteps = M.steps(type);
  const allUnits = M.units(p);
  const idx = allUnits.findIndex((u) => u.carIdx === route.car && u.key === route.sec);
  const unit = allUnits[idx];
  const label = (sid) => I.stepLabel(state.lang, type, sid);
  document.title = `${unitTitle(unit)} – ${p.train_id}`;

  const rows = new Map();
  let selected = null;

  const bar = appBar({ back: protocolHash(rec.id), title: unitTitle(unit) });
  const progressEl = h('div', { class: 'appbar-sub' });
  bar.querySelector('.appbar-title').append(progressEl);
  let sideLink = null;   // this unit's entry in the wide-screen side nav
  const updateProgress = () => {
    const [f, t] = M.countFilled(section);
    progressEl.textContent = `${p.train_id} · ${f} / ${t}`;
    progressEl.classList.toggle('done', f === t);
    if (sideLink) {
      sideLink.querySelector('.side-count').textContent = `${f}/${t}`;
      sideLink.classList.toggle('done', f === t);
    }
  };
  updateProgress();

  // --- instructions (side panel on wide screens, bottom sheet on phones) ---
  const panelBody = h('div', { class: 'instr-body' });
  const panelTitle = h('div', { class: 'instr-step' });
  const panel = h('aside', { class: 'instr-panel' }, h('h2', null, tr('panel_title')), panelTitle, panelBody);
  const renderPanel = () => {
    panelTitle.textContent = selected ? label(selected) : tr('select_a_step');
    panelBody.replaceChildren(selected ? I.renderInstructions(state.lang, type, selected) : '');
  };
  renderPanel();

  function selectStep(sid) {
    if (selected === sid) return;
    selected = sid;
    rows.forEach((r, k) => r.el.classList.toggle('selected', k === sid));
    renderPanel();
  }

  function openInstructions(sid) {
    selectStep(sid);
    if (WIDE.matches) return;
    openDialog({
      title: label(sid),
      body: I.renderInstructions(state.lang, type, sid),
      className: 'sheet',
      backdropDismiss: true,
      actions: [{ label: tr('close'), value: null }],
    });
  }

  // --- values ---
  const calcBox = h('div', { class: 'calc' });
  const renderCalc = () => {
    const results = M.calc(section);
    calcBox.replaceChildren(...(results.length
      ? results.map((c) => h('div', { class: 'calc-row' },
        h('span', { class: 'calc-label' }, I.calcLabel(state.lang, type, c.key)),
        h('span', { class: 'calc-val' }, c.value.toFixed(3)),
        h('span', { class: 'unit' }, c.unit)))
      : [h('p', { class: 'muted' }, tr('calc_hint'))]));
  };
  renderCalc();

  function onValue(st, v) {
    M.setValue(section, st, v);
    markDirty(rec);
    updateRow(st);
    updateProgress();
    if (st.kind === 'meas') renderCalc();
  }

  function updateRow(st) {
    const r = rows.get(st.id);
    const v = M.getValue(section, st);
    r.el.classList.toggle('filled', v !== null);
    if (st.kind === 'check') {
      r.ok.setAttribute('aria-pressed', String(v === 'OK'));
      r.nok.setAttribute('aria-pressed', String(v === 'NOK'));
    } else {
      const inRange = M.checkTolerance(type, st.id, v);
      r.el.classList.toggle('out', inRange === false);
      r.msg.textContent = inRange === false ? tr('out_of_range', { range: M.fmtRange(st.range, st.unit) }) : '';
    }
    const note = section.notes[st.id];
    r.noteBtn.classList.toggle('has-note', !!note);
    r.notePrev.hidden = !note;
    r.notePrev.textContent = note || '';
  }

  const measIds = allSteps.filter((s) => s.kind === 'meas').map((s) => s.id);
  function focusNext(sid) {
    const next = measIds[measIds.indexOf(sid) + 1];
    const input = next && rows.get(next).input;
    if (input) {
      input.focus();
      input.select();
    } else {
      document.activeElement?.blur();
    }
  }

  function stepRow(st) {
    const r = {};
    r.el = h('div', { class: `step ${st.kind}`, dataset: { sid: st.id } });
    r.el.addEventListener('focusin', () => selectStep(st.id));
    r.el.addEventListener('click', () => selectStep(st.id));

    const labelBtn = h('button', {
      type: 'button', class: 'step-label',
      onclick: (e) => { e.stopPropagation(); openInstructions(st.id); },
    }, h('span', null, label(st.id)), icon('info'));

    let control;
    if (st.kind === 'check') {
      const click = (which) => onValue(st, M.getValue(section, st) === which ? null : which);
      r.ok = h('button', { type: 'button', class: 'okn ok', onclick: () => click('OK') }, 'OK');
      r.nok = h('button', { type: 'button', class: 'okn nok', onclick: () => click('NOK') }, 'NOK');
      control = h('div', { class: 'okn-group' }, r.ok, r.nok);
    } else {
      const isLast = st.id === measIds[measIds.length - 1];
      const num = numberInput({
        value: M.getValue(section, st), signed: st.signed, label: label(st.id),
        placeholder: st.range ? `${st.range[0]} – ${st.range[1]}` : '',
        enterHint: isLast ? 'done' : 'next',
        onValue: (v) => onValue(st, v),
        onEnter: () => focusNext(st.id),
      });
      r.input = num.input;
      control = h('div', { class: 'meas-control' }, num.wrap, h('span', { class: 'unit' }, st.unit));
    }

    r.noteBtn = h('button', { type: 'button', class: 'note-btn', onclick: () => editNote(st) },
      icon('note'), h('span', null, tr('note')));
    r.msg = h('div', { class: 'step-msg' });
    r.notePrev = h('button', { type: 'button', class: 'note-preview', onclick: () => editNote(st) });
    r.el.append(labelBtn, control, r.noteBtn, r.msg, r.notePrev);
    rows.set(st.id, r);
    updateRow(st);
    return r.el;
  }

  async function editNote(st) {
    selectStep(st.id);
    const original = section.notes[st.id] || '';
    const apply = (text) => {
      const t = text.trim();
      if (t === (section.notes[st.id] || '')) return;
      if (t) section.notes[st.id] = t;
      else delete section.notes[st.id];
      markDirty(rec);
      updateRow(st);
    };
    // Typing is saved live, so nothing is lost if the phone kills the app mid-note.
    const ta = h('textarea', { class: 'note-text', rows: '5', autofocus: true, oninput: () => apply(ta.value) });
    ta.value = original;
    const result = await openDialog({
      title: tr('note_title', { label: label(st.id) }),
      body: ta,
      className: 'note-dlg',
      dismissValue: 'save',
      actions: [
        original ? { label: tr('remove'), value: 'remove', kind: 'danger-text' } : null,
        { label: tr('cancel'), value: 'cancel' },
        { label: tr('save'), value: 'save', kind: 'primary' },
      ].filter(Boolean),
    });
    if (result === 'cancel') apply(original);
    else if (result === 'remove') apply('');
    else apply(ta.value);
  }

  const checks = allSteps.filter((s) => s.kind === 'check');
  const meas = allSteps.filter((s) => s.kind === 'meas');
  const prev = allUnits[idx - 1];
  const next = allUnits[idx + 1];
  const goUnit = (u) => navigate(unitHash(rec.id, u), { replace: true });

  const sideNav = h('nav', { class: 'unit-side' },
    h('h2', null, p.train_id),
    allUnits.map((u) => {
      const [f, t] = M.countFilled(u.section);
      const link = h('a', {
        class: `side-link ${u === unit ? 'current' : ''} ${f === t ? 'done' : ''}`,
        href: unitHash(rec.id, u),
        onclick: (e) => { e.preventDefault(); goUnit(u); },
      }, h('span', null, unitTitle(u)), h('span', { class: 'side-count' }, `${f}/${t}`));
      if (u === unit) sideLink = link;
      return link;
    }));

  return [
    bar,
    h('div', { class: 'unit-layout' },
      sideNav,
      h('main', { class: 'page unit-main' },
        h('h2', { class: 'group-title' }, tr('checks')),
        h('div', { class: 'steps' }, checks.map(stepRow)),
        h('h2', { class: 'group-title' }, tr('measurements')),
        h('div', { class: 'steps' }, meas.map(stepRow)),
        h('h2', { class: 'group-title' }, tr('calculated')),
        calcBox,
        h('nav', { class: 'unit-nav' },
          prev ? h('button', { type: 'button', class: 'btn', onclick: () => goUnit(prev) }, icon('chevron-left'), h('span', null, unitTitle(prev))) : h('span'),
          next ? h('button', { type: 'button', class: 'btn', onclick: () => goUnit(next) }, h('span', null, unitTitle(next)), icon('chevron-right')) : h('span'))),
      panel),
  ];
}

function viewError(e) {
  return [
    appBar({ back: '#/', title: tr('error') }),
    h('main', { class: 'page' }, h('div', { class: 'banner error' }, icon('alert'), h('pre', null, String(e?.stack || e)))),
  ];
}

// === Files: share / download =====================================================

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename, hidden: true });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function shareableFile(blob, filename) {
  if (!navigator.canShare) return null;
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.canShare({ files: [file] })) return file;
  // Android Chrome refuses to share .json files; plain text is allowed and imports the same.
  const txt = new File([blob], filename.replace(/\.json$/i, '.txt'), { type: 'text/plain' });
  return navigator.canShare({ files: [txt] }) ? txt : null;
}

/** Offer a generated file. Resolves 'shared' | 'downloaded' | 'opened' | null. */
function offerFile({ title, message, blob, filename, openable = false }) {
  const file = shareableFile(blob, filename);
  const actions = [{ label: tr('close'), value: null }];
  if (openable && FINE_POINTER.matches) {
    actions.push({
      label: tr('open'),
      handler: () => {
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 300_000);
        return 'opened';
      },
    });
  }
  if (file) {
    actions.push({
      label: tr('share'),
      handler: async () => {
        try {
          await navigator.share({ files: [file], title: filename });
          return 'shared';
        } catch (e) {
          if (e?.name !== 'AbortError') toast(String(e?.message || e), { kind: 'error' });
          return KEEP_OPEN;
        }
      },
    });
  }
  actions.push({ label: tr('download'), kind: 'primary', handler: () => { download(blob, filename); return 'downloaded'; } });
  return openDialog({
    title,
    body: h('div', null,
      message ? h('p', null, message) : null,
      h('p', { class: 'file-name' }, icon('file'), h('span', null, filename))),
    actions,
  });
}

async function saveJson(rec) {
  await flushSave();
  const blob = new Blob([JSON.stringify(rec.protocol, null, 2)], { type: 'application/json' });
  const res = await offerFile({ title: tr('save_json'), message: tr('save_json_hint'), blob, filename: `${M.fileBase(rec.protocol)}.json` });
  if (res === 'shared' || res === 'downloaded') await markBackedUp([rec]);
}

async function backupAll() {
  await flushSave();
  const recs = sortedRecords();
  if (!recs.length) return;
  const stamp = M.localIso().slice(0, 16).replace('T', '_').replace(':', '');
  const data = { format: BACKUP_FORMAT, version: 1, exported: M.localIso(), protocols: recs.map((r) => r.protocol) };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const res = await offerFile({ title: tr('backup_all'), message: tr('backup_hint'), blob, filename: `hvac-backup_${stamp}.json` });
  if (res === 'shared' || res === 'downloaded') {
    await markBackedUp(recs);
    toast(tr('backup_done'));
    if (parseRoute().name === 'home') render({ keepScroll: true });
  }
}

// === Import ======================================================================

function pickImport() {
  // No `accept` filter: Android greys out .json files in some pickers.
  const input = h('input', { type: 'file', multiple: true, hidden: true });
  input.addEventListener('change', () => {
    const files = [...input.files];
    input.remove();
    if (files.length) importFiles(files);
  });
  document.body.append(input);
  input.click();
}

const sameProtocol = (a, b) => JSON.stringify({ ...a, id: null }) === JSON.stringify({ ...b, id: null });

function conflictDialog(existing, incoming) {
  const [f1, t1] = M.totalProgress(existing.protocol);
  const [f2, t2] = M.totalProgress(incoming);
  const when = (p) => String(p.modified || '').slice(0, 16).replace('T', ' ');
  return openDialog({
    title: tr('import_conflict_title'),
    body: h('div', null,
      h('p', null, tr('import_conflict_text', { name: `${incoming.train_id} (${incoming.date})` })),
      h('table', { class: 'cmp' },
        h('tr', null, h('th'), h('th', null, tr('modified')), h('th', null, tr('progress'))),
        h('tr', null, h('td', null, tr('on_device')), h('td', null, when(existing.protocol)), h('td', null, `${f1}/${t1}`)),
        h('tr', null, h('td', null, tr('in_file')), h('td', null, when(incoming)), h('td', null, `${f2}/${t2}`)))),
    actions: [
      { label: tr('skip'), value: 'skip' },
      { label: tr('keep_both'), value: 'both' },
      { label: tr('replace'), value: 'replace', kind: 'primary' },
    ],
    dismissValue: 'skip',
  });
}

async function importFiles(files) {
  let added = 0;
  const errors = [];
  for (const file of files) {
    let data;
    try {
      data = JSON.parse(await file.text());
    } catch {
      errors.push(`${file.name}: ${tr('invalid_file')}`);
      continue;
    }
    const list = data?.format === BACKUP_FORMAT && Array.isArray(data.protocols) ? data.protocols : [data];
    for (const raw of list) {
      let p;
      try {
        p = M.normalizeProtocol(raw);
      } catch {
        errors.push(`${file.name}: ${tr('invalid_file')}`);
        continue;
      }
      if (typeof p.id !== 'string' || !p.id) delete p.id;
      const existing = (p.id && state.records.get(p.id)) ||
        [...state.records.values()].find((r) => r.protocol.train_id === p.train_id && r.protocol.date === p.date);
      const now = Date.now();
      let rec;
      if (existing) {
        if (sameProtocol(existing.protocol, p)) continue;
        const choice = await conflictDialog(existing, p);
        if (choice === 'skip') continue;
        if (choice === 'replace') {
          pending.delete(existing);
          p.id = existing.id;
          existing.protocol = p;
          rec = existing;
        } else {
          p.id = store.newId();
        }
      } else if (!p.id || state.records.has(p.id)) {
        p.id = store.newId();
      }
      rec = rec || { id: p.id, protocol: p };
      rec.savedAt = now;
      rec.backedUpAt = now;   // it came from a file, so a copy exists elsewhere
      try {
        await store.putMany([rec]);
        state.records.set(rec.id, rec);
        added += 1;
      } catch (e) {
        errors.push(`${file.name}: ${e?.message || e}`);
      }
    }
  }
  if (parseRoute().name === 'home') render({ keepScroll: true });
  if (errors.length) await alertDialog(tr('import_errors'), errors.join('\n'));
  else toast(tr('import_done', { n: added }));
}

// === Protocol actions ============================================================

async function deleteProtocol(rec) {
  const p = rec.protocol;
  const ok = await openDialog({
    title: tr('delete_protocol'),
    body: h('div', null,
      h('p', null, tr('delete_confirm', { name: `${p.train_id} (${p.date})` })),
      needsBackup(rec) ? h('p', { class: 'warn-text' }, icon('alert'), tr('delete_not_backed_up')) : null),
    actions: [{ label: tr('cancel'), value: false }, { label: tr('delete'), value: true, kind: 'danger' }],
  });
  if (!ok) return;
  pending.delete(rec);
  try {
    await store.remove(rec.id);
  } catch (e) {
    await alertDialog(tr('error'), String(e?.message || e));
    return;
  }
  state.records.delete(rec.id);
  toast(tr('deleted'));
  goUp('#/');
}

async function confirmMissing(p, selection) {
  const summary = [];
  const details = [];
  for (const u of M.units(p).filter((x) => selection.some((s) => s.carIdx === x.carIdx && s.key === x.key))) {
    const missing = M.missingSteps(u.section);
    if (!missing.length) continue;
    summary.push(h('li', null, `${unitTitle(u)}: ${tr('n_empty', { n: missing.length })}`));
    details.push(h('div', { class: 'missing-unit' },
      h('strong', null, unitTitle(u)),
      h('ul', null, missing.map((sid) => h('li', null, I.stepLabel(state.lang, u.section.type, sid))))));
  }
  if (!summary.length) return true;
  return openDialog({
    title: tr('incomplete_title'),
    body: h('div', null,
      h('p', null, tr('incomplete_text')),
      h('ul', null, summary),
      h('details', null, h('summary', null, tr('show_details')), details)),
    actions: [{ label: tr('cancel'), value: false }, { label: tr('export_anyway'), value: true, kind: 'primary' }],
    dismissValue: false,
  });
}

async function exportPdf(rec) {
  await flushSave();
  const p = rec.protocol;
  const boxes = M.units(p).map((u) => {
    const [f, t] = M.countFilled(u.section);
    const cb = h('input', { type: 'checkbox', checked: true });
    return { u, cb, el: h('label', { class: 'check-line' }, cb, h('span', null, unitTitle(u)), h('span', { class: 'muted' }, `${f}/${t}`)) };
  });
  const setAll = (on) => boxes.forEach((b) => { b.cb.checked = on; });
  const go = await openDialog({
    title: tr('export_pdf'),
    body: h('div', null,
      h('p', null, tr('export_select')),
      h('div', { class: 'actions-row' },
        h('button', { class: 'btn small', type: 'button', onclick: () => setAll(true) }, tr('select_all')),
        h('button', { class: 'btn small', type: 'button', onclick: () => setAll(false) }, tr('select_none'))),
      h('div', { class: 'check-list' }, boxes.map((b) => b.el))),
    actions: [{ label: tr('cancel'), value: false }, { label: tr('export'), value: true, kind: 'primary' }],
    dismissValue: false,
  });
  if (!go) return;
  const selection = boxes.filter((b) => b.cb.checked).map((b) => ({ carIdx: b.u.carIdx, key: b.u.key }));
  if (!selection.length) {
    toast(tr('nothing_selected'));
    return;
  }
  if (!(await confirmMissing(p, selection))) return;

  const spinner = busy(tr('generating_pdf'));
  let blob;
  try {
    blob = await generatePdf(p, selection);
  } catch (e) {
    spinner.close();
    console.error(e);
    await alertDialog(tr('export_failed'), String(e?.message || e));
    return;
  }
  spinner.close();
  await offerFile({ title: tr('pdf_ready'), blob, filename: `${M.fileBase(p)}.pdf`, openable: true });
}

// === App install / updates =======================================================

async function installApp() {
  const evt = state.installEvent;
  if (!evt) return;
  state.installEvent = null;
  evt.prompt();
  await evt.userChoice.catch(() => null);
  if (parseRoute().name === 'home') render({ keepScroll: true });
}

function showUpdateBanner() {
  if (document.querySelector('.update-banner')) return;
  document.body.append(h('div', { class: 'update-banner', role: 'status' },
    h('span', null, tr('update_available')),
    h('button', {
      class: 'btn primary small', type: 'button',
      onclick: async () => { await flushSave(); location.reload(); },
    }, tr('reload'))));
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('service worker:', e));
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type === 'update-ready') showUpdateBanner();
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) showUpdateBanner(); });
  if (hadController) {
    navigator.serviceWorker.ready.then((reg) => reg.active?.postMessage({ type: 'check-update' }));
  }
}

// === Start =======================================================================

async function main() {
  try {
    await Promise.all([M.loadSteps(), I.loadLanguages(LANGS)]);
    const recs = await store.getAll();
    for (const r of recs) state.records.set(r.id, r);
  } catch (e) {
    console.error(e);
    document.getElementById('app').replaceChildren(
      h('main', { class: 'page' }, h('div', { class: 'banner error' }, icon('alert'),
        h('div', null, h('strong', null, 'HVAC Protocol Tool failed to start'), h('pre', null, String(e?.message || e))))));
    return;
  }

  navStack.push(currentHash());
  window.addEventListener('hashchange', onHashChange);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushSave(); });
  window.addEventListener('pagehide', () => flushSave());
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    state.installEvent = e;
    if (parseRoute().name === 'home') render({ keepScroll: true });
  });
  window.addEventListener('appinstalled', () => { state.installEvent = null; });

  render();
  registerServiceWorker();

  state.storage = await store.ensurePersistentStorage();
  if (parseRoute().name === 'home') render({ keepScroll: true });
}

main();
