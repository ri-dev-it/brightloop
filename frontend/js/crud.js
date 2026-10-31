/* Generic list + create/edit modal, reused by customers, products, plans, taxes, discounts, templates and team. */
import { api } from './api.js';
import { debounce, empty, html, modal, pager, setHTML, skeleton, table, toast, bindRepeaters, raw } from './ui.js';

export async function crud(root, cfg) {
  const st = { q: '', page: 1, data: null, extra: cfg.load ? await cfg.load() : {} };
  setHTML(root, html`<div class="page"><div class="head"><div><h1>${cfg.title}</h1><p>${cfg.sub || ''}</p></div>
    ${cfg.canWrite ? html`<button class="btn primary" data-new>+ ${cfg.newLabel || 'New'}</button>` : ''}</div>
    <div class="card flush"><div class="bar"><div class="grow"><input type="search" placeholder="Search ${cfg.title.toLowerCase()}…" data-q aria-label="Search"></div></div><div data-body></div></div></div>`);
  const body = root.querySelector('[data-body]');

  async function load() {
    setHTML(body, skeleton());
    try { st.data = await api.get(cfg.path, { q: st.q, page: st.page, per_page: 10 }); } catch (e) { setHTML(body, empty('Could not load', e.message)); return; }
    const d = st.data;
    if (!d.items.length) { setHTML(body, empty('Nothing here yet', st.q ? 'Try a different search.' : (cfg.canWrite ? `Use “New” to add the first one.` : ''))); return; }
    const cols = [...cfg.columns];
    if (cfg.canWrite) cols.push({ h: '', cls: 'right nowrap', r: r => html`<button class="btn sm" data-edit="${r.id}">Edit</button> ${cfg.archive && r.active !== 0 ? html`<button class="btn sm danger" data-arch="${r.id}">Archive</button>` : ''}` });
    setHTML(body, html`${table(cols, d.items)}${pager(d)}`);
  }

  function open(row) {
    const rowsFns = cfg.repeaters ? cfg.repeaters(st.extra) : {};
    modal({
      title: (row ? 'Edit ' : 'New ') + (cfg.noun || cfg.title.toLowerCase()), size: cfg.size || '', submit: row ? 'Save changes' : `Create ${cfg.noun || ''}`.trim(),
      body: cfg.form(row, st.extra),
      onOpen: (el) => bindRepeaters(el, rowsFns),
      onSubmit: async (obj, form, close) => {
        const payload = cfg.toBody ? cfg.toBody(obj, form, row) : obj;
        row ? await api.put(`${cfg.path}/${row.id}`, payload) : await api.post(cfg.path, payload);
        toast(row ? 'Changes saved' : 'Created'); close(); load();
      },
    });
  }

  root.onclick = async e => {
    if (e.target.closest('[data-new]')) return open(null);
    const ed = e.target.closest('[data-edit]'); if (ed) return open(st.data.items.find(r => r.id == ed.dataset.edit));
    const pg = e.target.closest('[data-page]'); if (pg && !pg.disabled) { st.page = +pg.dataset.page; return load(); }
    const ar = e.target.closest('[data-arch]');
    if (ar) {
      const { confirmBox } = await import('./ui.js');
      if (await confirmBox('Archive this item? It stays on past records but can no longer be used for new ones.', 'Archive', true)) {
        try { await api.del(`${cfg.path}/${ar.dataset.arch}`); toast('Archived'); load(); } catch (err) { toast(err.message, 'err'); }
      }
    }
  };
  root.querySelector('[data-q]').oninput = debounce(e => { st.q = e.target.value; st.page = 1; load(); });
  load();
}
