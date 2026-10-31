import { api } from '../api.js';
import { badge, empty, fdate, html, inr, inrShort, iso, raw, setHTML, skeleton, table, today, field } from '../ui.js';

function chart(m) {
  const W = 620, H = 230, L = 46, B = 30, T = 12, max = Math.max(1, ...m.flatMap(x => [x.revenue, x.invoiced])) * 1.1, bw = (W - L) / m.length;
  const y = v => T + (H - B - T) * (1 - v / max);
  const grid = [0, .25, .5, .75, 1].map(f => `<line x1="${L}" x2="${W}" y1="${y(max * f)}" y2="${y(max * f)}" stroke="#e6ecef"/><text x="${L - 6}" y="${y(max * f) + 4}" text-anchor="end">${inrShort(max * f)}</text>`).join('');
  const bars = m.map((x, i) => {
    const cx = L + bw * i + bw / 2, w = Math.min(22, bw / 3), lbl = new Date(x.month + '-01').toLocaleDateString('en-IN', { month: 'short' });
    return `<rect x="${cx - w - 2}" y="${y(x.invoiced)}" width="${w}" height="${H - B - y(x.invoiced)}" rx="3" fill="#b9dcd6"><title>Invoiced ${inr(x.invoiced)}</title></rect>
      <rect x="${cx + 2}" y="${y(x.revenue)}" width="${w}" height="${H - B - y(x.revenue)}" rx="3" fill="#0f7b6c"><title>Collected ${inr(x.revenue)}</title></rect><text x="${cx}" y="${H - 9}" text-anchor="middle">${lbl}</text>`;
  }).join('');
  return raw(`<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Invoiced versus collected per month">${grid}${bars}</svg>`);
}

export async function dashboard(root, ctx) {
  const t = new Date(), st = { from: iso(new Date(t.getFullYear(), t.getMonth(), 1)), to: today() };
  setHTML(root, html`<div class="page"><div class="head"><div><h1>Dashboard</h1><p>Recurring revenue, collections and what needs chasing.</p></div>
    <form class="row" id="flt" novalidate><div style="width:160px">${field({ name: 'from', label: 'From', type: 'date', value: st.from, cls: 'm0' })}</div><div style="width:160px">${field({ name: 'to', label: 'To', type: 'date', value: st.to })}</div></form></div><div id="dash">${skeleton()}</div></div>`);
  const box = root.querySelector('#dash');
  async function load() {
    setHTML(box, skeleton());
    const d = await api.get('/reports/dashboard', { date_from: st.from, date_to: st.to });
    const total = Object.values(d.subscriptions_by_status).reduce((a, b) => a + b, 0) || 1;
    setHTML(box, html`
      <div class="grid g4">
        <div class="card kpi"><div class="l">Active subscriptions</div><div class="v">${d.active_subscriptions}</div><div class="s">${total} in total</div></div>
        <div class="card kpi"><div class="l">Monthly recurring revenue</div><div class="v">${inr(d.mrr)}</div><div class="s">Before tax and discounts</div></div>
        <div class="card kpi"><div class="l">Revenue collected</div><div class="v">${inr(d.revenue)}</div><div class="s">${d.payments_count} payments · ${fdate(d.range.from)} – ${fdate(d.range.to)}</div></div>
        <div class="card kpi"><div class="l">Invoiced in range</div><div class="v">${inr(d.invoiced)}</div><div class="s">${d.invoiced_count} invoices</div></div>
        <div class="card kpi"><div class="l">Still owed</div><div class="v">${inr(d.outstanding)}</div><div class="s">${d.outstanding_count} open invoices</div></div>
        <a class="card kpi ${d.overdue_count ? 'warn' : ''}" href="#/invoices" style="text-decoration:none;color:inherit"><div class="l">Overdue</div><div class="v">${inr(d.overdue)}</div><div class="s">${d.overdue_count} invoices past due</div></a>
      </div>
      <div class="grid g2 mt"><div class="card"><div class="row sp"><h3>Invoiced vs collected, last 6 months</h3><div class="legend"><span><i style="background:#b9dcd6"></i>Invoiced</span><span><i style="background:#0f7b6c"></i>Collected</span></div></div>${chart(d.monthly)}</div>
      <div class="card"><h3>Subscriptions by status</h3><div class="mt">${['draft', 'quotation', 'confirmed', 'active', 'closed'].map(s => html`<div class="hb"><span>${badge(s)}</span><span class="t"><b style="width:${(d.subscriptions_by_status[s] || 0) / total * 100}%"></b></span><span class="right">${d.subscriptions_by_status[s] || 0}</span></div>`)}</div>
      <h3 class="mt">Collected by method</h3>${d.by_method.length ? d.by_method.map(m => html`<div class="row sp" style="margin:6px 0"><span style="text-transform:capitalize">${m.method.replace('_', ' ')}</span><b>${inr(m.amount)}</b></div>`) : html`<p class="muted">No payments in this range.</p>`}</div></div>
      <div class="card flush mt"><div class="bar"><h3>Overdue invoices</h3><div class="grow"></div><a href="#/invoices">View all invoices</a></div>
      ${d.overdue_invoices.length ? table([{ h: 'Invoice', r: r => html`<a href="#/invoices/${r.id}">${r.number}</a>` }, { h: 'Customer', r: r => r.customer_name }, { h: 'Due', r: r => fdate(r.due_date) },
        { h: 'Overdue by', r: r => html`<span class="badge b-overdue">${r.days_overdue} days</span>` }, { h: 'Balance', cls: 'num', r: r => inr(r.balance) }], d.overdue_invoices) : empty('Nothing overdue', 'Every confirmed invoice is within its payment terms.')}</div>`);
  }
  root.querySelector('#flt').onchange = e => { st[e.target.name] = e.target.value; if (st.from && st.to && st.from <= st.to) load().catch(() => {}); };
  await load();
}
