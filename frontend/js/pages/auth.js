import { api, token } from '../api.js';
import { field, html, raw, setHTML, toast, showErrors, clientValidate, formData, $, $$, LOGO } from '../ui.js';

const RULES = [['More than 8 characters', p => p.length > 8], ['An uppercase letter', p => /[A-Z]/.test(p)], ['A lowercase letter', p => /[a-z]/.test(p)], ['A special character', p => /[^A-Za-z0-9]/.test(p)]];
export const pwChecklist = () => html`<ul class="pw" data-pw>${RULES.map(([t]) => html`<li>○ ${t}</li>`)}</ul>`;
function bindChecklist(form) {
  const i = form.elements.password, list = $$('[data-pw] li', form);
  if (!i || !list.length) return;
  i.addEventListener('input', () => RULES.forEach(([t, f], n) => { const ok = f(i.value); list[n].className = ok ? 'ok' : ''; list[n].textContent = (ok ? '✓ ' : '○ ') + t; }));
}

function layout(app, title, sub, inner, footer) {
  setHTML(app, html`<div class="auth"><section class="hero"><div><svg class="ring" viewBox="0 0 32 32"><circle cx="16" cy="16" r="11" fill="none" stroke="#3fd0b8" stroke-width="2.4" stroke-dasharray="58 12" stroke-linecap="round"/><circle cx="16" cy="16" r="1.6" fill="#fff"/></svg>
    <h1>Every renewal, billed on time.</h1><p>Plans, subscriptions, invoices and payments in one place — so revenue stops depending on who remembers.</p></div>
    <ul><li>Invoices generated from subscriptions, never typed</li><li>Taxes and discounts applied automatically</li><li>Always know what is paid, owed and overdue</li></ul></section>
    <section class="formside"><div class="box"><div class="row" style="margin-bottom:22px;font-weight:700;font-size:18px;color:var(--brand-d)">${raw(LOGO.replace('#3fd0b8', '#0f7b6c').replace('#fff', '#0f7b6c'))} Brightloop</div>
    <h2>${title}</h2><p class="muted" style="margin:0 0 20px">${sub}</p><form novalidate>${inner}</form>${footer}</div></section></div>`);
  return $('form', app);
}
function wire(form, fn, ctx) {
  form.onsubmit = async e => {
    e.preventDefault();
    if (showErrors(form, clientValidate(form))) return;
    const b = $('.btn.primary', form); b.disabled = true;
    try { await fn(formData(form), form); } catch (err) { showErrors(form, err.errors); toast(err.message, 'err'); } finally { b.disabled = false; }
  };
}
const done = (ctx, r) => { token.set(r.token); ctx.session.user = r.user; ctx.go(r.user.role === 'customer' ? '/subscriptions' : '/dashboard'); };

export function login(app, ctx) {
  const f = layout(app, 'Sign in', 'Welcome back. Enter your details to continue.',
    html`${field({ name: 'email', label: 'Email', type: 'email', required: true, attrs: 'autocomplete="username"' })}${field({ name: 'password', label: 'Password', type: 'password', required: true, attrs: 'autocomplete="current-password"' })}
    <button class="btn primary" style="width:100%;justify-content:center">Sign in</button><p class="right" style="margin:12px 0 0"><a href="#/forgot">Forgot password?</a></p>`,
    html`<p class="muted mt">New to Brightloop? <a href="#/signup">Create an account</a></p>
    <div class="demo"><b>Demo logins</b><br>Admin: admin@brightloop.com / Admin@12345<br>Staff: staff@brightloop.com / Staff@12345<br>Customer: customer@example.com / Customer@123</div>`);
  wire(f, async d => done(ctx, await api.post('/auth/login', d)));
}
export function signup(app, ctx) {
  const f = layout(app, 'Create your account', 'Manage your subscriptions and invoices online.',
    html`${field({ name: 'name', label: 'Full name', required: true, attrs: 'maxlength="80" autocomplete="name"' })}${field({ name: 'company', label: 'Company', attrs: 'maxlength="120"' })}
    ${field({ name: 'email', label: 'Email', type: 'email', required: true, attrs: 'autocomplete="username"' })}${field({ name: 'password', label: 'Password', type: 'password', required: true, attrs: 'autocomplete="new-password"' })}${pwChecklist()}
    <button class="btn primary" style="width:100%;justify-content:center;margin-top:14px">Create account</button>`,
    html`<p class="muted mt">Already registered? <a href="#/login">Sign in</a></p>`);
  bindChecklist(f);
  wire(f, async d => done(ctx, await api.post('/auth/signup', d)));
}
export function forgot(app) {
  const f = layout(app, 'Reset your password', 'We will email a reset link to your registered address.',
    html`${field({ name: 'email', label: 'Email', type: 'email', required: true })}<button class="btn primary" style="width:100%;justify-content:center">Send reset link</button><div data-out></div>`,
    html`<p class="muted mt"><a href="#/login">Back to sign in</a></p>`);
  wire(f, async d => {
    const r = await api.post('/auth/forgot-password', d);
    setHTML($('[data-out]', f), html`<div class="demo">${r.message}${r.dev_reset_link ? html`<br><b>Dev mode:</b> email is logged to the server console, so here is the link: <a href="${r.dev_reset_link}">open reset page</a>` : ''}</div>`);
  });
}
export function reset(app, ctx) {
  const f = layout(app, 'Choose a new password', 'Pick something you have not used before.',
    html`${field({ name: 'password', label: 'New password', type: 'password', required: true, attrs: 'autocomplete="new-password"' })}${pwChecklist()}<button class="btn primary" style="width:100%;justify-content:center;margin-top:14px">Update password</button>`,
    html`<p class="muted mt"><a href="#/login">Back to sign in</a></p>`);
  bindChecklist(f);
  wire(f, async d => { await api.post('/auth/reset-password', { token: ctx.query.token, password: d.password }); toast('Password updated. Please sign in.'); ctx.go('/login'); });
}
