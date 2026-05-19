# HANDOFF — Pizzería Popular

## OBJETIVO PRINCIPAL
Sitio web institucional de Pizzería Popular (cadena argentina de pizza al horno de leña en España, 6 locales). HTML/CSS/JS vanilla, deploy en Railway vía `git push`. Las últimas sesiones combinaron refinamiento de la sección locales/testimonios del home, unificación del mail de contacto y publicación de blog posts (incluido el nuevo de Benidorm en ES/EN).

## ESTADO ACTUAL
- Repo: `github.com/piguillemsantiago-sys/pizzeria-popular`, branch `main`.
- Working tree limpio, todo pusheado. Último commit: `eaa35ef`.
- Deploy: Railway, automático al pushear a `main`.
- Páginas HTML en `public/` (ES en `public/pages/` + `public/pages/blog/`, EN en `public/en/`, etc.). CSS único compartido `public/css/style.css`, JS único `public/js/main.js`.
- Endpoints backend de contacto: `/api/contacto` y `/api/franquicia`.

## URLS DEL PROYECTO
**Importante: NO confundir estas URLs.**

- **Producción Railway (ESTE proyecto)** → `https://pizzeria-popular-production.up.railway.app`
  Es la URL para **testing, deploy y verificación de cambios**. Se actualiza automáticamente al pushear a `main`.
- **Dominio público final** → `www.pizzeriapopular.es`
  Todavía **NO apunta**: el CNAME en Namecheap está pendiente de la autorización del dueño (Argentina).
- **Habit-tracker** → `https://habit-tracker-production-b9ab.up.railway.app`
  Es **OTRO proyecto separado** (sistema interno de gestión AJAX donde están alojados los menús digitales de los locales). NO usar para verificar cambios de este sitio. Aparece en los HTML como destino de los links "Carta" por local.

## CAMBIOS RECIENTES (esta tanda de sesiones)

### Home — sección Locales
- Grilla **6x1 en desktop ≥1024px** (los 6 locales en una sola fila).
- Cards con **altura natural** (sin altura fija forzada).
- Bloque de rating **compacto**: `4.6 ★★★★☆ / X opiniones en Google` en una sola línea.
- Cards de "Valoración en Google" **clickeables**: cada una linkea al Google Maps del local correspondiente.

### Home — sección Testimonios
- Carousel con **9 reseñas**.
- Rotación **intercalada**: 3 slots con offsets escalonados, **3s por slot**.
- Slide **direccional**: horizontal en mobile, vertical en desktop.

### Home — Hero y headings
- Hero desktop con frase corta: **"Somos más que una pizzería, somos una familia"**.
- Espacios reducidos en los headings de las secciones **promociones, franquicias y contacto** del home.
- Frases destacadas en cards de promos: color **amarillo dorado `#F5C66B`** con chip `backdrop-blur`.

### Home — sección Valoración Google
- **Estrellas titilantes agresivas** en el fondo de la sección.
- Eyebrow **"ENCUÉNTRANOS"** como **pill dorado** con efecto *shine* animado al entrar al viewport.

### Pizza flotante
- Ahora aparece también en **desktop**, además de mobile.

### Mail de contacto unificado
- Todo el proyecto usa **`pizzeriapopular@grupoajax.es`**: web (textos visibles) + endpoints backend `/api/contacto` y `/api/franquicia`.

### Blog
- **Blog post nuevo de Benidorm** publicado en ES e EN:
  - ES: `/llegamos-a-benidorm/`
  - EN: `/en/we-have-arrived-in-benidorm/`
  - Usa el template del sitio (header/footer/tipografía/colores).
- **Filtro de idioma** en `/blog/` y `/en/blog/` por categorías de WordPress.
  - Categorías EN: `54, 60, 37, 51, 14`.

## DECISIONES TÉCNICAS BLOQUEADAS
- CSS y JS son **archivos compartidos** por todas las páginas → un cambio ahí aplica a todo el sitio. Se prefiere editar `style.css`/`main.js` antes que tocar los HTML uno por uno.
- La **pizza flotante** y el **menú hamburguesa**: HTML inyectado / lógica centralizada en `main.js` (no se duplica markup).
- Subpáginas (`nosotros`, `carta`, etc.) usan `.page-header`; sólo `index.html` y `en/home.html` usan `.hero`.
- `/nosotros/` y `/en/about-us/`: la sección Historia se unifica con el home vía toggles CSS (`display:contents`/`@media`).
- Mail de contacto oficial único: `pizzeriapopular@grupoajax.es`.
- Color de marca para destacados/dorado: `#F5C66B`.

## ARCHIVOS CLAVE
- `public/css/style.css` — núcleo de casi todos los cambios visuales: grilla de locales, rating compacto, carousel de testimonios, hero, headings, estrellas titilantes, eyebrow pill, pizza flotante.
- `public/js/main.js` — menú hamburguesa, pizza flotante (inyección + rotación + desktop), carousel de testimonios (rotación intercalada, slide direccional).
- `public/pages/index.html` + `public/en/home.html` — hero, secciones locales/promos/testimonios/contacto.
- `public/pages/blog/` + `public/en/blog/` — listados de blog con filtro de idioma.
- Posts de Benidorm: `/llegamos-a-benidorm/` y `/en/we-have-arrived-in-benidorm/`.
- Backend: rutas `/api/contacto` y `/api/franquicia`.

## BUGS PENDIENTES
- Ninguno conocido / abierto al cierre de esta sesión.

## PRÓXIMO PASO CONCRETO
No hay tarea pendiente definida. Esperar nuevo briefing del usuario. Migración del entorno de trabajo a **VSCode** en curso (este handoff sirve de base para esa migración).

## COSAS ABIERTAS / RIESGOS
- **`hero-video-mobile.mp4`**: el código apunta a `/images/hero-video-mobile.mp4` para el hero en mobile. Verificar que exista en el repo.
- **`display:contents`** se usa en varios reordenamientos responsive. Soporte OK en navegadores modernos; en iPhones muy viejos podría fallar.
- Las pizzas SVG por sabor/sección se intentaron y se revirtieron. NO reintentar SVGs generados por código sin diseño gráfico real.
- Filtro de idioma del blog depende de los IDs de categoría de WordPress (EN = `54, 60, 37, 51, 14`); si cambian en WP hay que actualizarlos.

## NO HACER
- NO preguntar sobre dark mode, tests, logging, rate limiting, CI/CD, Docker, TypeScript.
- NO usar `railway up` — deploy es sólo `git push`.
- NO reintroducir las pizzas SVG por sección (revertido a propósito).
- NO duplicar markup en las páginas si se puede resolver en `style.css`/`main.js`.
- NO editar otros archivos al cerrar sesión salvo `handoff.md`.

## INSTRUCCIONES PARA EL PRÓXIMO CHAT
Leé este handoff + CLAUDE.md (global `~/.claude/CLAUDE.md` + el del proyecto si existe) + los archivos clave listados arriba. Continuá desde "Próximo paso concreto" sin preguntas innecesarias. Commit claro y `git push origin main` para deployar.
