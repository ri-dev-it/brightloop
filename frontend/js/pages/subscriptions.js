import { api } from '../api.js';
import { badge, bindRepeaters, confirmBox, debounce, empty, fdate, field, html, inr, modal, opts, pager, raw, readRep, repeater, setHTML, skeleton, table, today, addDays, toast, formData, showErrors, clientValidate, $, $$ } from '../ui.js';

const FLOW = ['draft', 'quotation', 'confirmed', 'active', 'closed'];
const PERIOD = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' };
const TERMS = ['Immediate', 'Net 15', 'Net 30', 'Net 45', 'Net 60'];

export async function subscriptionList(root, { user }) {
  const st = { q: '', status: '', page: 1 }, isC = user.role === 'customer';
  setHTML(root, html`<div class="page"><div class="head"><div><h1>${isC ? 'My subscriptions' : 'Subscriptions'}</h1><p>${isC ? 'See and manage everything you subscribe to.' : 'Track every subscription from draft to closed.'}</p></div>
    ${isC ? '' : html`<a class="btn primary" href="#/subscriptions/new">+ New subscription</a>`}</div>
    <div class="card flush"><div class="bar"><div class="grow"><input type="search" data-q placeholder="Search by number, customer or company…" aria-label="Search subscriptions"></div>
    <select data-status aria-label="Filter by status">${opts(FLOW.filter(s => !isC || s !== 'draft').map(s => [s, s[0].toUpperCase() + s.slice(1)]), 'All statuses').map(([v, l]) => html`<option value="${v}">${l}</option>`)}</select></div><div data-body></div></div></div>`);
  const body = $('[data-body]', root);
  async function load() {
    setHTML(body, skeleton());
    const d = await api.get('/subscriptions', { ...st, per_page: 10 });
    if (!d.items.length) return setHTML(body, empty('No subscriptions found', isC ? 'Your subscriptions will appear here once they are set up.' : 'Adjust the filters or create a new subscription.'));
    setHTML(body, html`${table([
      { h: 'Number', r: r => html`<a class="link" href="#/subscriptions/${r.id}">${r.number}</a>` }, ...(isC ? [] : [{ h: 'Customer', r: r => r.customer_name }]), { h: 'Plan', r: r => r.plan_name },
      { h: 'Next invoice', r: r => r.status === 'active' && !r.paused ? fdate(r.next_invoice_date) : '—' }, { h: 'Expires', r: r => fdate(r.expiry_date) },
      { h: 'Recurring', cls: 'num', r: r => html`${inr(r.subtotal)}<span class="muted"> /${PERIOD[r.billing_period]}</span>` },
      { h: 'Status', r: r => badge(r.status, r.paused ? html` ${badge('paused')}` : '') }], d.items)}${pager(d)}`);
  }
  root.onclick = e => { const p = e.target.closest('[data-page]'); if (p && !p.disabled) { st.page = +p.dataset.page; load(); } };
  $('[data-q]', root).oninput = debounce(e => { st.q = e.target.value; st.page = 1; load(); });
  $('[data-status]', root).onchange = e => { st.status = e.target.value; st.page = 1; load(); };
  await load();
}

