(() => {
  const $ = (s) => document.querySelector(s);
  const PAGE = 40;
  const state = { items: [], q: '', view: 'all', group: '', topic: '', shown: PAGE };
  const store = {
    get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  let saved = new Set(store.get('jad-saved', []));
  const savedItems = store.get('jad-saved-items', {});

  const esc = (s = '') => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (s = '') => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const fmtTime = (d) => d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  function dayLabel(d) {
    const t = new Date(); t.setHours(0, 0, 0, 0);
    const x = new Date(d); x.setHours(0, 0, 0, 0);
    const diff = Math.round((t - x) / 864e5);
    if (diff === 0) return 'Hoy';
    if (diff === 1) return 'Ayer';
    return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  function chips(el, values, key) {
    el.innerHTML = [['', key === 'group' ? 'Todas las fuentes' : 'Todos los temas'], ...values.map((v) => [v, v])]
      .map(([v, l]) => `<button class="chip${state[key] === v ? ' on' : ''}" data-v="${esc(v)}">${esc(l)}</button>`).join('');
    el.onclick = (e) => {
      const b = e.target.closest('.chip'); if (!b) return;
      state[key] = b.dataset.v; state.shown = PAGE;
      el.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === b));
      render();
    };
  }

  function filtered() {
    let list = state.view === 'saved'
      ? [...saved].map((id) => state.items.find((i) => i.id === id) || savedItems[id]).filter(Boolean)
      : state.items;
    if (state.group) list = list.filter((i) => i.group === state.group);
    if (state.topic) list = list.filter((i) => (i.topics || []).includes(state.topic));
    if (state.q) {
      const words = norm(state.q).split(/\s+/).filter(Boolean);
      list = list.filter((i) => { const t = norm(`${i.title} ${i.summary} ${i.source} ${i.origin}`); return words.every((w) => t.includes(w)); });
    }
    return list.sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  function render() {
    const list = filtered();
    const main = $('#list');
    if (!list.length) {
      main.innerHTML = `<p class="empty">${state.view === 'saved' ? 'Aún no has guardado noticias. Pulsa ☆ en cualquiera.' : 'No hay noticias con estos filtros.'}</p>`;
      return;
    }
    let html = ''; let last = '';
    for (const i of list.slice(0, state.shown)) {
      const d = new Date(i.date); const lab = dayLabel(d);
      if (lab !== last) { html += `<h3 class="day">${esc(lab)}</h3>`; last = lab; }
      const on = saved.has(i.id);
      html += `<article class="card">
        <div class="meta"><span class="src">${esc(i.source)}</span>${i.origin ? `<span>· ${esc(i.origin)}</span>` : ''}<span>· ${fmtTime(d)}</span></div>
        <h2><a href="${esc(i.link)}" target="_blank" rel="noopener">${esc(i.title)}</a></h2>
        ${i.summary ? `<p>${esc(i.summary)}</p>` : ''}
        <div class="row"><div class="topics">${(i.topics || []).map((t) => `<span class="topic">${esc(t)}</span>`).join('')}</div>
        <button class="save${on ? ' on' : ''}" data-id="${esc(i.id)}" aria-label="${on ? 'Quitar de guardadas' : 'Guardar'}">${on ? '★' : '☆'}</button></div>
      </article>`;
    }
    if (list.length > state.shown) html += `<button class="more" id="more">Ver más (${list.length - state.shown})</button>`;
    main.innerHTML = html;
  }

  $('#list').addEventListener('click', (e) => {
    if (e.target.id === 'more') { state.shown += PAGE; render(); return; }
    const b = e.target.closest('.save'); if (!b) return;
    const id = b.dataset.id;
    if (saved.has(id)) { saved.delete(id); delete savedItems[id]; }
    else { saved.add(id); const it = state.items.find((i) => i.id === id); if (it) savedItems[id] = it; }
    store.set('jad-saved', [...saved]); store.set('jad-saved-items', savedItems);
    render();
  });
  let t;
  $('#q').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { state.q = e.target.value.trim(); state.shown = PAGE; render(); }, 150); });
  $('#views').addEventListener('click', (e) => {
    const b = e.target.closest('.chip'); if (!b) return;
    state.view = b.dataset.view; state.shown = PAGE;
    document.querySelectorAll('#views .chip').forEach((c) => c.classList.toggle('on', c === b));
    render();
  });

  async function load() {
    try {
      const res = await fetch('data/news.json', { cache: 'no-cache' });
      const data = await res.json();
      state.items = data.items || [];
      const up = data.updated ? new Date(data.updated) : null;
      $('#updated').textContent = up ? `Actualizado: ${up.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}, ${fmtTime(up)} · ${state.items.length} noticias` : 'Aún sin datos';
      const groups = [...new Set(state.items.map((i) => i.group))];
      const topics = [...new Set(state.items.flatMap((i) => i.topics || []))].sort();
      chips($('#groups'), groups, 'group');
      chips($('#topics'), topics, 'topic');
      $('#status').innerHTML = (data.sources || []).map((s) => `<li class="${s.ok ? 'ok' : 'err'}">${esc(s.name)}: ${s.ok ? `${s.count} noticias` : `sin respuesta (${esc(s.error || '')})`}</li>`).join('');
    } catch {
      $('#updated').textContent = 'Sin conexión: mostrando lo guardado';
    }
    render();
  }
  load();

  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
})();
