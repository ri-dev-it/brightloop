import { api } from '../api.js';
import { crud } from '../crud.js';
import { badge, fdate, field, html, inr, opts, raw, readRep, repeater } from '../ui.js';

const PER = [['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly'], ['yearly', 'Yearly']];
const yn = v => v ? html`<span class="badge b-active">Yes</span>` : html`<span class="muted">No</span>`;
const state = r => r.active ? badge('active') : badge('closed', '');
const taxOpts = t => opts(t.taxes.items.map(x => [x.id, `${x.name} (${x.rate}%)`]), 'No tax');
const numOrNull = v => v === '' || v == null ? null : +v;

export const products = (root, { user }) => crud(root, {
  title: 'Products', noun: 'product', sub: 'What Brightloop sells, with optional variants such as brand.', path: '/products', canWrite: user.role === 'admin', archive: true, size: 'lg', newLabel: 'New product',
  load: async () => ({ taxes: await api.get('/taxes', { active: 1, per_page: 100 }) }),
  columns: [{ h: 'Product', r: r => html`<b>${r.name}</b><div class="muted" style="text-transform:capitalize">${r.type}</div>` }, { h: 'Sales price', cls: 'num', r: r => inr(r.sales_price) }, { h: 'Cost', cls: 'num', r: r => inr(r.cost_price) },
    { h: 'Variants', r: r => r.variants.length ? r.variants.map(v => html`<span class="badge" style="margin:1px">${v.value}${v.extra_price ? ' +' + v.extra_price : ''}</span>`) : html`<span class="muted">—</span>` }, { h: 'Tax', r: r => r.tax_name || '—' }, { h: 'Status', r: state }],
  form: (r, x) => html`<div class="cols2">${field({ name: 'name', label: 'Name', required: true, value: r?.name, attrs: 'maxlength="100"' })}${field({ name: 'type', label: 'Type', type: 'select', required: true, value: r?.type || 'software', options: [['software', 'Software'], ['service', 'Service'], ['addon', 'Add-on'], ['physical', 'Physical']] })}
    ${field({ name: 'sales_price', label: 'Sales price (₹)', type: 'number', required: true, value: r?.sales_price ?? '', attrs: 'min="0" step="0.01"' })}${field({ name: 'cost_price', label: 'Cost price (₹)', type: 'number', value: r?.cost_price ?? '', attrs: 'min="0" step="0.01"' })}</div>
    ${field({ name: 'tax_id', label: 'Default tax', type: 'select', value: r?.tax_id ?? '', options: taxOpts(x) })}${field({ name: 'notes', label: 'Notes', type: 'textarea', value: r?.notes || '' })}
    <label style="font-weight:600;font-size:13px;display:block;margin-bottom:6px">Variants <span class="muted" style="font-weight:400">— e.g. Brand: Odoo adds ₹560 to the price</span></label><div data-err="variants" class="err"></div>
    ${repeater('variants', r?.variants || [], vrow, 'Add variant')}`,
  repeaters: () => ({ variants: vrow }),
  toBody: (o, form) => ({ ...o, tax_id: numOrNull(o.tax_id), cost_price: o.cost_price || 0, variants: readRep(form, 'variants').filter(v => v.attribute || v.value).map(v => ({ ...v, id: v.id || null })) }),
});
const vrow = (v = {}) => html`<div class="rep-row" style="--c:3"><input data-k="attribute" placeholder="Attribute (Brand)" value="${v.attribute || ''}" maxlength="40" required aria-label="Attribute"><input data-k="value" placeholder="Value (Odoo)" value="${v.value || ''}" maxlength="60" required aria-label="Value">
  <input data-k="extra_price" type="number" step="0.01" placeholder="Extra price" value="${v.extra_price ?? ''}" aria-label="Extra price"><input data-k="id" type="hidden" value="${v.id || ''}"><button type="button" class="icon" data-del aria-label="Remove variant">×</button></div>`;