/* ---------- create / edit ---------- */
export async function subscriptionForm(root, { params, go }) {
  setHTML(root, html`<div class="page">${skeleton()}</div>`);
  const id = params[0];
  const [custs, plans, prods, tpls, existing] = await Promise.all([api.get('/customers', { per_page: 100 }), api.get('/plans', { active: 1, per_page: 100 }), api.get('/products', { active: 1, per_page: 100 }),
    api.get('/templates', { active: 1, per_page: 100 }), id ? api.get('/subscriptions/' + id) : null]);
  const s = existing || { start_date: today(), expiry_date: addDays(365), payment_terms: 'Net 30', lines: [] };
  const planOf = () => plans.items.find(p => p.id == $('[name=plan_id]', root).value);
  const prodOpts = [['', 'Select product…'], ...prods.items.map(p => [p.id, `${p.name} — ${inr(p.sales_price)}`])];
  const lineRow = (l = {}) => {
    const p = prods.items.find(x => x.id == l.product_id);
    return html`<div class="rep-row" style="--c:3"><div class="f" style="margin:0"><select data-k="product_id" required aria-label="Product">${prodOpts.map(([v, t]) => html`<option value="${v}" ${raw(v == l.product_id ? 'selected' : '')}>${t}</option>`)}</select></div>
      <div class="f" style="margin:0"><select data-k="variant_id" aria-label="Variant">${[['', 'No variant'], ...(p ? p.variants.map(v => [v.id, `${v.attribute}: ${v.value}${v.extra_price ? ' (+' + inr(v.extra_price) + ')' : ''}`]) : [])].map(([v, t]) => html`<option value="${v}" ${raw(v == l.variant_id ? 'selected' : '')}>${t}</option>`)}</select></div>
      <div class="f" style="margin:0"><input data-k="quantity" type="number" min="1" step="1" value="${l.quantity || 1}" required aria-label="Quantity"></div><button type="button" class="icon" data-del aria-label="Remove line">×</button></div>`;
  };
  const lines = (existing ? existing.lines.filter(l => !l.is_plan_fee) : []).concat(existing ? [] : [{}]);
  setHTML(root, html`<div class="page"><div class="head"><div><h1>${existing ? 'Edit ' + s.number : 'New subscription'}</h1><p>Start from a quotation template, or build it line by line.</p></div><a class="btn" href="#/subscriptions${id ? '/' + id : ''}">Cancel</a></div>
  <form class="grid g2" id="sf" novalidate><div class="card"><h3 style="margin-bottom:14px">Details</h3>
    ${existing ? '' : field({ name: 'template_id', label: 'Quotation template', type: 'select', options: opts(tpls.items.map(t => [t.id, `${t.name} · valid ${t.validity_days} days`]), 'None — start from scratch') })}
    <div class="cols2">${field({ name: 'customer_id', label: 'Customer', type: 'select', required: true, value: s.customer_id, options: opts(custs.items.map(c => [c.id, c.company ? `${c.name} — ${c.company}` : c.name]), 'Select customer…') })}
    ${field({ name: 'plan_id', label: 'Plan', type: 'select', required: true, value: s.plan_id, options: opts(plans.items.map(p => [p.id, `${p.name} · ${inr(p.price)}/${PERIOD[p.billing_period]}`]), 'Select plan…') })}</div>
    <div class="cols3">${field({ name: 'start_date', label: 'Start date', type: 'date', required: true, value: s.start_date })}${field({ name: 'expiry_date', label: 'Expiry date', type: 'date', required: true, value: s.expiry_date })}
    ${field({ name: 'payment_terms', label: 'Payment terms', type: 'select', value: s.payment_terms, options: TERMS.map(t => [t, t]) })}</div>
    ${field({ name: 'notes', label: 'Notes', type: 'textarea', value: s.notes || '' })}<div class="muted" data-planinfo></div></div>
    <div class="card"><h3 style="margin-bottom:4px">Product lines</h3><p class="muted" style="margin:0 0 12px">The plan fee is added automatically. Prices and taxes come from the catalog.</p>
    ${repeater('lines', lines, lineRow, 'Add product')}<div class="err" data-err="lines"></div><div class="tot mt" data-total></div>
    <div class="row mt" style="justify-content:flex-end"><button class="btn primary" type="submit">${existing ? 'Save changes' : 'Create subscription'}</button></div></div></form></div>`);
  const form = $('#sf', root);
  bindRepeaters(form, { lines: lineRow });
  const info = () => {
    const p = planOf(); $('[data-planinfo]', form).textContent = p ? `Billed ${p.billing_period} · minimum quantity ${p.min_quantity} · available ${fdate(p.start_date)}${p.end_date ? ' to ' + fdate(p.end_date) : ' onwards'}` : '';
    let sub = p ? p.price : 0;
    for (const l of readRep(form, 'lines')) { const pr = prods.items.find(x => x.id == l.product_id); if (!pr) continue; const v = pr.variants.find(x => x.id == l.variant_id); sub += ((pr.sales_price + (v ? v.extra_price : 0)) * (+l.quantity || 0)); }
    $('[data-total]', form).innerHTML = `<div><span>Estimated per cycle (before tax)</span><b>${inr(sub)}</b></div>`;
  };
  form.addEventListener('change', e => {
    if (e.target.dataset.k === 'product_id') { const row = e.target.closest('.rep-row'), p = prods.items.find(x => x.id == e.target.value); $('[data-k=variant_id]', row).innerHTML = '<option value="">No variant</option>' + (p ? p.variants.map(v => `<option value="${v.id}">${v.attribute}: ${v.value}${v.extra_price ? ' (+₹' + v.extra_price + ')' : ''}</option>`).join('') : ''); }
    if (e.target.name === 'template_id') {
      const t = tpls.items.find(x => x.id == e.target.value); if (!t) return;
      form.elements.plan_id.value = t.plan_id;
      const rows = $('.rep-rows', form); rows.innerHTML = t.lines.map(l => lineRow(l).s).join('');
      toast(`Loaded “${t.name}”`);
    }
    info();
  });
  form.addEventListener('input', info); form.addEventListener('rep-change', info); info();
  form.onsubmit = async e => {
    e.preventDefault();
    const errs = clientValidate(form); if (showErrors(form, errs)) return;
    const d = formData(form), ls = readRep(form, 'lines').filter(l => l.product_id).map(l => ({ product_id: +l.product_id, variant_id: l.variant_id ? +l.variant_id : null, quantity: +l.quantity }));
    if (d.expiry_date < d.start_date) return showErrors(form, { expiry_date: 'Expiry must be on or after the start date' });
    if (!ls.length) return showErrors(form, { lines: 'Add at least one product line' });
    const btn = $('button[type=submit]', form); btn.disabled = true;
    try {
      const body = { ...d, customer_id: +d.customer_id, plan_id: +d.plan_id, template_id: d.template_id ? +d.template_id : null, lines: ls };
      const r = existing ? await api.put('/subscriptions/' + id, body) : await api.post('/subscriptions', body);
      toast(existing ? 'Subscription updated' : `${r.number} created`); go('/subscriptions/' + r.id);
    } catch (err) {
      const mapped = {}; for (const [k, v] of Object.entries(err.errors || {})) mapped[k.startsWith('lines.') ? 'lines' : k] = v;
      showErrors(form, mapped); toast(err.message, 'err');
    } finally { btn.disabled = false; }
  };
}

