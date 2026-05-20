---
name: blog
description: Crea y publica un blog post nuevo en la web de Pizzería Popular con la plantilla editorial .article-*, optimizado para SEO, en ES e EN. Invocar con /blog <tema o briefing>.
---

# /blog — Publicar un blog post

Skill para crear y publicar un artículo nuevo en el blog de Pizzería Popular.
El diseño ya está resuelto (plantilla `.article-*`); esta skill garantiza que
cada post salga consistente, con buen SEO y sin saltear pasos.

## Contexto fijo del proyecto

- Posts ES: `public/pages/blog/<slug>.html`
- Posts EN: `public/en/blog/<slug>.html`
- Plantilla de referencia (COPIAR de acá): `public/pages/blog/llegamos-a-benidorm.html`
  y su par EN `public/en/blog/we-have-arrived-in-benidorm.html`.
- CSS: sistema `.article-*` en `public/css/style.css` (ya existe, no tocar salvo bug).
- JS: `public/js/blog-post.js` (ya existe). El post debe cargar `main.js` + `blog-post.js`.
- Imágenes del post: `public/images/blog/<slug>/`.
- Deploy: `bash deploy.sh` (sube al VPS, en vivo en ~2 s). Sin build.

## Pilares de contenido (elegir uno por post)

1. **SEO local** ⭐ — "dónde comer pizza en [ciudad]". El que más clientes trae.
2. **Aperturas y novedades** — locales nuevos, eventos.
3. **Producto y cocina** — masa, horno, milanesas, ingredientes.
4. **Marca y cultura argentina** — qué hace única la pizza argentina, el equipo.
5. **Estacional / turístico** — temporadas, guías para turistas.

## Tono de marca

Cálido, familiar, argentino. Cercano, no corporativo. Usa el "vos". Guiños como
"¡Hola mi vida! 🔥". Emocional pero concreto.

## Pasos

### 1. Definir el tema y el SEO
- Si el usuario no dio tema claro, tomar el próximo post pendiente de
  `blog-backlog.md` (raíz del repo), o proponer 2-3 opciones desde los pilares.
- Al publicar, marcar ese post como "publicado" en `blog-backlog.md`.
- Definir: **keyword objetivo**, **título** (incluye la keyword, atractivo),
  **slug** (kebab-case, corto, con la keyword), **meta description** (≤ 155
  caracteres, con la keyword).
- Si el tema necesita datos/novedades reales, investigar con búsqueda web.

### 2. Escribir el post ES
- Copiar la estructura completa de `public/pages/blog/llegamos-a-benidorm.html`.
- Mantener intactos: el `<head>` con TODOS los meta (description, robots, OG,
  Twitter, canonical, hreflang) y los DOS bloques JSON-LD (`BlogPosting` +
  `BreadcrumbList`). Actualizar todos los valores al post nuevo.
- Cuerpo: `<main class="article">` con hero, `.article-shell` (índice TOC +
  `.article-body`), drop cap en el primer párrafo (`class="lead"`), `<h2>` con
  `id` para el índice, pull quotes, figuras y galería según haya fotos.
- Cerrar con `.article-cta` y el footer estándar del sitio.
- Cargar al final: `main.js` y `blog-post.js`.

### 3. Escribir el post EN
- Traducir a `public/en/blog/<slug-en>.html`. Mismo diseño, `hreflang`
  cruzados correctos entre ES y EN.

### 4. Imágenes
- Guardar en `public/images/blog/<slug>/`.
- Optimizar con sharp (`npm install sharp --no-save` si no está): landscape
  ~2000px, portrait ~1400px, calidad 80, mozjpeg. Objetivo < 400 KB c/u.
- Si no hay fotos reales, pedirlas al usuario o generar con Grok (avisando que
  es IA).

### 5. Rutas en index.js
Agregar en la sección de rutas de blog:
```
app.get('/<slug>/', sendPage('pages/blog/<slug>.html'));
app.get('/en/<slug-en>/', sendPage('en/blog/<slug-en>.html'));
```

### 6. Listados, teasers y sitemap
Agregar la card local del post nuevo en los 4 lugares:
- `public/pages/blog.html` y `public/en/blog.html` (listado de blog).
- `public/pages/index.html` y `public/en/home.html` (teaser de blog del home).
Seguir el patrón de la card local existente (la de Benidorm). Si ya hay 3+
posts locales hardcodeados, refactorizar a un arreglo `localPosts` para no
duplicar.
Agregar también las URLs del post (ES y EN) a `public/sitemap.xml` con
`lastmod` de hoy, `changefreq` monthly y `priority` 0.6-0.7.

### 7. Verificar
- `node -c` sobre los archivos JS si se tocaron.
- Revisar: links internos, imágenes existen, hreflang ES↔EN cruzados, meta
  description única, slug sin acentos.

### 8. Publicar
- `git add` de los archivos nuevos/modificados.
- `git commit` con mensaje claro.
- `git push origin main` (respaldo en GitHub).
- `bash deploy.sh` (deja el post en vivo en el VPS).
- Confirmar al usuario la URL del post ES y EN.

## Reglas

- NO tocar `style.css`/`blog-post.js` salvo que haya un bug real.
- NO duplicar el header/footer: copiarlos tal cual de un post existente.
- Slug siempre en kebab-case, sin acentos ni eñes.
- Cada post = un pilar de contenido + una keyword objetivo. Sin relleno.
- Cadencia objetivo del blog: uno cada 15 días.
