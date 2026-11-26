// Recopila noticias de las fuentes de scripts/sources.json y las guarda en data/news.json.
// Sin dependencias: Node 20+.
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const ROOT = new URL('../', import.meta.url);
const SOURCES = JSON.parse(await readFile(process.env.SOURCES_FILE || new URL('scripts/sources.json', ROOT), 'utf8'));
const OUT = new URL('data/news.json', ROOT);
const KEEP_DAYS = 60;
const MAX_ITEMS = 2500;
const MAX_OG_LOOKUPS = 150; // fotos buscadas en la página de la noticia por ejecución
const MAX_GN_RESOLVE = 250; // enlaces de Google News convertidos al del periódico por ejecución
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 JusticiaAlDia/1.0';

const TOPICS = {
  'Penal': /\b(penal|delito|prisi[oó]n|c[aá]rcel|fiscal[ií]a|asesinato|homicidio|abuso|agresi[oó]n|estafa|blanqueo|corrupci[oó]n|juicio oral|absuel|narcotr[aá]fico)/i,
  'Laboral': /\b(laboral|despido|trabajador|convenio|salario|seguridad social|pensi[oó]n|ERE|ERTE|huelga|sindicat|funcionari)/i,
  'Civil y familia': /\b(civil|divorcio|custodia|herencia|hipoteca|alquiler|arrendamiento|desahucio|consumidor|cl[aá]usula|contrato|okupa)/i,
  'Mercantil': /\b(mercantil|concurso de acreedores|sociedad an[oó]nima|accionista|competencia desleal|CNMC|insolvencia|despacho)/i,
  'Administrativo': /\b(administrativ|contencioso|ayuntamiento|urbanismo|licencia|oposici[oó]n|subvenci[oó]n|contrataci[oó]n p[uú]blica|decreto|orden ministerial)/i,
  'Fiscal y tributario': /\b(tributari|hacienda|impuesto|IRPF|IVA|fiscalidad|AEAT|TEAC)/i,
  'Constitucional': /\b(constitucional|amparo|inconstitucional|derechos fundamentales)/i,
  'Derechos humanos': /\b(derechos humanos|TEDH|Estrasburgo|Corte Penal Internacional|genocidio|crímenes de guerra|asilo|refugiad)/i,
  'Violencia de género': /\b(violencia de g[eé]nero|violencia machista|maltrato|orden de alejamiento)/i,
};

// Tipo de resolución y tribunal, para la sección "Sentencias y recursos".
const DOCS = [
  ['Sentencia', /\bsentencias?\b/i],
  ['Auto', /\b(un auto|el auto|mediante auto|en un auto|autos? del|auto de (procesamiento|apertura|prisi[oó]n)|cita a declarar|cita como (investigad|testigo)|prisi[oó]n provisional|libertad provisional|procesa a|suplicatorio|admite (a tr[aá]mite )?una querella)/i],
  ['Recurso', /\b(recursos?|casaci[oó]n|amparo|apelaci[oó]n|cuesti[oó]n de inconstitucionalidad|cuesti[oó]n prejudicial)\b/i],
  ['Sentencia', /\b(confirma|mantiene|declara|deniega|estima|archiva|ordena|reconoce|rechaza|impone|condena|condenad[oa]s?|absuelve|absuelt[oa]s?|avala|anula|tumba|revoca|dictamina|ratifica|desestima|ampara|da la raz[oó]n|fallo)\b/i],
  ['Resolución', /\b(resoluci[oó]n de la Direcci[oó]n General de Seguridad Jur[ií]dica|DGSJFP|doctrina del Tribunal Econ[oó]mico|dictamen)\b/i],
];
const COURTS = [
  ['Tribunal Supremo', /\b(Tribunal Supremo|el Supremo|TS\b|Sala (de lo )?(Penal|Civil|Social|Contencioso|Tercera|Segunda|Primera|Cuarta) del Supremo)/i],
  ['Tribunal Constitucional', /\b(Tribunal Constitucional|el Constitucional|TC\b|recurso de amparo|inconstitucionalidad)/i],
  ['Audiencia Nacional', /\bAudiencia Nacional\b/i],
  ['TSJ de Canarias', /\b(TSJ de Canarias|TSJC\b|Tribunal Superior de Justicia de Canarias)/i],
  ['Otros TSJ', /\b(TSJ|Tribunal Superior de Justicia)\b/i],
  ['Audiencias provinciales', /\bAudiencia Provincial\b/i],
  ['Juzgados', /\bjuzgados?\b|\bjueza?\b/i],
  ['TJUE', /\b(TJUE|Tribunal de Justicia de la (UE|Uni[oó]n Europea)|tribunal de Luxemburgo)/i],
  ['TEDH', /\b(TEDH|Tribunal Europeo de Derechos Humanos|Estrasburgo)/i],
  ['Cortes internacionales', /\b(Corte Penal Internacional|Corte Internacional de Justicia|CPI\b|Corte Interamericana)/i],
  ['DGSJFP', /\b(Direcci[oó]n General de Seguridad Jur[ií]dica|DGSJFP)\b/i],
];
function classify(i, source) {
  const text = `${i.title} ${i.summary || ''}`;
  const doc = DOCS.find(([, re]) => re.test(text))?.[0] || '';
  let court = COURTS.find(([, re]) => re.test(text))?.[0] || '';
  if (!court && source.court) court = source.court;
  const ecli = text.match(/ECLI:[A-Z]{2}:[A-Z]+:\d{4}:\d+[A-Z]?/i)?.[0]?.toUpperCase() || '';
  const recurso = text.match(/\b(?:recurso|rec\.|procedimiento|asunto)\s+(?:de\s+\S+\s+)?(?:n[ºo°.]*\s*)?(\d{1,6}\/\d{4}|C-\d+\/\d{2})/i)?.[1] || text.match(/\basunto\s+(C-\d+\/\d{2})/i)?.[1] || '';
  return { ecli, recurso, doc: source.ruling ? (doc || 'Resolución') : (doc && court ? doc : ''), court };
}

