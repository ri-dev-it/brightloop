import { ApiError } from './api.js';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = s => new Raw(s);
const fmt = v => v instanceof Raw ? v.s : Array.isArray(v) ? v.map(fmt).join('') : v === false || v == null ? '' : esc(v);
export const html = (st, ...vals) => new Raw(st.reduce((a, s, i) => a + s + (i < vals.length ? fmt(vals[i]) : ''), ''));
export const setHTML = (el, r) => { el.innerHTML = r instanceof Raw ? r.s : esc(r); };
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export const inr = n => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n || 0);
export const inrShort = n => n >= 1e7 ? '₹' + (n / 1e7).toFixed(1) + 'Cr' : n >= 1e5 ? '₹' + (n / 1e5).toFixed(1) + 'L' : n >= 1e3 ? '₹' + (n / 1e3).toFixed(0) + 'k' : '₹' + Math.round(n);
export const fdate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
export const iso = d => { const z = new Date(d.getTime() - d.getTimezoneOffset() * 6e4); return z.toISOString().slice(0, 10); };
export const today = () => iso(new Date());
export const addDays = (n, d = new Date()) => { const x = new Date(d); x.setDate(x.getDate() + n); return iso(x); };
export const badge = (s, extra = '') => html`<span class="badge b-${s}">${String(s).replace(/_/g, ' ')}</span>${extra}`;
export const skeleton = () => html`<div class="card flush">${[1, 2, 3, 4, 5].map(() => html`<div class="skel"></div>`)}</div>`;
export const empty = (title, msg) => html`<div class="empty"><b>${title}</b>${msg}</div>`;
export const debounce = (fn, ms = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

export function toast(msg, type = 'ok') {
  const t = document.createElement('div'); t.className = 'toast ' + (type === 'err' ? 'err' : ''); t.textContent = msg;
  $('#toasts').append(t); setTimeout(() => t.remove(), 4200);
}

/* ---------- forms ---------- */
export function field({ name, label, type = 'text', value = '', required = false, options, hint = '', attrs = '', cls = '' }) {
  const req = required ? 'required' : '';
  let ctl;
  if (type === 'select') {
    ctl = html`<select id="f_${name}" name="${name}" ${raw(req)} ${raw(attrs)}>${options.map(([v, l]) => html`<option value="${v}" ${raw(String(v) === String(value) ? 'selected' : '')}>${l}</option>`)}</select>`;
  } else if (type === 'textarea') {
    ctl = html`<textarea id="f_${name}" name="${name}" rows="3" ${raw(req)} ${raw(attrs)}>${value}</textarea>`;
  } else if (type === 'checkbox') {
    return html`<div class="f chk ${cls}"><input type="checkbox" id="f_${name}" name="${name}" ${raw(value ? 'checked' : '')}><label for="f_${name}">${label}</label>${hint ? html`<span class="hint">${hint}</span>` : ''}</div>`;
  } else {
    ctl = html`<input id="f_${name}" name="${name}" type="${type}" value="${value}" ${raw(req)} ${raw(attrs)}>`;
  }
  return html`<div class="f ${cls}" data-f="${name}"><label for="f_${name}">${label}${required ? ' *' : ''}</label>${ctl}${hint ? html`<span class="hint">${hint}</span>` : ''}<div class="err" data-err="${name}"></div></div>`;
}
export const opts = (list, any) => (any ? [['', any]] : []).concat(list);

export function formData(form) {
  const o = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    o[el.name] = el.type === 'checkbox' ? el.checked : el.value;
  }
  return o;
}
export function showErrors(form, errors = {}) {
  $$('.f.bad', form).forEach(f => f.classList.remove('bad'));
  $$('[data-err]', form).forEach(e => { e.textContent = ''; });
  let first = null;
  for (const [k, msg] of Object.entries(errors)) {
    const e = form.querySelector(`[data-err="${CSS.escape(k)}"]`) || form.querySelector(`[data-err="${CSS.escape(k.split('.')[0])}"]`);
    if (e) { e.textContent = msg; e.parentElement.classList.add('bad'); first ||= e; }
  }
  first?.parentElement.querySelector('input,select,textarea')?.focus();
  return Object.keys(errors).length;
}
export function clientValidate(form) {
  const errs = {};
  for (const el of form.elements) {
    if (el.name && el.willValidate && !el.checkValidity()) errs[el.name] = el.validationMessage;
  }
  return errs;
}

