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

  const state = { items: [], byId: new Map(), q: '', f: {}, shown: PAGE, route: 'portada' };
  const DOC_ORDER = ['Sentencia', 'Auto', 'Recurso', 'Resolución'];
  const COURT_ORDER = ['Tribunal Supremo', 'Tribunal Constitucional', 'Audiencia Nacional', 'TSJ de Canarias', 'Otros TSJ', 'Audiencias provinciales', 'Juzgados', 'DGSJFP', 'TJUE', 'TEDH', 'Cortes internacionales'];

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
    doc: '<svg viewBox="0 0 24 24"><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>',
    share: '<svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.9 15.8 6.1M8.2 13.1l7.6 4.8"/></svg>',
    bell: '<svg viewBox="0 0 24 24"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10 20a2 2 0 0 0 4 0"/></svg>',
  };

  const hl = (s) => { let out = esc(s); for (const w of state.hl || []) { if (w.length < 3) continue; out = out.replace(new RegExp(`(${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), '<mark>$1</mark>'); } return out; };

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
        <div class="meta"><img class="fav" src="${fav(i.originUrl || href(i))}" alt="" loading="lazy"><span class="origin">${esc(i.origin || i.source)}</span><span>· ${ago(i.date)}</span></div>
        ${i.doc ? `<div class="ruling"><span class="pill doc">${esc(i.doc)}</span>${i.court ? `<span class="pill">${esc(i.court)}</span>` : ''}</div>` : (variant !== 'row' && i.kind === 'Oficial' ? '<div class="ruling"><span class="pill">Oficial</span></div>' : '')}
        <h3><a href="${esc(href(i))}" target="_blank" rel="noopener">${hl(i.title)}</a></h3>
        ${i.summary && variant !== 'row' ? `<p class="sum">${hl(i.summary)}</p>` : ''}
        ${(i.ecli || i.recurso) && variant !== 'row' ? `<div class="refs">${i.ecli ? `<code>${esc(i.ecli)}</code>` : ''}${i.recurso ? `<code>Rec. ${esc(i.recurso)}</code>` : ''}</div>` : ''}
        <div class="foot">
          <div class="tags">${(i.topics || []).slice(0, 2).map((t) => `<span class="tag">#${esc(t)}</span>`).join('')}</div>
          <div class="actions">
            ${variant !== 'row' ? `<a class="act" href="${esc(href(i))}" target="_blank" rel="noopener" title="Abrir en ${esc(i.origin || i.source)}">${ICON.out}<span class="lbl">${i.kind === 'Oficial' ? 'Ver texto' : 'Fuente'}</span></a>` : ''}
            <button class="act" data-share="${esc(i.id)}" aria-label="Compartir">${ICON.share}</button>
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
    const all = state.items.filter((i) => i.kind !== 'Oficial' && (i.scope === 'Nacional' || i.scope === 'Canarias'));
    const pool = withImg(fresh(all, 48)).length >= 5 ? withImg(fresh(all, 48)) : withImg(all);
    const lead = pool[0] || all[0];
    const side = uniq([...pool, ...all]).filter((i) => i !== lead).slice(0, 4);
    const used = new Set([lead, ...side].filter(Boolean).map((i) => i.id));
    let html = '';
    const nAlert = alerts.reduce((s, al) => s + alertHits(al).length, 0);
    if (nAlert) html += `<a class="alert-banner" href="#colecciones">${ICON.bell} Tienes <b>${nAlert}</b> ${nAlert === 1 ? 'novedad' : 'novedades'} en tus alertas →</a>`;
    if (lead) html += `<section class="hero">${card(lead, 'lead')}<div class="side">${side.map((i) => card(i, 'row')).join('')}</div></section>`;
    const rs = rulings().filter((i) => !used.has(i.id));
    const rsPick = uniq([...fresh(rs.filter((i) => i.kind === 'Oficial'), 72).slice(0, 2), ...rs]).slice(0, 6).sort((a, b) => new Date(b.date) - new Date(a.date));
    if (rsPick.length) {
      rsPick.forEach((i) => used.add(i.id));
      html += `<div class="sec-head"><h2>Sentencias y recursos</h2><a href="#sentencias">Ver todo →</a></div><div class="cols">${rsPick.map((i) => card(i, 'row')).join('')}</div>`;
    }
    for (const [key, s] of Object.entries(SCOPES)) {
      const list = state.items.filter((i) => i.scope === s.name && i.kind !== 'Oficial' && !i.doc && !used.has(i.id));
      const pick = uniq([...withImg(fresh(list, 72)), ...list]).slice(0, 4).sort((a, b) => new Date(b.date) - new Date(a.date));
      if (!pick.length) continue;
      pick.forEach((i) => used.add(i.id));
      html += `<div class="sec-head"><h2>${s.name}</h2><a href="#${key}">Ver todo →</a></div><div class="cols">${pick.map((i) => card(i, 'row')).join('')}</div>`;
    }
    const docs = state.items.filter((i) => i.kind === 'Oficial' && /BOE|BOC/.test(i.origin)).slice(0, 8);
    if (docs.length) {
      html += `<div class="sec-head"><h2>Boletines oficiales</h2><a href="#nacional" data-preset='{"kind":"Oficial"}'>Ver todo →</a></div><ul class="doclist">${docs.map((i) =>
        `<li><span class="doc">${esc(i.origin)}</span><div><a href="${esc(href(i))}" target="_blank" rel="noopener">${esc(i.title)}</a><span class="when">${esc(i.source)} · ${ago(i.date)}</span></div></li>`).join('')}</ul>`;
    }
    view.innerHTML = html || '<p class="empty">Aún no hay noticias. La primera actualización llegará pronto.</p>';
  }

  function chipsHtml(values, current, attr, allLabel) {
    return `<div class="chips">${[['', allLabel], ...values.map((v) => [v, v])].map(([v, l]) =>
      `<button class="chip${current === v ? ' on' : ''}" data-f="${attr}" data-v="${esc(v)}">${esc(l)}</button>`).join('')}</div>`;
  }

  // filters: [[campo, valores, etiqueta "todos"]]; los temas son una lista dentro de cada noticia.
  function renderList(title, sub, base, filters, extra = '') {
    filters = filters || [['kind', KIND_ORDER, 'Todas las fuentes'], ['topics', null, 'Todos los temas']];
    let list = base;
    let chips = '';
    for (const [field, order, allLabel] of filters) {
      const present = field === 'topics' ? [...new Set(base.flatMap((i) => i.topics || []))].sort() : (order || []).filter((v) => base.some((i) => i[field] === v));
      if (present.length > 1 || state.f[field]) chips += chipsHtml(present, state.f[field] || '', field, allLabel);
      const v = state.f[field];
      if (v) list = list.filter((i) => (field === 'topics' ? (i.topics || []).includes(v) : i[field] === v));
    }
    let html = `<h1 class="page-title">${esc(title)}</h1><p class="page-sub">${esc(sub)} · ${list.length} ${list.length === 1 ? 'resultado' : 'resultados'}</p>`;
    html += extra;
    if (chips) html += `<div class="filters">${chips}</div>`;
    html += list.length ? `<div class="grid">${list.slice(0, state.shown).map((i) => card(i)).join('')}</div>` : '<p class="empty">No hay noticias con estos filtros.</p>';
    if (list.length > state.shown) html += `<button class="more" data-more>Ver más (${list.length - state.shown})</button>`;
    view.innerHTML = html;
  }

  // Quita noticias casi iguales (la misma sentencia contada por varios medios).
  const words = (t) => new Set(norm(t).split(/[^a-z0-9ñ]+/).filter((w) => w.length > 3));
  function dedupe(list) {
    const kept = [];
    for (const i of list) {
      const w = words(i.title);
      const dup = kept.slice(-80).some((k) => { const kw = k._w; let n = 0; for (const x of w) if (kw.has(x)) n++; return n / Math.max(1, Math.min(w.size, kw.size)) >= 0.6; });
      if (!dup) { i._w = w; kept.push(i); }
    }
    return kept;
  }
  let rulingsCache = null;
  const rulings = () => rulingsCache || (rulingsCache = dedupe(everything().filter((i) => i.doc && i.title !== 'Sumario')));
  function renderSentencias() {
    if (!archive) loadArchive().then(() => { if (state.route === 'sentencias' && !state.q) render(); });
    renderList('Sentencias y recursos', 'Sentencias, autos, recursos y resoluciones de los tribunales' + (archive && archive.length ? ' · incluye el archivo' : ''), rulings(), [
      ['doc', DOC_ORDER, 'Todo'],
      ['court', COURT_ORDER, 'Todos los tribunales'],
      ['scope', ['Nacional', 'Canarias', 'Europa', 'Internacional'], 'Todos los ámbitos'],
      ['topics', null, 'Todas las materias'],
    ], alertsHtml());
  }

  // ---------- Archivo de sentencias (se carga al buscar o al abrir Sentencias) ----------
  let archive = null;
  async function loadArchive() {
    if (archive) return archive;
    archive = [];
    try {
      const idx = await (await fetch('data/sentencias/index.json', { cache: 'no-cache' })).json();
      const years = Object.keys(idx.years || {}).sort().reverse();
      const parts = await Promise.all(years.map((y) => fetch(`data/sentencias/${y}.json`, { cache: 'no-cache' }).then((r) => r.json()).catch(() => [])));
      archive = parts.flat();
    } catch {}
    rulingsCache = null; allCache = null;
    return archive;
  }
  let allCache = null;
  function everything() {
    if (allCache) return allCache;
    const seen = new Set(state.items.map((i) => i.id));
    allCache = [...state.items, ...(archive || []).filter((i) => !seen.has(i.id))].sort((a, b) => new Date(b.date) - new Date(a.date));
    return allCache;
  }

  // ---------- Búsqueda avanzada ----------
  // "frase exacta", -excluir, palabras sueltas (todas deben aparecer).
  function parseQuery(q) {
    const phrases = []; const excl = [];
    q = q.replace(/"([^"]+)"/g, (_, p) => { phrases.push(norm(p)); return ' '; });
    const words = [];
    for (const w of norm(q).split(/\s+/).filter(Boolean)) (w.startsWith('-') && w.length > 1 ? excl : words).push(w.replace(/^-/, ''));
    return { phrases, words, excl };
  }
  function matches(i, pq) {
    const t = norm(`${i.title} ${i.summary || ''} ${i.origin || ''} ${i.source || ''} ${i.court || ''} ${i.ecli || ''} ${i.recurso || ''}`);
    return pq.phrases.every((p) => t.includes(p)) && pq.words.every((w) => t.includes(w)) && !pq.excl.some((w) => t.includes(w));
  }
  function searchResults(q, f) {
    const pq = parseQuery(q);
    let list = everything().filter((i) => matches(i, pq));
    if (f.solo) list = list.filter((i) => i.doc);
    if (f.desde) list = list.filter((i) => i.date.slice(0, 10) >= f.desde);
    if (f.hasta) list = list.filter((i) => i.date.slice(0, 10) <= f.hasta);
    return list;
  }
  function renderSearch() {
    const pq = parseQuery(state.q);
    state.hl = [...pq.phrases, ...pq.words];
    const base = searchResults(state.q, state.f);
    const extra = `<div class="adv">
      <label class="switch"><input type="checkbox" data-solo ${state.f.solo ? 'checked' : ''}> Solo sentencias y recursos</label>
      <label>Desde <input type="date" data-date="desde" value="${esc(state.f.desde || '')}"></label>
      <label>Hasta <input type="date" data-date="hasta" value="${esc(state.f.hasta || '')}"></label>
      <button class="btn" data-alert>${ICON.bell} Crear alerta</button>
    </div>
    <p class="hint">Consejo: usa "comillas" para una frase exacta y un guion para excluir (por ejemplo: despido "fuerza mayor" -ERTE).</p>`;
    renderList(`Búsqueda: ${state.q}`, archive && archive.length ? 'Noticias recientes y archivo de sentencias' : 'Resultados en todas las secciones', base, [
      ['doc', DOC_ORDER, 'Cualquier tipo'],
      ['court', COURT_ORDER, 'Todos los tribunales'],
      ['scope', ['Nacional', 'Canarias', 'Europa', 'Internacional'], 'Todos los ámbitos'],
      ['topics', null, 'Todas las materias'],
    ], extra);
    state.hl = [];
  }

  // ---------- Alertas por palabras clave ----------
  let alerts = store.get('jad-alertas', []);
  const saveAlerts = () => { store.set('jad-alertas', alerts); updateBadge(); };
  const alertHits = (al) => searchResults(al.q, al.f || {}).filter((i) => new Date(i.date) > new Date(al.seen || 0) && (i.doc || !al.f?.solo));
  function alertsHtml() {
    if (!alerts.length) return `<div class="alerts-empty">${ICON.bell}<div><b>Alertas</b><p>Busca algo (por ejemplo “cláusula suelo” o “TSJ Canarias despido”) y pulsa “Crear alerta”. Aquí verás las novedades que coincidan.</p></div></div>`;
    return `<ul class="alerts">${alerts.map((al) => { const n = alertHits(al).length; return `<li><button class="alert-open" data-alertopen="${esc(al.id)}">${ICON.bell}<span>${esc(al.q)}${al.f?.solo ? ' <small>· solo sentencias</small>' : ''}</span>${n ? `<b class="badge">${n} nuevas</b>` : '<small>sin novedades</small>'}</button><button class="icon-btn dark small" data-alertdel="${esc(al.id)}" aria-label="Borrar alerta"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></li>`; }).join('')}</ul>`;
  }

  function colThumbs(c) {
    const its = Object.values(c.items).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0)).slice(0, 3);
    const cells = its.map((i) => `<div>${i.image ? `<img src="${esc(i.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : placeholder(i)}</div>`);
    while (cells.length < 3) cells.push('<div></div>');
    return `<div class="col-thumbs">${cells.join('')}</div>`;
  }
  function renderColecciones() {
    view.innerHTML = `<h1 class="page-title">Mis guardados</h1><p class="page-sub">Tus alertas y colecciones. Se guardan en este dispositivo; usa “Exportar copia” para pasarlas a otro.</p>
      <div class="toolbar"><button class="btn primary" data-newcol>+ Nueva colección</button><button class="btn" data-export>Exportar copia</button><button class="btn" data-import>Importar copia</button></div>
      <div class="sec-head"><h2>Alertas</h2></div>${alertsHtml()}
      <div class="sec-head"><h2>Colecciones</h2></div>
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
    if (r === 'sentencias') return renderSentencias();
    if (SCOPES[r]) return renderList(SCOPES[r].name, SCOPES[r].sub, state.items.filter((i) => i.scope === SCOPES[r].name));
    if (r === 'colecciones') return renderColecciones();
    if (r.startsWith('coleccion/')) return renderColeccion(decodeURIComponent(r.slice(10)));
    renderPortada();
  }
  function route() {
    const r = (location.hash || '#portada').slice(1) || 'portada';
    if (r !== state.route) { state.f = state.pending || {}; state.shown = PAGE; state.pending = null; }
    state.route = r;
    if (state.q) { state.q = ''; $('#q').value = ''; $('#searchbar').hidden = true; }
    render();
    window.scrollTo(0, 0);
  }
  function updateBadge() { const n = state.items.length ? alerts.reduce((s, al) => s + alertHits(al).length, 0) : 0; $('#colBadge').textContent = n || ''; }

  // ---------- Compartir ----------
  async function share(id) {
    const i = state.byId.get(id) || findSaved(id) || (archive || []).find((x) => x.id === id);
    if (!i) return;
    const url = href(i);
    const text = `${i.title}${i.doc ? ` (${i.doc}${i.court ? ' · ' + i.court : ''})` : ''} · vía ${i.origin || i.source}`;
    if (navigator.share) { try { await navigator.share({ title: i.title, text, url }); return; } catch (e) { if (e.name === 'AbortError') return; } }
    try { await navigator.clipboard.writeText(`${text}\n${url}`); toast('Enlace copiado: pégalo donde quieras'); }
    catch { window.open(`https://wa.me/?text=${encodeURIComponent(text + ' ' + url)}`, '_blank', 'noopener'); }
  }

  // ---------- Guardar en colecciones ----------
  let sheetItem = null;
  function openSheet(id) {
    sheetItem = state.byId.get(id) || findSaved(id) || (archive || []).find((x) => x.id === id);
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
    else if (d.share) { e.preventDefault(); share(d.share); }
    else if (d.more !== undefined) { state.shown += PAGE; render(); }
    else if (d.f) { state.f[d.f] = d.v; state.shown = PAGE; render(); }
    else if (d.preset) { state.pending = JSON.parse(d.preset); }
    else if (d.alert !== undefined) {
      if (alerts.some((x) => x.q === state.q && JSON.stringify(x.f) === JSON.stringify(state.f))) { toast('Ya tienes esa alerta'); return; }
      alerts.push({ id: 'a' + Date.now().toString(36), q: state.q, f: { ...state.f }, seen: new Date().toISOString() }); saveAlerts(); toast('Alerta creada: verás aquí las novedades');
    } else if (d.alertopen) {
      const al = alerts.find((x) => x.id === d.alertopen); if (!al) return;
      al.seen = new Date().toISOString(); saveAlerts();
      state.q = al.q; state.f = { ...(al.f || {}) }; state.shown = PAGE; $('#searchbar').hidden = false; $('#q').value = al.q; render(); window.scrollTo(0, 0);
    } else if (d.alertdel) { alerts = alerts.filter((x) => x.id !== d.alertdel); saveAlerts(); render(); }
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

  view.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.solo !== undefined) { state.f.solo = t.checked; state.shown = PAGE; render(); }
    else if (t.dataset.date) { state.f[t.dataset.date] = t.value; state.shown = PAGE; render(); }
  });

  // ---------- Búsqueda ----------
  $('#searchToggle').addEventListener('click', () => {
    const bar = $('#searchbar'); bar.hidden = !bar.hidden;
    if (!bar.hidden) { window.scrollTo(0, 0); $('#q').focus(); } else if (state.q) { $('#q').value = ''; state.q = ''; render(); }
  });
  let qt;
  $('#q').addEventListener('input', (e) => { clearTimeout(qt); qt = setTimeout(() => { loadArchive().then(() => state.q && render()); state.q = e.target.value.trim(); state.shown = PAGE; state.f = {}; render(); }, 180); });

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
    updateBadge();
    route();
  }
  load();

  if ('serviceWorker' in navigator && location.hostname !== 'localhost') window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
})();
