import { api } from '../api.js';
import { badge, confirmBox, debounce, empty, fdate, field, html, inr, modal, opts, pager, setHTML, skeleton, table, today, toast, $ } from '../ui.js';

const statusBadge = r => r.overdue ? html`${badge('overdue')} ` : badge(r.status);
const METHODS = [['bank_transfer', 'Bank transfer'], ['upi', 'UPI'], ['card', 'Card'], ['cheque', 'Cheque'], ['cash', 'Cash']];

export async function invoiceList(root, { user }) {
  const isC = user.role === 'customer', st = { q: '', status: '', overdue: '', date_from: '', date_to: '', page: 1 };
  setHTML(root, html`<div class="page"><div class="head"><div><h1>${isC ? 'My invoices' : 'Invoices'}</h1><p>${isC ? 'Everything you have been billed, and what is still due.' : 'Generated automatically from active subscriptions.'}</p></div>
    ${isC ? '' : html`<button class="btn primary" data-run>Run billing</button>`}</div>
    <div class="card flush"><div class="bar"><div class="grow"><input type="search" data-f="q" placeholder="Search invoice number or customer…" aria-label="Search invoices"></div>
    <select data-f="status" aria-label="Status">${[['', 'All statuses'], ...(isC ? [] : [['draft', 'Draft']]), ['confirmed', 'Confirmed'], ['paid', 'Paid'], ['cancelled', 'Cancelled']].map(([v, l]) => html`<option value="${v}">${l}</option>`)}</select>
    <select data-f="overdue" aria-label="Overdue"><option value="">Any due date</option><option value="1">Overdue only</option></select>
    <input type="date" data-f="date_from" aria-label="Issued from" title="Issued from"><input type="date" data-f="date_to" aria-label="Issued to" title="Issued to"></div><div data-body></div></div></div>`);
  const body = $('[data-body]', root);
  async function load() {
    setHTML(body, skeleton());
    const d = await api.get('/invoices', { ...st, per_page: 10 });
    if (!d.items.length) return setHTML(body, empty('No invoices match', isC ? 'New invoices show up here as soon as they are issued.' : 'Change the filters, or run billing to generate due invoices.'));
    setHTML(body, html`${table([{ h: 'Invoice', r: r => html`<a class="link" href="#/invoices/${r.id}">${r.number}</a>` }, ...(isC ? [] : [{ h: 'Customer', r: r => r.customer_name }]),
      { h: 'Period', r: r => `${fdate(r.period_start)} – ${fdate(r.period_end)}` }, { h: 'Due', r: r => fdate(r.due_date) }, { h: 'Total', cls: 'num', r: r => inr(r.total) },
      { h: 'Balance', cls: 'num', r: r => r.status === 'paid' || r.status === 'cancelled' ? '—' : inr(r.balance) }, { h: 'Status', r: statusBadge }], d.items)}${pager(d)}`);
  }
  root.onclick = e => {
    const p = e.target.closest('[data-page]'); if (p && !p.disabled) { st.page = +p.dataset.page; load(); }
    if (e.target.closest('[data-run]')) modal({ title: 'Run billing', submit: 'Generate invoices', body: html`<p class="muted" style="margin-top:0">Creates an invoice for every active subscription that is due. Subscriptions already billed for a period are skipped, so this is safe to repeat.</p>
      ${field({ name: 'as_of', label: 'Bill everything due up to', type: 'date', value: today(), required: true })}${field({ name: 'auto_confirm', label: 'Confirm invoices as they are created', type: 'checkbox', value: false })}`,
      onSubmit: async (d, f, close) => { const r = await api.post('/billing/run', { as_of: d.as_of, auto_confirm: d.auto_confirm }); toast(`${r.invoices_created} invoices created from ${r.subscriptions_due} due subscriptions${r.auto_closed ? `, ${r.auto_closed} closed` : ''}`); close(); load(); } });
  };
  const upd = debounce(e => { st[e.target.dataset.f] = e.target.value; st.page = 1; load(); });
  $$('[data-f]', root).forEach(el => el.addEventListener(el.tagName === 'INPUT' && el.type === 'search' ? 'input' : 'change', upd));
  await load();
}
const $$ = (s, r) => [...r.querySelectorAll(s)];

