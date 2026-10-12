// i18n: loads i18n/<lang>.toml (shared with the Python tool, see i18n.py).
// Missing keys in a non-English file fall back to English.

import { parse as parseToml } from '../vendor/smol-toml.js';
import { h } from './ui.js';

export const DEFAULT_LANG = 'en';
const data = {};

export async function loadLanguages(langs) {
  await Promise.all(langs.map(async (lang) => {
    const res = await fetch(new URL(`../i18n/${lang}.toml`, import.meta.url));
    if (!res.ok) throw new Error(`i18n/${lang}.toml: HTTP ${res.status}`);
    data[lang] = parseToml(await res.text());
  }));
}

function lookup(lang, path) {
  let v = data[lang];
  for (const k of path) v = v?.[k];
  return v;
}

function withFallback(lang, path) {
  const v = lookup(lang, path);
  return v !== undefined || lang === DEFAULT_LANG ? v : lookup(DEFAULT_LANG, path);
}

/** UI string from [ui]; {name} placeholders are filled from vars. */
export function t(lang, key, vars) {
  let s = withFallback(lang, ['ui', key]);
  if (typeof s !== 'string') s = key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  return s;
}

export function step(lang, type, id) {
  return lookup(lang, [type, id]) ||
    (lang !== DEFAULT_LANG && lookup(DEFAULT_LANG, [type, id])) ||
    { label: id };
}

export function stepLabel(lang, type, id) {
  return step(lang, type, id).label ?? id;
}

export function calcLabel(lang, type, key) {
  return withFallback(lang, [`${type}_calc`, key])?.label ?? key;
}

const asList = (v) => (Array.isArray(v) ? v : [v]);

/** Step instructions as DOM (same sections as i18n.format_step_html). */
export function renderInstructions(lang, type, id) {
  const s = step(lang, type, id);
  if (Object.keys(s).every((k) => k === 'label')) {
    return h('p', { class: 'muted' }, t(lang, 'no_instructions'));
  }
  const frag = document.createDocumentFragment();
  const heading = (key) => h('h4', null, t(lang, `section_${key}`));
  const list = (items, ordered) => h(ordered ? 'ol' : 'ul', null, asList(items).map((it) => h('li', null, String(it))));

  if (s.summary) frag.append(h('p', { class: 'instr-summary' }, String(s.summary)));
  for (const key of ['prerequisites', 'tools_needed']) {
    if (s[key]?.length) frag.append(heading(key), list(s[key]));
  }
  if (s.procedure?.length) frag.append(heading('procedure'), list(s.procedure, true));
  for (const key of ['expected', 'troubleshooting']) {
    if (s[key]?.length) frag.append(heading(key), list(s[key]));
  }
  if (s.safety?.length) {
    frag.append(h('div', { class: 'instr-safety' },
      h('strong', null, `! ${t(lang, 'section_safety')}`),
      list(s.safety)));
  }
  return frag;
}
