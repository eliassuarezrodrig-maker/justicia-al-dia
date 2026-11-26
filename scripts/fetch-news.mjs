// Recopila noticias de las fuentes RSS/Atom de scripts/sources.json
// y las guarda en data/news.json. Sin dependencias: Node 20+.
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const ROOT = new URL('../', import.meta.url);
const SOURCES = JSON.parse(await readFile(process.env.SOURCES_FILE || new URL('scripts/sources.json', ROOT), 'utf8'));
const OUT = new URL('data/news.json', ROOT);
const KEEP_DAYS = 60;
const MAX_ITEMS = 2000;

const TOPICS = {
  'Penal': /\b(penal|delito|prisi[oó]n|fiscal[ií]a|asesinato|homicidio|abuso|agresi[oó]n|estafa|blanqueo|corrupci[oó]n|juicio oral|absuel)/i,
  'Laboral': /\b(laboral|despido|trabajador|convenio|salario|seguridad social|pensi[oó]n|ERE|ERTE|huelga|sindicat)/i,
  'Civil y familia': /\b(civil|divorcio|custodia|herencia|hipoteca|alquiler|arrendamiento|desahucio|consumidor|cl[aá]usula|contrato)/i,
  'Mercantil': /\b(mercantil|concurso de acreedores|sociedad|empresa|accionista|competencia|CNMC|insolvencia)/i,
  'Administrativo': /\b(administrativ|contencioso|ayuntamiento|urbanismo|licencia|funcionari|oposici[oó]n|subvenci[oó]n|contrataci[oó]n p[uú]blica)/i,
  'Fiscal': /\b(tributari|hacienda|impuesto|IRPF|IVA|fiscalidad|AEAT|TEAC)/i,
  'Constitucional': /\b(constitucional|amparo|recurso de inconstitucionalidad|derechos fundamentales)/i,
  'Europeo': /\b(TJUE|Tribunal de Justicia de la (UE|Uni[oó]n)|TEDH|Estrasburgo|Luxemburgo|europe[oa])/i,
};

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
const atomLink = (block) => {
  const m = block.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i) || block.match(/<link[^>]*href=["']([^"']+)["']/i);
  return m ? decode(m[1]) : '';
};

function parseFeed(xml, source) {
  const items = [];
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  for (const b of blocks) {
    let title = strip(tag(b, 'title'));
    let link = strip(tag(b, 'link')) || atomLink(b);
    const date = strip(tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date'));
    let summary = strip(tag(b, 'description') || tag(b, 'summary') || tag(b, 'content'));
    let origin = '';
    if (source.id.startsWith('gn-')) {
      // Google News: "Titular - Medio"
      origin = strip(tag(b, 'source'));
      if (origin && title.endsWith(' - ' + origin)) title = title.slice(0, -(origin.length + 3));
      summary = '';
    }
    if (!title || !link) continue;
    const d = new Date(date);
    const text = `${title} ${summary}`;
    items.push({
      id: link,
      title,
      link,
      summary: summary.length > 320 ? summary.slice(0, 317).trimEnd() + '…' : summary,
      date: isNaN(d) ? new Date().toISOString() : d.toISOString(),
      source: source.name,
      sourceId: source.id,
      group: source.group,
      origin,
      topics: Object.entries(TOPICS).filter(([, re]) => re.test(text)).map(([t]) => t),
    });
  }
  return items;
}

async function fetchSource(source) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch(source.url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JusticiaAlDia/1.0; lector RSS personal)', Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    let xml = buf.toString('utf8');
    const enc = xml.slice(0, 200).match(/encoding=["']([^"']+)["']/i)?.[1]?.toLowerCase();
    if (enc && enc !== 'utf-8' && enc !== 'utf8') xml = new TextDecoder(enc).decode(buf);
    const items = parseFeed(xml, source);
    if (!items.length) throw new Error('el feed no tiene noticias legibles');
    return { items, status: { id: source.id, name: source.name, ok: true, count: items.length } };
  } catch (e) {
    return { items: [], status: { id: source.id, name: source.name, ok: false, error: e.name === 'AbortError' ? 'tiempo agotado' : e.message } };
  } finally {
    clearTimeout(timer);
  }
}

let previous = { items: [] };
try { previous = JSON.parse(await readFile(OUT, 'utf8')); } catch {}

// Las búsquedas de Google News van de una en una para evitar el bloqueo por exceso de peticiones (HTTP 429).
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const direct = Promise.all(SOURCES.filter((s) => !s.id.startsWith('gn-')).map(fetchSource));
const news = [];
for (const s of SOURCES.filter((s) => s.id.startsWith('gn-'))) {
  let r = await fetchSource(s);
  if (!r.status.ok && /429/.test(r.status.error)) { await sleep(8000); r = await fetchSource(s); }
  news.push(r);
  await sleep(2500);
}
const results = [...(await direct), ...news];
const byId = new Map(previous.items.map((i) => [i.id, i]));
let added = 0;
for (const { items } of results) {
  for (const it of items) {
    if (!byId.has(it.id)) { byId.set(it.id, it); added++; }
  }
}
const cutoff = Date.now() - KEEP_DAYS * 864e5;
const all = [...byId.values()]
  .filter((i) => new Date(i.date).getTime() >= cutoff)
  .sort((a, b) => new Date(b.date) - new Date(a.date))
  .slice(0, MAX_ITEMS);

const statuses = results.map((r) => r.status);
await mkdir(new URL('data/', ROOT), { recursive: true });
await writeFile(OUT, JSON.stringify({ updated: new Date().toISOString(), sources: statuses, items: all }, null, 1));

for (const s of statuses) console.log(`${s.ok ? 'OK ' : 'ERR'} ${s.name}: ${s.ok ? s.count + ' noticias' : s.error}`);
console.log(`Nuevas: ${added} · Total guardadas: ${all.length}`);
