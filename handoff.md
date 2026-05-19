# HANDOFF — Pizzería Popular

## OBJETIVO PRINCIPAL
Sitio web institucional de Pizzería Popular (cadena argentina de pizza al horno de leña en España, 6 locales). HTML/CSS/JS vanilla, deploy en Railway vía `git push`. La sesión actual hizo el rediseño editorial completo del blog post de Benidorm y dejó **planeado** (sin código aún) un panel de administración con IA para gestionar contenido.

## ESTADO ACTUAL
- Repo: `github.com/piguillemsantiago-sys/pizzeria-popular`, branch `main`.
- Working tree limpio, todo pusheado. Último commit: `93a13ce`.
- Deploy: Railway, automático al pushear a `main`.
- Páginas HTML en `public/` (ES en `public/pages/` + `public/pages/blog/`, EN en `public/en/`, etc.). CSS único compartido `public/css/style.css`, JS único `public/js/main.js` + nuevo `public/js/blog-post.js`.
- Endpoints backend de contacto: `/api/contacto` y `/api/franquicia`.
- `.env` local: ya tiene cargadas las 4 claves del futuro panel (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`). `.env` está en `.gitignore` y NO trackeado. Las 4 claves fueron verificadas: Supabase conecta OK, Anthropic key válida.

## URLS DEL PROYECTO
**Importante: NO confundir estas URLs.**

- **Producción Railway (ESTE proyecto)** → `https://pizzeria-popular-production.up.railway.app`
  Es la URL para **testing, deploy y verificación de cambios**. Se actualiza automáticamente al pushear a `main`.
- **Dominio público final** → `www.pizzeriapopular.es`
  Todavía **NO apunta**: el CNAME en Namecheap está pendiente de la autorización del dueño (Argentina).
- **Habit-tracker** → `https://habit-tracker-production-b9ab.up.railway.app`
  Es **OTRO proyecto separado** (sistema interno de gestión AJAX donde están alojados los menús digitales de los locales). NO usar para verificar cambios de este sitio. Aparece en los HTML como destino de los links "Carta" por local.

## CAMBIOS RECIENTES (sesión 2026-05-19)

### Blog — teaser del home arreglado (commit `247bde5`)
- La sección "Blog & Novedades" del home (`index.html` y `en/home.html`) tenía su propio script que solo traía posts de WordPress y NUNCA mostraba el post local de Benidorm. Ahora antepone el post local de Benidorm y filtra por idioma (espeja la lógica de `/blog/`).

### Blog post Benidorm — rediseño editorial completo (commit `078984d`)
- Nuevo sistema de plantilla **`.article-*`** en `style.css` (independiente del viejo `.bm-*`). Reutilizable para todos los posts nuevos.
- Hero full-bleed con parallax, barra de progreso de lectura, índice flotante con scrollspy, drop cap, pull quotes, bloques photo-essay full-bleed, galería masonry con lightbox, tiempo de lectura calculado, botones de compartir.
- Lógica en **`public/js/blog-post.js`** (vanilla, sin dependencias).
- 7 fotos reales del local en `public/images/blog/benidorm/`, optimizadas con `sharp` (~25 MB → ~1,9 MB).
- Posts ES y EN reescritos. Las cards del blog (home + `/blog/`) usan la foto nueva.

### Blog post Benidorm — ajustes posteriores
- `c45791f`: arreglado el link de Google Maps (apuntaba a `maps.app.goo.gl/` vacío → ahora `google.com/maps/search/?api=1&query=...`).
- `5ee8cdd`: agregada imagen del Balcón del Mediterráneo (generada con IA con Grok) en la sección de ubicación.
- `1fb64f0` + `93a13ce`: iteración del hero. Estado final: **hero = imagen IA del Balcón** (`benidorm-balcon.jpg`); la foto de la pareja al atardecer quedó en la sección de ubicación; la de las señoras quedó en la galería.

## DECISIONES TÉCNICAS BLOQUEADAS
- CSS y JS son **archivos compartidos** por todas las páginas → un cambio ahí aplica a todo el sitio. Se prefiere editar `style.css`/`main.js` antes que tocar los HTML uno por uno.
- La **pizza flotante** y el **menú hamburguesa**: HTML inyectado / lógica centralizada en `main.js` (no se duplica markup).
- Subpáginas (`nosotros`, `carta`, etc.) usan `.page-header`; sólo `index.html` y `en/home.html` usan `.hero`.
- Mail de contacto oficial único: `pizzeriapopular@grupoajax.es`.
- Color de marca para destacados/dorado: `#F5C66B`.
- **Posts de blog nuevos** usan la plantilla `.article-*` (CSS) + `blog-post.js`. Copiar la estructura de `public/pages/blog/llegamos-a-benidorm.html` (ES) y `public/en/blog/we-have-arrived-in-benidorm.html` (EN), y agregar la card local en blog.html / en/blog.html / index.html / en/home.html.
- `sharp` se usa para optimizar imágenes; instalado con `npm install sharp --no-save` (NO está en package.json a propósito).
- Fotos de cada post en `public/images/blog/<post>/`.

## PANEL DE ADMINISTRACIÓN — PLANEADO, SIN CÓDIGO AÚN
Objetivo: panel privado `/admin` donde el dueño escribe en lenguaje natural lo que quiere cambiar y una IA (Claude API) lo aplica. Piloto: **Promociones**. Después: Blog y Home.

Decisiones tomadas:
- **Arquitectura segura**: la IA NO edita código. Las promos viven como datos en Supabase; la IA solo ejecuta acciones acotadas (crear/editar/borrar/ordenar promo) con paso de confirmación previa. La página `/promos/` se renderiza desde la base.
- **Seguridad en capas**: login con Supabase Auth (email+password) + verificación del token en el servidor en cada `/api/admin/*` + RLS en las tablas nuevas + lista blanca de admins (porque el Auth de Supabase es compartido).
- **Supabase**: se reutiliza el proyecto existente **"AJAX Sistema de Gestión"** (ref `zaoaxkewnratzenklyth`). NO se crea proyecto nuevo.
- **Anthropic**: se reutiliza la API key de la agencia (ya en uso en el proyecto AJAX).
- **Tablas nuevas**: prefijo **`ppweb_`** (grupo "página web", separado de `pp_resenas_google` y del sistema AJAX). Planeadas: `ppweb_promos`, `ppweb_admins` (y a futuro `ppweb_posts`, `ppweb_home`). Verificado que no chocan con las 36 tablas existentes en `public`.
- **NO tocar `pp_resenas_google`** ni ninguna tabla del sistema AJAX.
- La introspección de la base mostró 36 tablas en `public` (sistema AJAX: audits, clients, menu_*, suppliers, stock, marketing, habits, etc. + `pp_resenas_google`).

## ARCHIVOS CLAVE
- `public/css/style.css` — incluye el bloque nuevo "ARTÍCULO DE BLOG — rediseño editorial 2026" (sistema `.article-*`).
- `public/js/main.js` — menú hamburguesa, pizza flotante, carousel testimonios, observer de `.reveal`.
- `public/js/blog-post.js` — NUEVO: progreso de lectura, parallax, scrollspy, lightbox, tiempo de lectura, compartir.
- `public/pages/blog/llegamos-a-benidorm.html` + `public/en/blog/we-have-arrived-in-benidorm.html` — post de Benidorm con la plantilla nueva.
- `public/images/blog/benidorm/` — 8 imágenes (7 fotos reales + `benidorm-balcon.jpg` IA).
- `public/pages/index.html` + `public/en/home.html` — teaser de blog arreglado.
- `index.js` — backend Express (rutas + `/api/contacto` + `/api/franquicia`). Acá irán las rutas `/admin` y `/api/admin/*` del panel.

## BUGS PENDIENTES
- Ninguno conocido / abierto al cierre de esta sesión.

## PRÓXIMO PASO CONCRETO
Arrancar a construir el **panel de administración (piloto: Promociones)**. Antes de escribir código falta UN dato del usuario: **el email del administrador** que entrará a `/admin`, y si ese usuario ya existe en el Auth de Supabase del proyecto AJAX o hay que crearlo. Con eso definido:
1. Instalar `@supabase/supabase-js` y el SDK de Anthropic (`@anthropic-ai/sdk`) — estos SÍ van a package.json (a diferencia de sharp).
2. Crear tablas `ppweb_promos` y `ppweb_admins` en Supabase con RLS.
3. Construir `/admin` (login Supabase Auth) + endpoints `/api/admin/*` con verificación de token server-side.
4. Integrar Claude API con tool use acotado (crear/editar/borrar/ordenar promo) + paso de confirmación.
5. Hacer que `/promos/` se renderice desde Supabase.
Nota: cuando se empiece a tocar la integración con Claude API, invocar el skill `claude-api`.

## COSAS ABIERTAS / RIESGOS
- **Proyecto Supabase compartido**: el `service_role` key le da al backend de pizzeria-popular acceso TOTAL a la base del sistema AJAX (CRM, OCR, etc.). El código debe tocar SOLO tablas `ppweb_*`. Riesgo a tener presente.
- **Auth de Supabase compartido**: cualquier usuario del sistema AJAX existe en el mismo Auth. El panel debe validar contra `ppweb_admins`, no solo "estar logueado".
- Faltan agregar las 4 variables (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`) en el Railway de **pizzeria-popular** (hoy solo están en el `.env` local). Hace falta antes del deploy del panel a producción.
- El hero del post de Benidorm es una **imagen generada con IA**. Si se consigue una foto real apaisada del Balcón/costa de Benidorm, reemplazarla.
- La foto `benidorm-pareja-atardecer.jpg` vino comprimida de WhatsApp (1200x1600); si aparece el original sin comprimir, reemplazar.
- Filtro de idioma del blog depende de los IDs de categoría de WordPress (EN = `54, 60, 37, 51, 14`).

## NO HACER
- NO preguntar sobre dark mode, tests, logging, rate limiting, CI/CD, Docker, TypeScript.
- NO usar `railway up` — deploy es sólo `git push`.
- NO crear un proyecto Supabase nuevo — se reutiliza "AJAX Sistema de Gestión".
- NO tocar `pp_resenas_google` ni tablas del sistema AJAX. Las tablas del panel van con prefijo `ppweb_`.
- NO hacer que la IA del panel edite código directamente — solo acciones acotadas sobre datos.
- NO duplicar markup en las páginas si se puede resolver en `style.css`/`main.js`.
- NO editar otros archivos al cerrar sesión salvo `handoff.md`.

## INSTRUCCIONES PARA EL PRÓXIMO CHAT
Leé este handoff + CLAUDE.md (global `~/.claude/CLAUDE.md` + el del proyecto si existe) + los archivos clave listados arriba. Continuá desde "Próximo paso concreto": pedile al usuario el email del administrador y arrancá a construir el panel. Commit claro y `git push origin main` para deployar.