export const plans = (root, { user }) => crud(root, {
  title: 'Plans', noun: 'plan', sub: 'What a subscription costs and how often it bills.', path: '/plans', canWrite: user.role === 'admin', archive: true, size: 'lg', newLabel: 'New plan',
  load: async () => user.role === 'admin' ? { taxes: await api.get('/taxes', { active: 1, per_page: 100 }) } : { taxes: { items: [] } },
  columns: [{ h: 'Plan', r: r => html`<b>${r.name}</b>` }, { h: 'Price', cls: 'num', r: r => inr(r.price) }, { h: 'Billing', r: r => html`<span style="text-transform:capitalize">${r.billing_period}</span>` }, { h: 'Min qty', cls: 'num', r: r => r.min_quantity },
    { h: 'Available', r: r => `${fdate(r.start_date)} → ${r.end_date ? fdate(r.end_date) : 'open'}` }, { h: 'Auto-close', r: r => yn(r.auto_close) }, { h: 'Pause', r: r => yn(r.allow_pause) }, { h: 'Early close', r: r => yn(r.allow_early_close) }, { h: 'Renew', r: r => yn(r.allow_renew) }, { h: 'Status', r: state }],
  form: (r, x) => html`<div class="cols2">${field({ name: 'name', label: 'Plan name', required: true, value: r?.name, attrs: 'maxlength="100"' })}${field({ name: 'price', label: 'Price per cycle (₹)', type: 'number', required: true, value: r?.price ?? '', attrs: 'min="0" step="0.01"' })}
    ${field({ name: 'billing_period', label: 'Billing period', type: 'select', required: true, value: r?.billing_period || 'monthly', options: PER })}${field({ name: 'min_quantity', label: 'Minimum quantity', type: 'number', required: true, value: r?.min_quantity ?? 1, attrs: 'min="1" step="1"' })}
    ${field({ name: 'start_date', label: 'Available from', type: 'date', required: true, value: r?.start_date })}${field({ name: 'end_date', label: 'Available until', type: 'date', value: r?.end_date || '', hint: 'Leave empty for no end date' })}</div>
    ${field({ name: 'tax_id', label: 'Tax on plan fee', type: 'select', value: r?.tax_id ?? '', options: taxOpts(x) })}
    <h3 style="margin:6px 0 10px">What can happen to subscriptions on this plan?</h3>${field({ name: 'auto_close', label: 'Close automatically when it ends', type: 'checkbox', value: r?.auto_close })}${field({ name: 'allow_early_close', label: 'Can be closed early', type: 'checkbox', value: r?.allow_early_close })}
    ${field({ name: 'allow_pause', label: 'Can be paused', type: 'checkbox', value: r?.allow_pause })}${field({ name: 'allow_renew', label: 'Can be renewed', type: 'checkbox', value: r?.allow_renew })}`,
  toBody: o => ({ ...o, tax_id: numOrNull(o.tax_id), end_date: o.end_date || null }),
});

export const taxes = (root, { user }) => crud(root, {
  title: 'Taxes', noun: 'tax', sub: 'Rules applied automatically to invoice lines.', path: '/taxes', canWrite: user.role === 'admin', archive: true, newLabel: 'New tax',
  columns: [{ h: 'Name', r: r => html`<b>${r.name}</b>` }, { h: 'Rate', cls: 'num', r: r => r.rate + '%' }, { h: 'Status', r: state }],
  form: r => html`${field({ name: 'name', label: 'Tax name', required: true, value: r?.name, attrs: 'maxlength="60"' })}${field({ name: 'rate', label: 'Rate (%)', type: 'number', required: true, value: r?.rate ?? '', attrs: 'min="0" max="100" step="0.01"' })}${field({ name: 'active', label: 'Active', type: 'checkbox', value: r ? r.active : true })}`,
});

