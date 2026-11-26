# Justicia al día

App personal (web instalable en el móvil) con noticias judiciales, sentencias y novedades jurídicas que **se actualiza sola 3 veces al día**.

## Cómo funciona

- `scripts/sources.json`: lista de fuentes (BOE, Poder Judicial, prensa jurídica y búsquedas de prensa). Para añadir o quitar una fuente, edita este archivo.
- `scripts/fetch-news.mjs`: lee las fuentes y guarda las noticias en `data/news.json` (guarda los últimos 60 días).
- `.github/workflows/actualizar-noticias.yml`: GitHub Actions ejecuta el recopilador a las 7:00, 14:00 y 20:00 (hora de Canarias en invierno) y guarda los cambios. También se puede lanzar a mano desde la pestaña **Actions → Actualizar noticias → Run workflow**.
- Netlify publica la web cada vez que cambia el repositorio, así que las noticias nuevas aparecen solas.

## Funciones de la app

- Buscador (sin importar tildes).
- Filtros por tipo de fuente y por tema (penal, laboral, civil, mercantil, administrativo, fiscal, constitucional, europeo).
- Guardar noticias en colecciones (se quedan en tu dispositivo).
- Notas personales en cada noticia o sentencia guardada (botón del lápiz).
- Exportar una colección, con tus notas, a PDF (“Guardar como PDF” al imprimir) o a Word (.doc).
- La copia de seguridad (“Exportar copia”) incluye colecciones y notas.
- Funciona sin conexión con lo último descargado y se puede instalar como app.
- Al final de la página, "Estado de las fuentes" indica qué fuentes respondieron en la última actualización.

## Publicar en Netlify

1. Entra en https://app.netlify.com y pulsa **Add new site → Import an existing project**.
2. Elige **GitHub** y el repositorio `justicia-al-dia`.
3. Deja el comando de build vacío y como carpeta de publicación `.` (ya viene en `netlify.toml`).
4. Pulsa **Deploy**. Desde el móvil, abre la web y elige "Añadir a pantalla de inicio".

## Probar en local

```
node scripts/fetch-news.mjs
npx serve .
```
