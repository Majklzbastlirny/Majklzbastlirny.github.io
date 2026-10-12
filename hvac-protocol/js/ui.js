// Small DOM helpers: element builder, modal dialogs, toasts.

/** h('div', {class: 'x', onclick: fn}, child, [children], 'text') */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'value' || k === 'checked') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  append(el, children);
  return el;
}

const ICONS = {
  back: 'M19 12H5M12 19l-7-7 7-7',
  'chevron-right': 'M9 18l6-6-6-6',
  'chevron-left': 'M15 18l-6-6 6-6',
  info: 'M12 22a10 10 0 100-20 10 10 0 000 20zM12 16v-4M12 8h.01',
  note: 'M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z',
  plus: 'M12 5v14M5 12h14',
  import: 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12',
  download: 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3',
  share: 'M18 8a3 3 0 100-6 3 3 0 000 6zM6 15a3 3 0 100-6 3 3 0 000 6zM18 22a3 3 0 100-6 3 3 0 000 6zM8.6 13.5l6.8 4M15.4 6.5l-6.8 4',
  trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6',
  file: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6',
  check: 'M20 6L9 17l-5-5',
  alert: 'M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4',
  archive: 'M21 8v13H3V8M1 3h22v5H1zM10 12h4',
  install: 'M12 3v12M7 10l5 5 5-5M5 21h14',
  snow: 'M12 2v20M4.9 7l14.2 10M4.9 17L19.1 7M9 4l3 2 3-2M9 20l3-2 3 2',
};

export function icon(name) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', `icon icon-${name}`);
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', ICONS[name] || '');
  svg.append(path);
  return svg;
}

function append(el, children) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : String(c));
  }
}

// --- Dialogs -------------------------------------------------------------------
// Each open dialog pushes a history entry, so the Android back button closes
// the dialog instead of leaving the page.

const stack = [];
const popWaiters = [];
let seq = 0;

window.addEventListener('popstate', () => {
  const waiter = popWaiters.shift();
  if (waiter) { waiter(); return; }
  stack[stack.length - 1]?.dismiss();
});

function historyBack() {
  return new Promise((resolve) => {
    popWaiters.push(resolve);
    history.back();
    setTimeout(() => {
      const i = popWaiters.indexOf(resolve);
      if (i >= 0) { popWaiters.splice(i, 1); resolve(); }
    }, 600);
  });
}

export const KEEP_OPEN = Symbol('keep-open');

/**
 * Open a modal dialog. Resolves with the chosen action's value.
 * actions: [{label, value, kind: 'primary'|'danger'|'', handler?: async () => value | KEEP_OPEN}]
 * dismissValue: result for back button / Esc / backdrop tap.
 */
export function openDialog({ title, body, actions = [], className = '', dismissValue = null, backdropDismiss = false }) {
  return new Promise((resolve) => {
    const id = ++seq;
    let done = false;
    const dlg = h('dialog', { class: `dlg ${className}` });
    const entry = { id, dlg, dismiss: () => finish(resolveDismiss(), true) };

    function resolveDismiss() {
      return typeof dismissValue === 'function' ? dismissValue() : dismissValue;
    }

    async function finish(value, viaPop = false) {
      if (done) return;
      done = true;
      stack.splice(stack.indexOf(entry), 1);
      dlg.close();
      dlg.remove();
      if (!viaPop && history.state?.dlg === id) await historyBack();
      resolve(value);
    }

    const buttons = actions.map((a) => {
      const btn = h('button', { class: `btn ${a.kind || ''}`, type: 'button' }, a.label);
      btn.addEventListener('click', async () => {
        if (!a.handler) return finish(a.value);
        const r = await a.handler();
        if (r !== KEEP_OPEN) finish(r === undefined ? a.value : r);
      });
      return btn;
    });

    dlg.append(
      title ? h('header', { class: 'dlg-head' }, h('h2', null, title)) : null,
      h('div', { class: 'dlg-body' }, body),
      buttons.length ? h('footer', { class: 'dlg-actions' }, buttons) : null,
    );
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); finish(resolveDismiss()); });
    if (backdropDismiss) {
      dlg.addEventListener('click', (e) => { if (e.target === dlg) finish(resolveDismiss()); });
    }

    history.pushState({ dlg: id }, '');
    stack.push(entry);
    document.body.append(dlg);
    dlg.showModal();
  });
}

export function closeAllDialogs() {
  for (const entry of [...stack].reverse()) entry.dismiss();
}

export function alertDialog(title, message, okLabel = 'OK') {
  return openDialog({ title, body: h('p', null, message), actions: [{ label: okLabel, value: true, kind: 'primary' }] });
}

// --- Toast / busy ----------------------------------------------------------------

let toastEl = null;
let toastTimer = null;

export function toast(message, { kind = '', ms = 2600 } = {}) {
  if (!toastEl) {
    toastEl = h('div', { class: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(toastEl);
  }
  toastEl.textContent = message;
  toastEl.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.className = 'toast'; }, ms);
}

export function busy(message) {
  const el = h('div', { class: 'busy' }, h('div', { class: 'busy-box' }, h('div', { class: 'spinner' }), message));
  document.body.append(el);
  return { close: () => el.remove() };
}
