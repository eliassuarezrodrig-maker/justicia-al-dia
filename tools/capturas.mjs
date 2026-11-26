// Genera capturas de los 3 estilos (solo para elegir diseño).
import { chromium, devices } from 'playwright';
import { mkdir, readFile } from 'node:fs/promises';
const base = process.env.BASE || 'http://localhost:8080';
const data = JSON.parse(await readFile('data/news.json', 'utf8'));
const sample = data.items.filter((i) => i.image).slice(3, 9);
const cols = [
  { id: 'leer', name: 'Leer más tarde', items: Object.fromEntries(sample.slice(0, 3).map((i, k) => [i.id, { ...i, savedAt: k }])), created: 1 },
  { id: 'tfg', name: 'TFG · Derecho laboral', items: Object.fromEntries(sample.slice(3, 6).map((i, k) => [i.id, { ...i, savedAt: k }])), created: 2 },
];
await mkdir('capturas', { recursive: true });
const b = await chromium.launch();
for (const th of ['periodico', 'app', 'lector']) {
  for (const [dev, opts] of [['movil', { ...devices['iPhone 13'] }], ['ordenador', { viewport: { width: 1366, height: 900 }, deviceScaleFactor: 1 }]]) {
    const c = await b.newContext(opts);
    await c.addInitScript((v) => localStorage.setItem('jad-colecciones', v), JSON.stringify(cols));
    const p = await c.newPage();
    for (const [page, hash] of [['portada', '#portada'], ['canarias', '#canarias'], ['colecciones', '#colecciones']]) {
      await p.goto(`${base}/?tema=${th}${hash}`);
      await p.waitForTimeout(3500);
      await p.screenshot({ path: `capturas/${th}-${dev}-${page}.png`, fullPage: dev === 'movil' ? false : false });
    }
    await c.close();
  }
}
await b.close();
