import { api, token } from './api.js';
import { $, $$, html, raw, setHTML, toast, LOGO } from './ui.js';
import * as auth from './pages/auth.js';
import { dashboard } from './pages/dashboard.js';
import { subscriptionList, subscriptionForm, subscriptionDetail } from './pages/subscriptions.js';
import { invoiceList, invoiceDetail, paymentList } from './pages/invoices.js';
import * as cat from './pages/catalog.js';
import * as people from './pages/people.js';

const ADMIN = ['admin'], INTERNAL = ['admin', 'staff'], ALL = ['admin', 'staff', 'customer'], CUSTOMER = ['customer'];
const ROUTES = [
  [/^\/dashboard$/, INTERNAL, dashboard],
  [/^\/subscriptions$/, ALL, subscriptionList],
  [/^\/subscriptions\/new$/, INTERNAL, subscriptionForm],
  [/^\/subscriptions\/(\d+)\/edit$/, INTERNAL, subscriptionForm],
  [/^\/subscriptions\/(\d+)$/, ALL, subscriptionDetail],
  [/^\/invoices$/, ALL, invoiceList],
  [/^\/invoices\/(\d+)$/, ALL, invoiceDetail],
  [/^\/payments$/, INTERNAL, paymentList],
  [/^\/customers$/, INTERNAL, people.customers],
  [/^\/products$/, INTERNAL, cat.products],
  [/^\/plans$/, ALL, cat.plans],
  [/^\/templates$/, INTERNAL, cat.templates],
  [/^\/taxes$/, INTERNAL, cat.taxes],
  [/^\/discounts$/, INTERNAL, cat.discounts],
  [/^\/team$/, ADMIN, people.team],
  [/^\/profile$/, CUSTOMER, people.profile],
];
const NAV = {
  internal: [['Overview', null], ['Dashboard', '/dashboard', 'M3 13h8V3H3zm10 8h8V11h-8zM3 21h8v-6H3zm10-12h8V3h-8z'], ['Sales', null],
    ['Subscriptions', '/subscriptions', 'M12 4V1L8 5l4 4V6a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z'], ['Invoices', '/invoices', 'M6 2h9l5 5v15H6zm8 1.5V8h4.5M9 13h8M9 17h8'],
    ['Payments', '/payments', 'M2 6h20v12H2zm0 4h20M6 15h4'], ['Customers', '/customers', 'M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0zM4 21a8 8 0 0 1 16 0'],
    ['Catalog', null], ['Products', '/products', 'M3 7l9-4 9 4v10l-9 4-9-4zm9 4v10M3 7l9 4 9-4'], ['Plans', '/plans', 'M4 5h16v4H4zm0 6h16v4H4zm0 6h10v2H4z'],
    ['Quotation templates', '/templates', 'M5 3h14v18H5zm3 5h8M8 12h8M8 16h5'], ['Taxes', '/taxes', 'M19 5L5 19M7 7h.01M17 17h.01'], ['Discounts', '/discounts', 'M20 12l-8 8-9-9V3h8zM7.5 7.5h.01'],
    ['Admin', null, '', 'admin'], ['Team', '/team', 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0', 'admin']],
  customer: [['My account', null], ['My subscriptions', '/subscriptions', 'M12 4V1L8 5l4 4V6a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z'], ['My invoices', '/invoices', 'M6 2h9l5 5v15H6zm8 1.5V8h4.5M9 13h8M9 17h8'],
    ['Plans', '/plans', 'M4 5h16v4H4zm0 6h16v4H4zm0 6h10v2H4z'], ['Profile', '/profile', 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0']],
};
const ICON = d => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;

export const session = { user: null };
const app = $('#app');
let shellFor = null;

const parse = () => { const [p, q] = (location.hash.slice(1) || '/').split('?'); return { path: p, query: Object.fromEntries(new URLSearchParams(q || '')) }; };
export const go = p => { location.hash = '#' + p; };
export function signOut() { token.clear(); session.user = null; shellFor = null; go('/login'); }

function shell(user) {
  const items = (user.role === 'customer' ? NAV.customer : NAV.internal).filter(i => !i[3] || i[3] === user.role);
  setHTML(app, html`<div class="shell"><aside class="side" id="side"><div class="brand">${raw(LOGO)}Brightloop</div><nav>
    ${items.map(([label, href, d]) => href ? html`<a href="#${href}" data-nav="${href}">${raw(ICON(d))}${label}</a>` : html`<div class="grp">${label}</div>`)}</nav></aside>
    <div class="main"><div class="top"><button class="btn burger sm" id="burger" aria-label="Menu">☰</button><div class="grow"></div>
    <div class="who"><div class="avatar">${user.name[0].toUpperCase()}</div><div><b>${user.name}</b><div class="muted" style="font-size:12.5px;text-transform:capitalize">${user.role}</div></div>
    <button class="btn sm" id="out">Sign out</button></div></div><main id="view"></main></div></div>`);
  $('#out').onclick = signOut;
  $('#burger').onclick = () => $('#side').classList.toggle('open');
  $('#side').onclick = e => { if (e.target.closest('a')) $('#side').classList.remove('open'); };
  shellFor = user.id;
}

async function render() {
  const { path, query } = parse();
  const authPage = { '/login': auth.login, '/signup': auth.signup, '/forgot': auth.forgot, '/reset': auth.reset }[path];
  if (!session.user && token.get()) { try { session.user = (await api.get('/auth/me')).user; } catch { token.clear(); } }
  if (authPage) { shellFor = null; return authPage(app, { query, go, session }); }
  if (!session.user) return go('/login');
  if (shellFor !== session.user.id || !$('#view')) shell(session.user);
  const home = session.user.role === 'customer' ? '/subscriptions' : '/dashboard';
  if (path === '/' || path === '') return go(home);
  for (const [re, roles, fn] of ROUTES) {
    const m = path.match(re);
    if (!m) continue;
    if (!roles.includes(session.user.role)) { toast('You do not have access to that page', 'err'); return go(home); }
    $$('[data-nav]').forEach(a => a.classList.toggle('on', path === a.dataset.nav || path.startsWith(a.dataset.nav + '/')));
    const view = $('#view'); view.scrollTop = 0; window.scrollTo(0, 0);
    try { return await fn(view, { params: m.slice(1), query, user: session.user, go }); }
    catch (e) { setHTML(view, html`<div class="page"><div class="card empty"><b>Something went wrong</b>${e.message}</div></div>`); }
    return;
  }
  setHTML($('#view'), html`<div class="page"><div class="card empty"><b>Page not found</b><a href="#${home}">Go to ${session.user.role === 'customer' ? 'your subscriptions' : 'the dashboard'}</a></div></div>`);
}
window.addEventListener('hashchange', render);
render();
