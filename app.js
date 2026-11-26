(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const PAGE = 30;
  const SCOPES = {
    nacional: { name: 'Nacional', sub: 'Tribunales, BOE, prensa jurídica y sindicatos de toda España' },
    canarias: { name: 'Canarias', sub: 'TSJC, audiencias provinciales, BOC y prensa canaria' },
    europa: { name: 'Europa', sub: 'TJUE, TEDH, Fiscalía Europea y normativa de la UE' },
    internacional: { name: 'Internacional', sub: 'Corte Penal Internacional, ONU y tribunales de otros países' },
  };
  const KIND_ORDER = ['Oficial', 'Prensa jurídica', 'Prensa', 'Sindicatos'];

  // ---------- Almacenamiento local (colecciones y preferencias) ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
  };
  let cols = store.get('jad-colecciones', null);
  if (!Array.isArray(cols)) cols = [{ id: 'leer', name: 'Leer más tarde', items: {}, created: Date.now() }];
  const saveCols = () => { store.set('jad-colecciones', cols); updateBadge(); };

  // Estilo visual: ?tema=periodico|app|lector
  const params = new URLSearchParams(location.search);
  const theme = params.get('tema') || store.get('jad-tema', 'periodico');
  if (params.get('tema')) store.set('jad-tema', theme);
  document.body.classList.add('theme-' + theme);

  const state = { items: [], byId: new Map(), q: '', kind: '', topic: '', shown: PAGE, route: 'portada' };

  // ---------- Utilidades ----------
  const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (s = '') => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const domain = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
  const fav = (u) => `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain(u))}&sz=64`;
  const href = (i) => i.url || i.link;
  function ago(iso) {
    const d = new Date(iso); const m = Math.round((Date.now() - d) / 60000);
    if (m < 1) return 'ahora';
    if (m < 60) return `hace ${m} min`;
    if (m < 60 * 24 && d.getDate() === new Date().getDate()) return `hace ${Math.round(m / 60)} h`;
    if (m < 60 * 48) return 'ayer ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  }
  const inCols = (id) => cols.some((c) => c.items[id]);
  const toast = (msg) => { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 2200); };

  const ICON = {
    out: '<svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
    save: '<svg viewBox="0 0 24 24"><path d="M6 3h12v18l-6-4-6 4z"/></svg>',
  };

  function placeholder(i) {
    return `<div class="ph k-${esc(i.kind || '')}"><img class="fav" src="${fav(i.originUrl || href(i))}" alt="" loading="lazy"><span>${esc(i.origin || i.source)}</span></div>`;
  }
  function media(i) {
    return `<div class="media">${i.image ? `<img src="${esc(i.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-ph="1">` : placeholder(i)}</div>`;
  }
  function card(i, variant = 'grid') {
    const saved = inCols(i.id);
    const cls = variant === 'lead' ? 'card lead' : variant === 'row' ? 'card row-card' : 'card';
    return `<article class="${cls}" data-id="${esc(i.id)}">
      ${media(i)}
      <div class="body">
        <div class="meta"><img class="fav" src="${fav(i.originUrl || href(i))}" alt="" loading="lazy"><span class="origin">${esc(i.origin || i.source)}</span><span>· ${ago(i.date)}</span>${variant !== 'row' && i.kind === 'Oficial' ? '<span class="pill">Oficial</span>' : ''}</div>
        <h3><a href="${esc(href(i))}" target="_blank" rel="noopener">${esc(i.title)}</a></h3>
        ${i.summary && variant !== 'row' ? `<p class="sum">${esc(i.summary)}</p>` : ''}
        <div class="foot">
          <div class="tags">${(i.topics || []).slice(0, 2).map((t) => `<span class="tag">#${esc(t)}</span>`).join('')}</div>
          <div class="actions">
            ${variant !== 'row' ? `<a class="act" href="${esc(href(i))}" target="_blank" rel="noopener" title="Abrir en ${esc(i.origin || i.source)}">${ICON.out}<span class="lbl">Fuente</span></a>` : ''}
            <button class="act${saved ? ' saved' : ''}" data-save="${esc(i.id)}" aria-label="Guardar en colección">${ICON.save}<span class="lbl">${saved ? 'Guardada' : 'Guardar'}</span></button>
          </div>
        </div>
      </div>
    </article>`;
  }
  const findSaved = (id) => { for (const c of cols) if (c.items[id]) return c.items[id]; return null; };
  // Si una foto falla, se cambia por el logotipo del medio.
  document.addEventListener('error', (e) => {
    const img = e.target;
    if (img.tagName !== 'IMG') return;
    if (img.dataset.ph) {
      const id = img.closest('[data-id]')?.dataset.id; const it = state.byId.get(id) || findSaved(id);
      img.closest('.media').innerHTML = it ? placeholder(it) : '';
    } else if (img.classList.contains('fav')) img.style.visibility = 'hidden';
  }, true);

  // ---------- Vistas ----------
  const view = $('#view');
  const fresh = (list, hours) => list.filter((i) => Date.now() - new Date(i.date) < hours * 3600e3);
  const withImg = (list) => list.filter((i) => i.image);
  const uniq = (list) => list.filter((v, k, a) => a.indexOf(v) === k);

  function renderPortada() {
    const all = state.items.filter((i) => i.kind !== 'Oficial');
    const pool = withImg(fresh(all, 48)).length >= 5 ? withImg(fresh(all, 48)) : withImg(all);
    const lead = pool[0] || all[0];
    const side = uniq([...pool, ...all]).filter((i) => i !== lead).slice(0, 4);
    const used = new Set([lead, ...side].filter(Boolean).map((i) => i.id));
    let html = '';
    if (lead) html += `<section class="hero">${card(lead, 'lead')}<div class="side">${side.map((i) => card(i, 'row')).join('')}</div></section>`;
    for (const [key, s] of Object.entries(SCOPES)) {
      const list = state.items.filter((i) => i.scope === s.name && i.kind !== 'Oficial' && !used.has(i.id));
      const pick = uniq([...withImg(fresh(list, 72)), ...list]).slice(0, 4).sort((a, b) => new Date(b.date) - new Date(a.date));
      if (!pick.length) continue;
      pick.forEach((i) => used.add(i.id));
      html += `<div class="sec-head"><h2>${s.name}</h2><a href="#${key}">Ver todo →</a></div><div class="cols">${pick.map((i) => card(i, 'row')).join('')}</div>`;
    }
    const docs = state.items.filter((i) => i.kind === 'Oficial' && /BOE|BOC/.test(i.origin)).slice(0, 8);
    if (docs.length) {
      html += `<div class="sec-head"><h2>Boletines oficiales</h2><a href="#nacional" data-kind="Oficial">Ver todo →</a></div><ul class="doclist">${docs.map((i) =>
        `<li><span class="doc">${esc(i.origin)}</span><div><a href="${esc(href(i))}" target="_blank" rel="noopener">${esc(i.title)}</a><span class="when">${esc(i.source)} · ${ago(i.date)}</span></div></li>`).join('')}</ul>`;
    }
    view.innerHTML = html || '<p class="empty">Aún no hay noticias. La primera actualización llegará pronto.</p>';
  }

  function chipsHtml(values, current, attr, allLabel) {
    return `<div class="chips">${[['', allLabel], ...values.map((v) => [v, v])].map(([v, l]) =>
      `<button class="chip${current === v ? ' on' : ''}" data-${attr}="${esc(v)}">${esc(l)}</button>`).join('')}</div>`;
  }

  function renderList(title, sub, base) {
    let list = base;
    const kinds = KIND_ORDER.filter((k) => base.some((i) => i.kind === k));
    const topics = [...new Set(base.flatMap((i) => i.topics || []))].sort();
    if (state.kind) list = list.filter((i) => i.kind === state.kind);
    if (state.topic) list = list.filter((i) => (i.topics || []).includes(state.topic));
    let html = `<h1 class="page-title">${esc(title)}</h1><p class="page-sub">${esc(sub)} · ${list.length} noticias</p>`;
    html += `<div class="filters">${chipsHtml(kinds, state.kind, 'kind', 'Todas las fuentes')}${topics.length ? chipsHtml(topics, state.topic, 'topic', 'Todos los temas') : ''}</div>`;
    html += list.length ? `<div class="grid">${list.slice(0, state.shown).map((i) => card(i)).join('')}</div>` : '<p class="empty">No hay noticias con estos filtros.</p>';
    if (list.length > state.shown) html += `<button class="more" data-more>Ver más (${list.length - state.shown})</button>`;
    view.innerHTML = html;
  }

  function renderSearch() {
    const words = norm(state.q).split(/\s+/).filter(Boolean);
    const base = state.items.filter((i) => { const t = norm(`${i.title} ${i.summary} ${i.origin} ${i.source}`); return words.every((w) => t.includes(w)); });
    renderList(`“${state.q}”`, 'Resultados en todas las secciones', base);
  }

  function colThumbs(c) {
    const its = Object.values(c.items).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0)).slice(0, 3);
    const cells = its.map((i) => `<div>${i.image ? `<img src="${esc(i.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : placeholder(i)}</div>`);
    while (cells.length < 3) cells.push('<div></div>');
    return `<div class="col-thumbs">${cells.join('')}</div>`;
  }
  function renderColecciones() {
    view.innerHTML = `<h1 class="page-title">Colecciones</h1><p class="page-sub">Tus noticias guardadas, organizadas a tu manera. Se guardan en este dispositivo.</p>
      <div class="toolbar"><button class="btn primary" data-newcol>+ Nueva colección</button><button class="btn" data-export>Exportar copia</button><button class="btn" data-import>Importar copia</button></div>
      <div class="col-grid">${cols.map((c) => `<button class="col-card" data-open="${esc(c.id)}">${colThumbs(c)}<div class="body"><b>${esc(c.name)}</b><span class="n">${Object.keys(c.items).length} noticias</span></div></button>`).join('')}</div>`;
  }
  function renderColeccion(id) {
    const c = cols.find((x) => x.id === id);
    if (!c) { location.hash = '#colecciones'; return; }
    const list = Object.values(c.items).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
    view.innerHTML = `<button class="back" data-go="#colecciones">← Colecciones</button><h1 class="page-title">${esc(c.name)}</h1><p class="page-sub">${list.length} noticias guardadas</p>
      <div class="toolbar"><button class="btn" data-rename="${esc(c.id)}">Cambiar nombre</button><button class="btn danger" data-delcol="${esc(c.id)}">Borrar colección</button></div>
      ${list.length ? `<div class="grid">${list.map((i) => card(i)).join('')}</div>` : '<p class="empty">Esta colección está vacía. Pulsa “Guardar” en cualquier noticia para añadirla.</p>'}`;
  }

  function render() {
    const r = state.route;
    document.querySelectorAll('#tabs a').forEach((a) => a.classList.toggle('on', a.dataset.tab === r.split('/')[0].replace('coleccion', 'colecciones').replace('coleccioneses', 'colecciones')));
    if (state.q) return renderSearch();
    if (r === 'portada') return renderPortada();
    if (SCOPES[r]) return renderList(SCOPES[r].name, SCOPES[r].sub, state.items.filter((i) => i.scope === SCOPES[r].name));
    if (r === 'colecciones') return renderColecciones();
    if (r.startsWith('coleccion/')) return renderColeccion(decodeURIComponent(r.slice(10)));
    renderPortada();
  }
  function route() {
    const r = (location.hash || '#portada').slice(1) || 'portada';
    if (r !== state.route) { state.kind = state.pendingKind || ''; state.topic = ''; state.shown = PAGE; state.pendingKind = ''; }
    state.route = r;
    if (state.q) { state.q = ''; $('#q').value = ''; $('#searchbar').hidden = true; }
    render();
    window.scrollTo(0, 0);
  }
  function updateBadge() { const n = cols.reduce((s, c) => s + Object.keys(c.items).length, 0); $('#colBadge').textContent = n || ''; }

  // ---------- Guardar en colecciones ----------
  let sheetItem = null;
  function openSheet(id) {
    sheetItem = state.byId.get(id) || findSaved(id);
    if (!sheetItem) return;
    $('#sheetNews').textContent = sheetItem.title;
    drawSheet();
    $('#sheet').hidden = false;
  }
  function drawSheet() {
    $('#sheetList').innerHTML = cols.map((c) => `<li><label><input type="checkbox" data-col="${esc(c.id)}" ${c.items[sheetItem.id] ? 'checked' : ''}> ${esc(c.name)} <small>${Object.keys(c.items).length}</small></label></li>`).join('');
  }
  const closeSheet = () => { $('#sheet').hidden = true; sheetItem = null; render(); };
  $('#sheetList').addEventListener('change', (e) => {
    const c = cols.find((x) => x.id === e.target.dataset.col); if (!c || !sheetItem) return;
    if (e.target.checked) { c.items[sheetItem.id] = { ...sheetItem, savedAt: Date.now() }; toast(`Guardada en “${c.name}”`); }
    else delete c.items[sheetItem.id];
    saveCols(); drawSheet();
  });
  $('#sheetNew').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#newCol').value.trim(); if (!name) return;
    const c = { id: 'c' + Date.now().toString(36), name, items: {}, created: Date.now() };
    if (sheetItem) c.items[sheetItem.id] = { ...sheetItem, savedAt: Date.now() };
    cols.push(c); saveCols(); $('#newCol').value = ''; drawSheet();
    toast(`Colección “${name}” creada`);
  });
  $('#sheet').addEventListener('click', (e) => { if (e.target.id === 'sheet' || e.target.closest('[data-close]')) closeSheet(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#sheet').hidden) closeSheet(); });

  // ---------- Clicks ----------
  view.addEventListener('click', (e) => {
    const t = e.target.closest('button, a'); if (!t) return;
    const d = t.dataset;
    if (d.save) { e.preventDefault(); openSheet(d.save); }
    else if (d.more !== undefined) { state.shown += PAGE; render(); }
    else if (d.kind !== undefined && t.classList.contains('chip')) { state.kind = d.kind; state.shown = PAGE; render(); }
    else if (d.kind !== undefined && t.tagName === 'A') { state.pendingKind = d.kind; }
    else if (d.topic !== undefined) { state.topic = d.topic; state.shown = PAGE; render(); }
    else if (d.open) location.hash = '#coleccion/' + encodeURIComponent(d.open);
    else if (d.go) location.hash = d.go;
    else if (d.newcol !== undefined) {
      const name = prompt('Nombre de la nueva colección'); if (!name?.trim()) return;
      cols.push({ id: 'c' + Date.now().toString(36), name: name.trim(), items: {}, created: Date.now() }); saveCols(); render();
    } else if (d.rename) {
      const c = cols.find((x) => x.id === d.rename); const name = prompt('Nuevo nombre', c.name); if (!name?.trim()) return;
      c.name = name.trim(); saveCols(); render();
    } else if (d.delcol) {
      const c = cols.find((x) => x.id === d.delcol);
      if (!confirm(`¿Borrar la colección “${c.name}” y sus ${Object.keys(c.items).length} noticias guardadas?`)) return;
      cols = cols.filter((x) => x !== c); if (!cols.length) cols.push({ id: 'leer', name: 'Leer más tarde', items: {}, created: Date.now() });
      saveCols(); location.hash = '#colecciones';
    } else if (d.export !== undefined) {
      const blob = new Blob([JSON.stringify({ app: 'justicia-al-dia', version: 1, cols }, null, 1)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `justicia-al-dia-colecciones-${new Date().toISOString().slice(0, 10)}.json`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } else if (d.import !== undefined) {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'application/json,.json';
      inp.onchange = async () => {
        try {
          const data = JSON.parse(await inp.files[0].text());
          for (const c of data.cols || []) {
            const ex = cols.find((x) => x.name === c.name);
            if (ex) Object.assign(ex.items, c.items); else cols.push(c);
          }
          saveCols(); render(); toast('Colecciones importadas');
        } catch { toast('Ese archivo no es una copia válida'); }
      };
      inp.click();
    }
  });

  // ---------- Búsqueda ----------
  $('#searchToggle').addEventListener('click', () => {
    const bar = $('#searchbar'); bar.hidden = !bar.hidden;
    if (!bar.hidden) { window.scrollTo(0, 0); $('#q').focus(); } else if (state.q) { $('#q').value = ''; state.q = ''; render(); }
  });
  let qt;
  $('#q').addEventListener('input', (e) => { clearTimeout(qt); qt = setTimeout(() => { state.q = e.target.value.trim(); state.shown = PAGE; state.kind = ''; state.topic = ''; render(); }, 180); });

  // ---------- Carga ----------
  $('#today').textContent = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  updateBadge();
  window.addEventListener('hashchange', route);
  async function load() {
    try {
      const res = await fetch('data/news.json', { cache: 'no-cache' });
      const data = await res.json();
      state.items = data.items || [];
      state.byId = new Map(state.items.map((i) => [i.id, i]));
      const up = data.updated ? new Date(data.updated) : null;
      $('#updated').textContent = up ? `Última actualización: ${up.toLocaleString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })} · ${state.items.length} noticias` : '';
      $('#status').innerHTML = (data.sources || []).map((s) => `<li class="${s.ok ? 'ok' : 'err'}">${esc(s.name)}: ${s.ok ? `${s.count} noticias` : `sin respuesta (${esc(s.error || '')})`}</li>`).join('');
    } catch {
      $('#updated').textContent = 'Sin conexión: mostrando lo último guardado.';
    }
    state.route = '';
    route();
  }
  load();

  if ('serviceWorker' in navigator && location.hostname !== 'localhost') window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
})();