/* ---------- repeater rows ---------- */
export const repeater = (name, rows, rowFn, label = 'Add row') =>
  html`<div class="rep" data-rep="${name}"><div class="rep-rows">${rows.map(rowFn)}</div><button type="button" class="btn ghost sm" data-add="${name}">+ ${label}</button></div>`;
export function bindRepeaters(root, fns) {
  root.addEventListener('click', e => {
    const add = e.target.closest('[data-add]');
    if (add && fns[add.dataset.add]) { root.querySelector(`[data-rep="${add.dataset.add}"] .rep-rows`).insertAdjacentHTML('beforeend', fns[add.dataset.add]({}).s); root.dispatchEvent(new CustomEvent('rep-change')); }
    if (e.target.closest('[data-del]')) { e.target.closest('.rep-row').remove(); root.dispatchEvent(new CustomEvent('rep-change')); }
  });
}
export const readRep = (root, name) => $$(`[data-rep="${name}"] .rep-row`, root).map(r => Object.fromEntries($$('[data-k]', r).map(i => [i.dataset.k, i.type === 'checkbox' ? i.checked : i.value])));

/* ---------- modal ---------- */
export function modal({ title, body, submit = 'Save', size = '', onSubmit, onOpen, hideFooter = false }) {
  const el = document.createElement('div'); el.className = 'overlay';
  el.innerHTML = `<div class="modal ${size}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header><h3>${esc(title)}</h3><button class="x" data-close aria-label="Close">×</button></header>
  <form novalidate><div class="mb">${body.s}</div>${hideFooter ? '' : `<footer><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">${esc(submit)}</button></footer>`}</form></div>`;
  document.body.append(el);
  const close = () => { el.remove(); document.removeEventListener('keydown', esc_); };
  const esc_ = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', esc_);
  el.addEventListener('click', e => { if (e.target === el || e.target.closest('[data-close]')) close(); });
  const form = $('form', el);
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const errs = clientValidate(form);
    if (showErrors(form, errs)) return;
    const btn = $('.btn.primary', form); btn && (btn.disabled = true);
    try { await onSubmit(formData(form), form, close); }
    catch (err) {
      if (err instanceof ApiError) { showErrors(form, err.errors); toast(err.message, 'err'); } else { console.error(err); toast('Unexpected error', 'err'); }
    } finally { btn && (btn.disabled = false); }
  });
  onOpen?.(el, form, close);
  $('input,select,textarea', form)?.focus();
  return close;
}
export const confirmBox = (message, label = 'Confirm', danger = false) => new Promise(res => {
  const el = document.createElement('div'); el.className = 'overlay';
  el.innerHTML = `<div class="modal" role="alertdialog" aria-modal="true"><header><h3>Please confirm</h3></header><div class="mb"><p style="margin:0">${esc(message)}</p></div>
  <footer><button class="btn" data-no>Cancel</button><button class="btn ${danger ? 'danger' : 'primary'}" data-yes>${esc(label)}</button></footer></div>`;
  document.body.append(el);
  const end = v => { el.remove(); res(v); };
  el.addEventListener('click', e => { if (e.target.closest('[data-yes]')) end(true); else if (e.target === el || e.target.closest('[data-no]')) end(false); });
  $('[data-yes]', el).focus();
});

export const pager = (p) => {
  if (!p || !p.total) return '';
  const pages = Math.ceil(p.total / p.per_page), from = (p.page - 1) * p.per_page + 1, to = Math.min(p.total, p.page * p.per_page);
  return html`<div class="pager"><span>${from}–${to} of ${p.total}</span><span class="row"><button class="btn sm" data-page="${p.page - 1}" ${raw(p.page <= 1 ? 'disabled' : '')}>Previous</button><span>Page ${p.page} of ${pages}</span><button class="btn sm" data-page="${p.page + 1}" ${raw(p.page >= pages ? 'disabled' : '')}>Next</button></span></div>`;
};
export const table = (cols, rows) => html`<div class="tw"><table><thead><tr>${cols.map(c => html`<th class="${c.cls || ''}">${c.h}</th>`)}</tr></thead><tbody>${rows.map(r => html`<tr>${cols.map(c => html`<td class="${c.cls || ''}">${c.r(r)}</td>`)}</tr>`)}</tbody></table></div>`;

export const LOGO = `<svg width="30" height="30" viewBox="0 0 32 32"><circle cx="16" cy="16" r="11" fill="none" stroke="#3fd0b8" stroke-width="5" stroke-dasharray="58 12" stroke-linecap="round"/><circle cx="16" cy="16" r="3.2" fill="#fff"/></svg>`;
