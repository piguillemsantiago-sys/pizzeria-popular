# HANDOFF — Pizzería Popular

## OBJETIVO PRINCIPAL
Sitio web institucional de Pizzería Popular (cadena argentina de pizza al horno de leña en España, 6 locales). HTML/CSS/JS vanilla, deploy en Railway vía `git push`. Esta sesión fue 100% **refinamiento de la versión mobile (≤768px)** sin tocar desktop.

## ESTADO ACTUAL
- Repo: `github.com/piguillemsantiago-sys/pizzeria-popular`, branch `main`.
- Working tree limpio, todo pusheado. Último commit: `09f9990`.
- Deploy: Railway, automático al pushear a `main`.
- 24 páginas HTML en `public/` (12 ES en `public/pages/` + `public/pages/blog/`, 8 EN en `public/en/`, etc.). CSS único compartido `public/css/style.css`, JS único `public/js/main.js`.

## DECISIONES TÉCNICAS BLOQUEADAS
- **Todos los cambios de esta sesión son mobile-only** (`@media (max-width: 768px)`). Desktop NO se toca jamás.
- CSS y JS son **archivos compartidos** por las 24 páginas → un cambio ahí aplica a todo el sitio. Se prefiere editar `style.css`/`main.js` antes que tocar 24 HTML.
- La **pizza flotante** y el **menú hamburguesa**: HTML inyectado / lógica centralizada en `main.js` (no se duplica markup en 24 archivos).
- Subpáginas (`nosotros`, `carta`, etc.) usan `.page-header`; sólo `index.html` y `en/home.html` usan `.hero`.
- `/nosotros/` y `/en/about-us/`: la sección Historia se unifica con el home vía toggles CSS (`display:contents`/`@media`) — el desktop de esas páginas queda pixel-idéntico.
- Wrappers `.hero-top`/`.hero-bottom`: `display:contents` en desktop (transparentes), flex en mobile.

## ARCHIVOS CLAVE MODIFICADOS (esta sesión)
- `public/css/style.css` — núcleo de casi todos los cambios: menú hamburguesa (animaciones, patrón de fondo), hero mobile (layout space-between, 3 botones, spacing), timeline carrusel, eyebrows estandarizados, pizza flotante, modal delivery.
- `public/js/main.js` — menú hamburguesa (open/close + scroll lock + backdrop), pizza flotante (inyección + rotación al scroll), fade del swipe indicator.
- `public/pages/index.html` + `public/en/home.html` — hero reestructurado (`.hero-top`/`.hero-bottom`), grilla `.hero-actions-mobile` (Reservar/Carta/Delivery), modal `#deliveryModal`, video hero con carga inmediata.
- `public/pages/nosotros.html` + `public/en/about-us.html` — sección Historia unificada con el home (eyebrow+H2 agregados, scopeados).
- Las 24 páginas — menú hamburguesa estandarizado (commit `896d3d0`): orden de items, links corregidos, tags rotos `<\a>` arreglados.
- `public/images/bg-menu-pattern.svg` — patrón de marca (P + doodles) para el fondo del menú hamburguesa.

## BUGS PENDIENTES
- Ninguno conocido / abierto al cierre de esta sesión.

## PRÓXIMO PASO CONCRETO
No hay tarea pendiente definida. Esperar nuevo briefing del usuario. Si el usuario reporta algo, lo más probable es que sea un ajuste fino más de mobile — seguir el patrón: cambio scopeado a `@media (max-width: 768px)`, commit, push.

## COSAS ABIERTAS / RIESGOS
- **`hero-video-mobile.mp4`**: el código (`index.html`/`en/home.html`) apunta a `/images/hero-video-mobile.mp4` para el hero en mobile. Verificar que el archivo exista en el repo; si no, en mobile se ve solo el fondo oscuro `#1a0f0d` mientras "carga".
- **`display:contents`** se usa en el carrusel del timeline (`.tl-top/.tl-bot/.tl-card`) y en `.hero-top/.hero-bottom`. Soporte OK en navegadores modernos; en iPhones muy viejos podría fallar el reordenamiento.
- El `.float-cta` (CTA flotante "Reservar") quedó **oculto en mobile** (`display:none`) a pedido del usuario, para no duplicar con la pizza flotante. En mobile el acceso a "Reservar" queda sólo en el hero (grilla de 3 botones) y el nav.
- Hero mobile: con `padding-top: 88px` + layout `space-between`, en teléfonos muy chicos (<600px alto) el contenido podría quedar algo apretado. No reportado como bug.
- Las pizzas SVG por sabor/sección se intentaron y se revirtieron (no funcionó visualmente). NO reintentar SVGs generados por código sin diseño gráfico real.

## NO HACER
- NO tocar el desktop (>768px) bajo ninguna circunstancia.
- NO preguntar sobre dark mode, tests, logging, rate limiting, CI/CD, Docker, TypeScript.
- NO usar `railway up` — deploy es sólo `git push`.
- NO reintroducir las pizzas SVG por sección (revertido a propósito).
- NO duplicar markup en las 24 páginas si se puede resolver en `style.css`/`main.js`.
- NO editar otros archivos al cerrar sesión salvo `handoff.md`.

## INSTRUCCIONES PARA EL PRÓXIMO CHAT
Leé este handoff + CLAUDE.md (global `~/.claude/CLAUDE.md` + el del proyecto si existe) + los archivos clave listados arriba (`style.css`, `main.js`, `index.html`). Continuá desde "Próximo paso concreto" sin preguntas innecesarias. Recordá: todo cambio de esta línea de trabajo es mobile-only (`@media (max-width: 768px)`), commit claro y `git push` para deployar.