export async function invoiceDetail(root, { params, user }) {
  const id = params[0], isC = user.role === 'customer';
  async function load() {
    setHTML(root, html`<div class="page">${skeleton()}</div>`);
    const i = await api.get('/invoices/' + id);
    const open = i.status === 'confirmed';
    setHTML(root, html`<div class="page"><div class="head"><div><a href="#/invoices" class="muted">← Invoices</a><h1 style="margin-top:6px">${i.number} ${statusBadge(i)}</h1><p>${i.customer_name} · <a href="#/subscriptions/${i.subscription_id}">${i.subscription_number}</a>${i.sent_at ? ' · sent ' + fdate(i.sent_at.slice(0, 10)) : ''}</p></div>
      <div class="row"><button class="btn" data-a="print">Print</button>${isC ? '' : html`${i.status === 'draft' ? html`<button class="btn primary" data-a="confirm">Confirm</button>` : ''}${['confirmed', 'paid'].includes(i.status) ? html`<button class="btn" data-a="send">${i.sent_at ? 'Send again' : 'Send'}</button>` : ''}
      ${open ? html`<button class="btn primary" data-a="pay">Record payment</button>` : ''}${['draft', 'confirmed'].includes(i.status) && !i.amount_paid ? html`<button class="btn danger" data-a="cancel">Cancel invoice</button>` : ''}`}</div></div>
      <div class="grid g2"><div class="card"><div class="steps" style="margin-bottom:16px">${['draft', 'confirmed', 'paid'].map((s, n) => { const cur = ['draft', 'confirmed', 'paid'].indexOf(i.status); return html`<div class="step ${i.status === 'cancelled' ? '' : n < cur || i.status === 'paid' ? 'done' : n === cur ? 'now' : ''}">${s[0].toUpperCase() + s.slice(1)}</div>`; })}</div>
      ${table([{ h: 'Description', r: r => r.kind === 'discount' ? html`<span style="color:var(--green)">${r.description}</span>` : r.description }, { h: 'Qty', cls: 'num', r: r => r.kind === 'line' ? r.quantity : '' },
        { h: 'Unit price', cls: 'num', r: r => r.kind === 'line' ? inr(r.unit_price) : '' }, { h: 'Tax', cls: 'num', r: r => r.kind === 'line' ? r.tax_rate + '%' : '' }, { h: 'Amount', cls: 'num', r: r => inr(r.amount) }], i.lines)}
      <div class="tot mt"><div><span>Subtotal</span><span>${inr(i.subtotal)}</span></div><div><span>Discounts</span><span>−${inr(i.discount_total)}</span></div><div><span>Tax</span><span>${inr(i.tax_total)}</span></div><div class="g"><span>Total</span><span>${inr(i.total)}</span></div>
      <div><span>Paid</span><span>${inr(i.amount_paid)}</span></div><div><b>Balance due</b><b ${i.overdue ? html`style="color:var(--red)"` : ''}>${inr(i.balance)}</b></div></div></div>
      <div><div class="card"><h3 style="margin-bottom:12px">Details</h3><dl class="dl" style="grid-template-columns:1fr 1fr"><div><dt>Period</dt><dd>${fdate(i.period_start)} – ${fdate(i.period_end)}</dd></div><div><dt>Issued</dt><dd>${fdate(i.issue_date)}</dd></div>
      <div><dt>Due</dt><dd>${fdate(i.due_date)}</dd></div><div><dt>Terms</dt><dd>${i.payment_terms}</dd></div></dl></div>
      <div class="card flush mt"><div class="bar"><h3>Payments</h3></div>${i.payments.length ? table([{ h: 'Date', r: r => fdate(r.payment_date) }, { h: 'Method', r: r => r.method.replace('_', ' ') }, { h: 'Note', r: r => r.note || '—' }, { h: 'Amount', cls: 'num', r: r => inr(r.amount) }], i.payments) : empty('No payments yet', open ? 'Record one when money arrives.' : '')}</div></div></div></div>`);
    root._inv = i;
  }
  root.onclick = async e => {
    const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return; const i = root._inv;
    try {
      if (a === 'print') { const t = await api.text(`/invoices/${id}/print`); const w = window.open('', '_blank'); if (!w) return toast('Allow pop-ups to print', 'err'); w.document.write(t); w.document.close(); w.focus(); setTimeout(() => w.print(), 300); }
      else if (a === 'confirm') { await api.post(`/invoices/${id}/confirm`); toast('Invoice confirmed'); load(); }
      else if (a === 'send') { await api.post(`/invoices/${id}/send`); toast('Invoice sent to ' + i.customer_email); load(); }
      else if (a === 'cancel') { if (await confirmBox('Cancel this invoice? The billed period will not be invoiced again.', 'Cancel invoice', true)) { await api.post(`/invoices/${id}/cancel`); toast('Invoice cancelled'); load(); } }
      else if (a === 'pay') modal({ title: 'Record payment', submit: 'Record payment', body: html`<p class="muted" style="margin-top:0">Balance due on ${i.number}: <b>${inr(i.balance)}</b></p><div class="cols2">${field({ name: 'amount', label: 'Amount (₹)', type: 'number', required: true, value: i.balance, attrs: `min="0.01" max="${i.balance}" step="0.01"` })}
        ${field({ name: 'method', label: 'Method', type: 'select', required: true, options: METHODS })}</div>${field({ name: 'payment_date', label: 'Payment date', type: 'date', required: true, value: today(), attrs: `max="${today()}"` })}${field({ name: 'note', label: 'Note', type: 'textarea', attrs: 'maxlength="500"', hint: 'Reference number, cheque details…' })}`,
        onSubmit: async (d, f, close) => { await api.post(`/invoices/${id}/payments`, d); toast('Payment recorded'); close(); load(); } });
    } catch (err) { toast(err.message, 'err'); }
  };
  await load();
}

