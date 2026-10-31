import { api } from '../api.js';
import { crud } from '../crud.js';
import { badge, field, html, setHTML, skeleton, toast, showErrors, clientValidate, formData, $, confirmBox } from '../ui.js';
import { pwChecklist } from './auth.js';

export const customers = (root) => crud(root, {
  title: 'Customers', noun: 'customer', sub: 'People and companies you bill.', path: '/customers', canWrite: true, newLabel: 'New customer',
  columns: [{ h: 'Name', r: r => html`<b>${r.name}</b><div class="muted">${r.company || ''}</div>` }, { h: 'Email', r: r => r.email }, { h: 'Phone', r: r => r.phone || '—' }, { h: 'Portal login', r: r => r.user_id ? badge('active') : html`<span class="muted">None</span>` }],
  form: r => html`<div class="cols2">${field({ name: 'name', label: 'Name', required: true, value: r?.name, attrs: 'maxlength="100"' })}${field({ name: 'company', label: 'Company', value: r?.company || '', attrs: 'maxlength="120"' })}
    ${field({ name: 'email', label: 'Email', type: 'email', required: true, value: r?.email })}${field({ name: 'phone', label: 'Phone', type: 'tel', value: r?.phone || '', attrs: 'maxlength="30"' })}</div>${field({ name: 'address', label: 'Billing address', type: 'textarea', value: r?.address || '', attrs: 'maxlength="300"' })}`,
});

export async function team(root) {
  let page = 1;
  async function load() {
    const d = await api.get('/users', { page, per_page: 20 });
    setHTML(root, html`<div class="page"><div class="head"><div><h1>Team</h1><p>Only the admin can add staff. Staff handle day-to-day work with limited access.</p></div><button class="btn primary" data-add>+ Add staff member</button></div>
      <div class="card flush"><div class="tw"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead><tbody>${d.items.map(u => html`<tr><td><b>${u.name}</b></td><td>${u.email}</td><td style="text-transform:capitalize">${u.role}</td><td>${u.active ? badge('active') : badge('closed')}</td>
      <td class="right">${u.role === 'staff' ? html`<button class="btn sm ${u.active ? 'danger' : ''}" data-tog="${u.id}" data-to="${u.active ? 0 : 1}">${u.active ? 'Deactivate' : 'Reactivate'}</button>` : ''}</td></tr>`)}</tbody></table></div></div></div>`);
  }
  root.onclick = async e => {
    if (e.target.closest('[data-add]')) {
      const { modal } = await import('../ui.js');
      modal({ title: 'Add staff member', submit: 'Create account', body: html`${field({ name: 'name', label: 'Full name', required: true, attrs: 'maxlength="80"' })}${field({ name: 'email', label: 'Email', type: 'email', required: true })}${field({ name: 'password', label: 'Temporary password', type: 'password', required: true, attrs: 'autocomplete="new-password"' })}${pwChecklist()}`,
        onOpen: (el, f) => f.elements.password.addEventListener('input', () => { /* live hints */ const v = f.elements.password.value, r = [v.length > 8, /[A-Z]/.test(v), /[a-z]/.test(v), /[^A-Za-z0-9]/.test(v)]; [...el.querySelectorAll('[data-pw] li')].forEach((li, i) => { li.className = r[i] ? 'ok' : ''; li.textContent = (r[i] ? '✓ ' : '○ ') + li.textContent.slice(2); }); }),
        onSubmit: async (d, f, close) => { await api.post('/users', d); toast('Staff member added'); close(); load(); } });
    }
    const t = e.target.closest('[data-tog]');
    if (t) { try { await api.patch('/users/' + t.dataset.tog, { active: t.dataset.to === '1' }); toast('Updated'); load(); } catch (err) { toast(err.message, 'err'); } }
  };
  setHTML(root, html`<div class="page">${skeleton()}</div>`); await load();
}

export async function profile(root) {
  const p = await api.get('/me/profile');
  setHTML(root, html`<div class="page"><div class="head"><div><h1>Profile</h1><p>Your billing details, shown on invoices.</p></div></div><form class="card" style="max-width:640px" novalidate><div class="cols2">
    ${field({ name: 'name', label: 'Name', required: true, value: p.name, attrs: 'maxlength="100"' })}${field({ name: 'company', label: 'Company', value: p.company, attrs: 'maxlength="120"' })}
    <div class="f"><label>Email</label><input value="${p.email}" disabled></div>${field({ name: 'phone', label: 'Phone', type: 'tel', value: p.phone, attrs: 'maxlength="30"' })}</div>
    ${field({ name: 'address', label: 'Billing address', type: 'textarea', value: p.address, attrs: 'maxlength="300"' })}<button class="btn primary">Save changes</button></form></div>`);
  const f = $('form', root);
  f.onsubmit = async e => {
    e.preventDefault(); if (showErrors(f, clientValidate(f))) return;
    try { await api.put('/me/profile', formData(f)); toast('Profile saved'); } catch (err) { showErrors(f, err.errors); toast(err.message, 'err'); }
  };
}