const decode = (s = '') => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
const strip = (s = '') => decode(decode(s)).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const tag = (block, name) => {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? m[1] : '';
};
const attr = (block, tagName, attrName) => {
  const m = block.match(new RegExp(`<${tagName}\\b[^>]*\\b${attrName}=["']([^"']+)["']`, 'i'));
  return m ? decode(m[1]) : '';
};
const atomLink = (block) => {
  const m = block.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i) || block.match(/<link[^>]*href=["']([^"']+)["']/i);
  return m ? decode(m[1]) : '';
};
const normTitle = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const domain = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const goodImg = (u) => u && /^https?:\/\//.test(u) && !/(feedburner|pixel|gravatar|emoji|\.gif($|\?)|1x1|spacer|logo)/i.test(u);

function findImage(block) {
  const candidates = [
    attr(block, 'media:content', 'url'),
    attr(block, 'media:thumbnail', 'url'),
    /<enclosure[^>]*type=["']image/i.test(block) ? attr(block, 'enclosure', 'url') : '',
  ];
  const html = decode(tag(block, 'content:encoded') + ' ' + tag(block, 'description') + ' ' + tag(block, 'content'));
  const img = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (img) candidates.push(decode(img[1]));
  return candidates.find(goodImg) || '';
}

function parseFeed(xml, source) {
  const items = [];
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  const isGN = source.url.includes('news.google.');
  for (const b of blocks) {
    let title = strip(tag(b, 'title'));
    const link = strip(tag(b, 'link')) || atomLink(b);
    const date = strip(tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date'));
    let summary = strip(tag(b, 'description') || tag(b, 'summary') || tag(b, 'content'));
    let origin = source.outlet || source.name;
    let originUrl = source.home || `https://${domain(link)}`;
    if (isGN) {
      // Google News: "Titular - Medio"
      const o = strip(tag(b, 'source'));
      if (o) { origin = o; if (title.endsWith(' - ' + o)) title = title.slice(0, -(o.length + 3)); }
      originUrl = attr(b, 'source', 'url') || originUrl;
      summary = '';
    }
    if (!title || !link) continue;
    if (source.include && !new RegExp(source.include, 'i').test(title)) continue;
    const d = new Date(date);
    const text = `${title} ${summary}`;
    items.push({
      id: link,
      title,
      link,
      summary: summary.length > 320 ? summary.slice(0, 317).trimEnd() + '…' : summary,
      image: isGN ? '' : findImage(b),
      date: isNaN(d) || d > Date.now() + 864e5 ? new Date().toISOString() : d.toISOString(),
      origin,
      originUrl,
      sourceId: source.id,
      topics: Object.entries(TOPICS).filter(([, re]) => re.test(text)).map(([t]) => t),
    });
  }
  return items;
}

async function get(url, ms, accept, simple = false) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: 'follow', headers: simple ? { 'User-Agent': 'JusticiaAlDia/1.0 (lector RSS personal)', Accept: '*/*' } : { 'User-Agent': UA, Accept: accept, 'Accept-Language': 'es-ES,es;q=0.9' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    let text = buf.toString('utf8');
    const enc = (text.slice(0, 300).match(/encoding=["']([^"']+)["']/i) || text.slice(0, 2000).match(/charset=["']?([\w-]+)/i))?.[1]?.toLowerCase();
    if (enc && !/utf-?8/.test(enc)) { try { text = new TextDecoder(enc).decode(buf); } catch {} }
    return text;
  } finally { clearTimeout(timer); }
}

// Páginas oficiales sin RSS: se leen los enlaces de la página de noticias.
function parseHtmlList(html, source, pageUrl) {
  const re = new RegExp(source.linkPattern, 'i');
  const items = []; const seen = new Set();
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let link; try { link = new URL(decode(m[1]), pageUrl).href; } catch { continue; }
    if (!re.test(link) || seen.has(link)) continue;
    const title = strip(m[2]);
    if (title.length < (source.minTitle || 30)) continue;
    seen.add(link);
    // Fecha en el texto cercano (dd/mm/aaaa) si existe.
    const around = html.slice(Math.max(0, m.index - 400), m.index + m[0].length + 400);
    const dm = around.match(/(\d{1,2})[\/.-](\d{1,2})[\/.-](20\d{2})/);
    const date = dm ? new Date(Date.UTC(+dm[3], +dm[2] - 1, +dm[1], 12)).toISOString() : '';
    items.push({
      id: link, title, link, summary: '', image: '', date: date || new Date().toISOString(),
      origin: source.outlet || source.name, originUrl: source.home || pageUrl, sourceId: source.id,
      topics: Object.entries(TOPICS).filter(([, r]) => r.test(title)).map(([k]) => k),
    });
    if (items.length >= (source.max || 20)) break;
  }
  return items;
}

async function fetchSource(source) {
  const urls = source.urls || [source.url];
  let lastErr = '';
  for (const url of urls) {
    try {
      let xml;
      try { xml = await get(url, 25000, 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*'); }
      catch (e) { if (/HTTP (403|406|415)/.test(e.message)) xml = await get(url, 25000, '*/*', true); else throw e; }
      const items = source.type === 'html' ? parseHtmlList(xml, source, url) : parseFeed(xml, { ...source, url });
      if (!items.length) throw new Error('sin noticias legibles');
      return { items, status: { id: source.id, name: source.name, ok: true, count: items.length, url } };
    } catch (e) {
      lastErr = e.name === 'AbortError' ? 'tiempo agotado' : e.message;
    }
  }
  return { items: [], status: { id: source.id, name: source.name, ok: false, error: lastErr } };
}

async function ogImage(url) {
  try {
    const html = (await get(url, 9000, 'text/html')).slice(0, 200000);
    const m = html.match(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)(?::src)?["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:image|twitter:image)["']/i);
    const img = m ? new URL(decode(m[1]), url).href : '';
    return goodImg(img) ? img : '';
  } catch { return ''; }
}

// Google News da un enlace intermedio; esto obtiene el enlace real del periódico.
async function resolveGN(link) {
  try {
    const id = new URL(link).pathname.split('/').pop();
    const html = await get(`https://news.google.com/articles/${id}?hl=es&gl=ES&ceid=ES:es`, 10000, 'text/html');
    const sg = html.match(/data-n-a-sg="([^"]+)"/)?.[1];
    const ts = html.match(/data-n-a-ts="([^"]+)"/)?.[1];
    if (!sg || !ts) return '';
    const inner = `["garturlreq",[["X","X",["X","X"],null,null,1,1,"ES:es",null,1,null,null,null,null,null,0,1],"X","X",1,[1,1,1],1,1,null,0,0,null,0],"${id}",${ts},"${sg}"]`;
    const body = 'f.req=' + encodeURIComponent(JSON.stringify([[['Fbv4je', inner]]]));
    const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 10000);
    try {
      const res = await fetch('https://news.google.com/_/DotsSplashUi/data/batchexecute', {
        method: 'POST', signal: ctrl.signal, body,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', 'User-Agent': UA },
      });
      if (!res.ok) return '';
      const text = await res.text();
      const chunk = JSON.parse(text.split('\n\n')[1]);
      const url = JSON.parse(chunk[0][2])[1];
      return /^https?:\/\//.test(url) ? url : '';
    } finally { clearTimeout(timer); }
  } catch { return ''; }
}

// --- Ejecución ---
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const bySource = new Map(SOURCES.map((s) => [s.id, s]));
let previous = { items: [] };
try { previous = JSON.parse(await readFile(OUT, 'utf8')); } catch {}

// Las búsquedas de Google News van de una en una para evitar el bloqueo por exceso de peticiones (HTTP 429).
const isGN = (s) => (s.url || s.urls?.[0] || '').includes('news.google.');
const direct = Promise.all(SOURCES.filter((s) => !isGN(s)).map(fetchSource));
const gn = [];
for (const s of SOURCES.filter(isGN)) {
  let r = await fetchSource(s);
  if (!r.status.ok && /429/.test(r.status.error)) { await sleep(process.env.FAST ? 0 : 10000); r = await fetchSource(s); }
  gn.push(r);
  await sleep(process.env.FAST ? 0 : 2500);
}
const results = [...(await direct), ...gn];

// Unir con lo anterior, sin duplicados (mismo enlace o mismo titular).
const byId = new Map();
const titles = new Set();
const add = (it) => {
  const t = normTitle(it.title);
  if (byId.has(it.id) || titles.has(t)) return false;
  byId.set(it.id, it); titles.add(t); return true;
};
for (const it of previous.items || []) if (bySource.has(it.sourceId)) add(it);
let added = 0;
for (const { items } of results) for (const it of items) if (add(it)) added++;

// Completar datos de la fuente (sección, tipo) y buscar fotos que falten.
const cutoff = Date.now() - KEEP_DAYS * 864e5;
const all = [...byId.values()]
  .filter((i) => new Date(i.date).getTime() >= cutoff)
  .sort((a, b) => new Date(b.date) - new Date(a.date))
  .slice(0, MAX_ITEMS)
  .map((i) => { const s = bySource.get(i.sourceId); return { ...i, source: s.name, scope: s.scope, kind: s.kind, ...classify(i, s) }; });

const needUrl = all.filter((i) => i.link.includes('news.google.') && !i.url && !i.noUrl).slice(0, MAX_GN_RESOLVE);
let resolved = 0;
for (let k = 0; k < needUrl.length; k += 4) {
  await Promise.all(needUrl.slice(k, k + 4).map(async (i) => { i.url = await resolveGN(i.link); if (i.url) resolved++; else i.noUrl = true; }));
  await sleep(400);
}
console.log(`Enlaces de Google News resueltos: ${resolved}/${needUrl.length}`);

const needImg = all.filter((i) => !i.image && !i.noImage && (i.url || !i.link.includes('news.google.')) && !bySource.get(i.sourceId).noImages).slice(0, MAX_OG_LOOKUPS);
for (let k = 0; k < needImg.length; k += 10) {
  await Promise.all(needImg.slice(k, k + 10).map(async (i) => { i.image = await ogImage(i.url || i.link); if (!i.image) i.noImage = true; }));
}

const statuses = results.map((r) => r.status);
await mkdir(new URL('data/', ROOT), { recursive: true });
await writeFile(OUT, JSON.stringify({ updated: new Date().toISOString(), sources: statuses, items: all }));

// Archivo permanente de sentencias y recursos, un archivo por año.
const ARCH_DIR = new URL('data/sentencias/', ROOT);
await mkdir(ARCH_DIR, { recursive: true });
const KEEP = ['id', 'title', 'link', 'url', 'summary', 'image', 'date', 'origin', 'originUrl', 'source', 'scope', 'kind', 'doc', 'court', 'topics', 'ecli', 'recurso'];
const slim = (i) => Object.fromEntries(KEEP.filter((k) => i[k] !== undefined && i[k] !== '' && !(Array.isArray(i[k]) && !i[k].length)).map((k) => [k, i[k]]));
const byYear = new Map();
for (const i of all.filter((i) => i.doc && i.title !== 'Sumario')) {
  const y = i.date.slice(0, 4);
  if (!byYear.has(y)) byYear.set(y, []);
  byYear.get(y).push(i);
}
let archIndex = { years: {} };
try { archIndex = JSON.parse(await readFile(new URL('index.json', ARCH_DIR), 'utf8')); } catch {}
let archAdded = 0;
for (const [y, list] of byYear) {
  const file = new URL(`${y}.json`, ARCH_DIR);
  let arch = [];
  try { arch = JSON.parse(await readFile(file, 'utf8')); } catch {}
  const ids = new Map(arch.map((a, k) => [a.id, k]));
  const tset = new Set(arch.map((a) => normTitle(a.title)));
  for (const i of list) {
    if (ids.has(i.id)) { arch[ids.get(i.id)] = { ...arch[ids.get(i.id)], ...slim(i) }; continue; }
    const t = normTitle(i.title);
    if (tset.has(t)) continue;
    arch.push(slim(i)); tset.add(t); archAdded++;
  }
  arch.sort((a, b) => new Date(b.date) - new Date(a.date));
  await writeFile(file, JSON.stringify(arch));
  archIndex.years[y] = arch.length;
}
archIndex.updated = new Date().toISOString();
await writeFile(new URL('index.json', ARCH_DIR), JSON.stringify(archIndex));
console.log(`Archivo de sentencias: +${archAdded} · ${JSON.stringify(archIndex.years)}`);

for (const s of statuses) console.log(`${s.ok ? 'OK ' : 'ERR'} ${s.name}: ${s.ok ? `${s.count} noticias (${s.url})` : s.error}`);
console.log(`Nuevas: ${added} · Total: ${all.length} · Con foto: ${all.filter((i) => i.image).length} · Fotos buscadas: ${needImg.length}`);