export async function paymentList(root) {
  const st = { q: '', method: '', date_from: '', date_to: '', page: 1 };
  setHTML(root, html`<div class="page"><div class="head"><div><h1>Payments</h1><p>Every payment received, by method and date.</p></div></div><div class="card flush"><div class="bar">
    <div class="grow"><input type="search" data-f="q" placeholder="Search invoice or customer…" aria-label="Search payments"></div><select data-f="method" aria-label="Method">${[['', 'All methods'], ...METHODS].map(([v, l]) => html`<option value="${v}">${l}</option>`)}</select>
    <input type="date" data-f="date_from" aria-label="From" title="From"><input type="date" data-f="date_to" aria-label="To" title="To"></div><div data-body></div></div></div>`);
  const body = $('[data-body]', root);
  async function load() {
    setHTML(body, skeleton());
    const d = await api.get('/payments', { ...st, per_page: 12 });
    if (!d.items.length) return setHTML(body, empty('No payments found', 'Payments recorded against invoices will be listed here.'));
    setHTML(body, html`${table([{ h: 'Date', r: r => fdate(r.payment_date) }, { h: 'Invoice', r: r => html`<a class="link" href="#/invoices/${r.invoice_id}">${r.invoice_number}</a>` }, { h: 'Customer', r: r => r.customer_name },
      { h: 'Method', r: r => r.method.replace('_', ' ') }, { h: 'Note', r: r => r.note || '—' }, { h: 'Amount', cls: 'num', r: r => inr(r.amount) }], d.items)}<div class="pager"><b>Total in view: ${inr(d.sum)}</b></div>${pager(d)}`);
  }
  root.onclick = e => { const p = e.target.closest('[data-page]'); if (p && !p.disabled) { st.page = +p.dataset.page; load(); } };
  const upd = debounce(e => { st[e.target.dataset.f] = e.target.value; st.page = 1; load(); });
  $$('[data-f]', root).forEach(el => el.addEventListener(el.type === 'search' ? 'input' : 'change', upd));
  await load();
}