/* ---------- detail ---------- */
export async function subscriptionDetail(root, { params, user }) {
  const id = params[0], isC = user.role === 'customer';
  async function load() {
    setHTML(root, html`<div class="page">${skeleton()}</div>`);
    const [s, inv] = await Promise.all([api.get('/subscriptions/' + id), api.get('/invoices', { subscription_id: id, per_page: 12 })]);
    const idx = FLOW.indexOf(s.status), live = s.status === 'active';
    const acts = [];
    if (!isC) {
      if (s.status === 'draft') acts.push(['send', 'Send quotation', 'primary']);
      if (s.status === 'quotation') acts.push(['confirm', 'Confirm', 'primary']);
      if (s.status === 'confirmed') acts.push(['activate', 'Activate', 'primary']);
      if (live && s.allow_renew) acts.push(['renew', 'Renew']);
    }
    if (live && s.allow_pause && !s.paused) acts.push(['pause', 'Pause']);
    if (live && s.paused) acts.push(['resume', 'Resume', 'primary']);
    if (s.status !== 'closed' && (isC ? (live && s.allow_early_close) : true)) acts.push(['close', 'Close', 'danger']);
    setHTML(root, html`<div class="page"><div class="head"><div><a href="#/subscriptions" class="muted">← Subscriptions</a><h1 style="margin-top:6px">${s.number} ${badge(s.status)} ${s.paused ? badge('paused') : ''} ${s.expired ? badge('expired') : ''}</h1><p>${s.customer_name} · ${s.plan_name}</p></div>
      <div class="row">${!isC && ['draft', 'quotation'].includes(s.status) ? html`<a class="btn" href="#/subscriptions/${s.id}/edit">Edit</a>` : ''}${acts.map(([a, l, c]) => html`<button class="btn ${c || ''}" data-act="${a}">${l}</button>`)}</div></div>
      <div class="card"><div class="steps">${FLOW.map((f, i) => html`<div class="step ${i < idx || s.status === 'closed' && i < 4 ? 'done' : i === idx ? 'now' : ''}">${f[0].toUpperCase() + f.slice(1)}</div>`)}</div></div>
      <div class="grid g2 mt"><div class="card"><h3 style="margin-bottom:12px">Lines</h3>${table([{ h: 'Item', r: r => r.description }, { h: 'Qty', cls: 'num', r: r => r.quantity }, { h: 'Unit price', cls: 'num', r: r => inr(r.unit_price) },
        { h: 'Tax', cls: 'num', r: r => r.tax_name || '—' }, { h: 'Amount', cls: 'num', r: r => inr(r.amount) }], s.lines)}
        <div class="tot mt"><div><span>Subtotal</span><span>${inr(s.totals.subtotal)}</span></div><div><span>Tax</span><span>${inr(s.totals.tax_total)}</span></div><div class="g"><span>Per ${PERIOD[s.billing_period]}</span><span>${inr(s.totals.total)}</span></div></div>
        <p class="muted" style="font-size:12.5px;margin:6px 0 0">Discounts are applied automatically on each invoice when they qualify.</p></div>
      <div class="card"><h3 style="margin-bottom:12px">Terms</h3><dl class="dl" style="grid-template-columns:1fr 1fr"><div><dt>Starts</dt><dd>${fdate(s.start_date)}</dd></div><div><dt>Expires</dt><dd>${fdate(s.expiry_date)}</dd></div>
        <div><dt>Billing</dt><dd style="text-transform:capitalize">${s.billing_period}</dd></div><div><dt>Payment terms</dt><dd>${s.payment_terms}</dd></div>
        <div><dt>Next invoice</dt><dd>${live && !s.paused ? fdate(s.next_invoice_date) : '—'}</dd></div><div><dt>Quote valid until</dt><dd>${fdate(s.quote_valid_until)}</dd></div>
        <div><dt>Min quantity</dt><dd>${s.min_quantity}</dd></div><div><dt>Closes automatically</dt><dd>${s.auto_close ? 'Yes' : 'No'}</dd></div></dl>${s.notes ? html`<p class="muted mt">${s.notes}</p>` : ''}</div></div>
      <div class="card flush mt"><div class="bar"><h3>Invoices</h3></div>${inv.items.length ? table([{ h: 'Invoice', r: r => html`<a class="link" href="#/invoices/${r.id}">${r.number}</a>` }, { h: 'Period', r: r => `${fdate(r.period_start)} – ${fdate(r.period_end)}` },
        { h: 'Due', r: r => fdate(r.due_date) }, { h: 'Total', cls: 'num', r: r => inr(r.total) }, { h: 'Status', r: r => r.overdue ? badge('overdue') : badge(r.status) }], inv.items) : empty('No invoices yet', live ? 'The next one is created automatically on the billing date.' : 'Invoices appear once the subscription is active.')}</div></div>`);
  }
  root.onclick = async e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const a = b.dataset.act, msg = { close: 'Close this subscription? Billing stops and this cannot be undone.', pause: 'Pause billing until you resume?', renew: 'Extend the expiry date by another term?' }[a];
    if (msg && !(await confirmBox(msg, a[0].toUpperCase() + a.slice(1), a === 'close'))) return;
    try { await api.post(`/subscriptions/${id}/actions/${a}`); toast('Done'); load(); } catch (err) { toast(err.message, 'err'); }
  };
  await load();
}