export const discounts = (root, { user }) => crud(root, {
  title: 'Discounts', noun: 'discount', sub: user.role === 'admin' ? 'Qualifying discounts appear on the next invoice on their own.' : 'Only the admin can create or change discount rules.', path: '/discounts', canWrite: user.role === 'admin', archive: true, size: 'lg', newLabel: 'New discount',
  load: async () => ({ products: await api.get('/products', { active: 1, per_page: 100 }) }),
  columns: [{ h: 'Discount', r: r => html`<b>${r.name}</b><div class="muted">${r.applies_to === 'product' ? 'On ' + r.product_name : r.subscription_number ? 'On ' + r.subscription_number : 'Whole subscription'}</div>` },
    { h: 'Value', cls: 'num', r: r => r.type === 'percent' ? r.value + '%' : inr(r.value) }, { h: 'Minimums', r: r => [r.min_purchase ? 'spend ' + inr(r.min_purchase) : '', r.min_quantity ? 'qty ' + r.min_quantity : ''].filter(Boolean).join(' · ') || '—' },
    { h: 'Valid', r: r => r.start_date || r.end_date ? `${fdate(r.start_date)} → ${fdate(r.end_date)}` : 'Always' }, { h: 'Used', cls: 'num', r: r => r.usage_limit ? `${r.times_used} / ${r.usage_limit}` : r.times_used }, { h: 'Status', r: r => r.active ? (r.usage_limit && r.times_used >= r.usage_limit ? badge('closed') : badge('active')) : badge('closed') }],
  form: (r, x) => html`${field({ name: 'name', label: 'Name', required: true, value: r?.name, attrs: 'maxlength="80"' })}<div class="cols3">${field({ name: 'type', label: 'Type', type: 'select', required: true, value: r?.type || 'percent', options: [['percent', 'Percentage'], ['fixed', 'Fixed amount']] })}
    ${field({ name: 'value', label: 'Value', type: 'number', required: true, value: r?.value ?? '', attrs: 'min="0.01" step="0.01"' })}${field({ name: 'usage_limit', label: 'Usage limit', type: 'number', value: r?.usage_limit ?? '', attrs: 'min="1" step="1"', hint: 'Empty = unlimited' })}
    ${field({ name: 'min_purchase', label: 'Minimum purchase (₹)', type: 'number', value: r?.min_purchase ?? 0, attrs: 'min="0" step="0.01"' })}${field({ name: 'min_quantity', label: 'Minimum quantity', type: 'number', value: r?.min_quantity ?? 0, attrs: 'min="0" step="1"' })}<div></div>
    ${field({ name: 'start_date', label: 'Starts', type: 'date', value: r?.start_date || '' })}${field({ name: 'end_date', label: 'Ends', type: 'date', value: r?.end_date || '' })}<div></div></div>
    <div class="cols2">${field({ name: 'applies_to', label: 'Applies to', type: 'select', required: true, value: r?.applies_to || 'product', options: [['product', 'A specific product'], ['subscription', 'Whole subscriptions']] })}
    ${field({ name: 'product_id', label: 'Product', type: 'select', value: r?.product_id ?? '', options: opts(x.products.items.map(p => [p.id, p.name]), '— not needed for subscriptions —'), hint: 'Required when applying to a product' })}</div>${field({ name: 'active', label: 'Active', type: 'checkbox', value: r ? r.active : true })}`,
  toBody: o => ({ ...o, usage_limit: numOrNull(o.usage_limit), product_id: numOrNull(o.product_id), start_date: o.start_date || null, end_date: o.end_date || null }),
});

const trow = (prods) => (l = {}) => html`<div class="rep-row" style="--c:3"><select data-k="product_id" required aria-label="Product">${[['', 'Product…'], ...prods.items.map(p => [p.id, p.name])].map(([v, t]) => html`<option value="${v}" ${raw(v == l.product_id ? 'selected' : '')}>${t}</option>`)}</select>
  <select data-k="variant_id" aria-label="Variant">${[['', 'No variant'], ...prods.items.flatMap(p => p.variants.map(v => [v.id, `${p.name} · ${v.value}`]))].map(([v, t]) => html`<option value="${v}" ${raw(v == l.variant_id ? 'selected' : '')}>${t}</option>`)}</select>
  <input data-k="quantity" type="number" min="1" step="1" value="${l.quantity || 1}" required aria-label="Quantity"><button type="button" class="icon" data-del aria-label="Remove line">×</button></div>`;
export const templates = (root, { user }) => crud(root, {
  title: 'Quotation templates', noun: 'template', sub: 'Pre-built plan and product lines for faster quotes.', path: '/templates', canWrite: true, archive: true, size: 'lg', newLabel: 'New template',
  load: async () => ({ plans: await api.get('/plans', { active: 1, per_page: 100 }), products: await api.get('/products', { active: 1, per_page: 100 }) }),
  columns: [{ h: 'Template', r: r => html`<b>${r.name}</b>` }, { h: 'Plan', r: r => r.plan_name }, { h: 'Valid for', cls: 'num', r: r => r.validity_days + ' days' },
    { h: 'Lines', r: r => r.lines.map(l => html`<div>${l.quantity} × ${l.product_name}${l.value ? ' · ' + l.value : ''}</div>`) }, { h: 'Status', r: state }],
  form: (r, x) => html`${field({ name: 'name', label: 'Template name', required: true, value: r?.name, attrs: 'maxlength="100"' })}<div class="cols2">${field({ name: 'plan_id', label: 'Plan', type: 'select', required: true, value: r?.plan_id, options: opts(x.plans.items.map(p => [p.id, p.name]), 'Select plan…') })}
    ${field({ name: 'validity_days', label: 'Quotation valid for (days)', type: 'number', required: true, value: r?.validity_days ?? 30, attrs: 'min="1" max="365" step="1"' })}</div>${field({ name: 'notes', label: 'Notes', type: 'textarea', value: r?.notes || '' })}
    <label style="font-weight:600;font-size:13px;display:block;margin-bottom:6px">Product lines</label><div class="err" data-err="lines"></div>${repeater('lines', r?.lines?.length ? r.lines : [{}], trow(x.products), 'Add line')}`,
  repeaters: x => ({ lines: trow(x.products) }),
  toBody: (o, form) => ({ ...o, lines: readRep(form, 'lines').filter(l => l.product_id).map(l => ({ product_id: +l.product_id, variant_id: l.variant_id ? +l.variant_id : null, quantity: +l.quantity })) }),
});
