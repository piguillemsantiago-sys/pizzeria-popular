# HANDOFF — Pizzería Popular

## OBJETIVO PRINCIPAL
Sitio web institucional de Pizzería Popular (cadena argentina de pizza al horno de leña en España, 6 locales). HTML/CSS/JS vanilla + Node/Express. En esta sesión el proyecto se **migró de Railway a un VPS propio (DigitalOcean)** y se construyó un **panel de administración** (`/admin`) para gestionar promociones desde una base Supabase.

## ESTADO ACTUAL
- Repo: `github.com/piguillemsantiago-sys/pizzeria-popular`, branch `main`. Working tree limpio.
- **Producción: VPS DigitalOcean.** Railway quedó OBSOLETO (se puede apagar).
- El sitio en vivo: `http://167.99.240.64` (sin dominio/HTTPS todavía).
- Páginas HTML en `public/`. CSS único `public/css/style.css`, JS `public/js/main.js` + `public/js/blog-post.js`.
- Panel admin operativo en `/admin/` (login Supabase Auth).
- `.env` (local y en el VPS) tiene: `PORT, NODE_ENV, GOOGLE_PLACES_API_KEY, SMTP_*, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY`. `.env` está gitignored.

## INFRAESTRUCTURA — VPS
- **Proveedor:** DigitalOcean. Droplet Basic $6/mes, Ubuntu 24.04 LTS.
- **IP pública:** `167.99.240.64`
- **Stack:** Node 22 + pm2 (app `pizzeria-popular`) + Nginx (reverse proxy :80→:3000) + certbot (instalado, HTTPS sin activar aún) + ufw + swap 1 GB.
- **Acceso SSH:** alias `pizzeria-vps` en `~/.ssh/config` (usuario `deploy`, clave `~/.ssh/pizzeria_vps`). Root SSH y password login DESHABILITADOS.
- **Proyecto en el VPS:** `/var/www/pizzeria-popular`.
- **Deploy:** `bash deploy.sh` desde la raíz del repo → sincroniza por SSH (tar) + `pm2 restart`. En vivo en ~2 s, sin build. `deploy.sh` excluye `node_modules`, `.git`, `.env`, `google-ratings.json`.
- **Flujo de trabajo:** editar local → `bash deploy.sh` (deja en vivo) → `git push` (respaldo/historial en GitHub; GitHub YA NO deploya nada).

## URLS DEL PROYECTO
- **Producción (VPS)** → `http://167.99.240.64` — para testing y verificación.
- **Dominio final** → `www.pizzeriapopular.es` — todavía NO apunta. Falta que el usuario cree los registros DNS tipo A (`@` y `www`) → `167.99.240.64`. Después se corre certbot para HTTPS.
- **Habit-tracker** → `https://habit-tracker-production-b9ab.up.railway.app` — OTRO proyecto (menús digitales). Aparece como destino de los links "Carta".

## PANEL DE ADMINISTRACIÓN — ESTADO
Panel privado en `/admin/` para gestionar contenido sin tocar código.
- **Operativo:** login (Supabase Auth, email+password) + ABM completo de promociones (crear/editar/borrar/mostrar-ocultar/reordenar).
- **Seguridad en capas:** login Supabase Auth + verificación del token server-side en cada `/api/admin/*` (middleware `requireAdmin`) + RLS en las tablas + lista blanca `ppweb_admins`.
- **Admin dado de alta:** `piguillemsantiago@gmail.com` (user_id `34323240-a10f-4ac9-8ceb-b7a40cf611ce`).
- **Supabase:** proyecto compartido "AJAX Sistema de Gestión" (ref `zaoaxkewnratzenklyth`). Tablas creadas: `ppweb_promos`, `ppweb_admins` (prefijo `ppweb_` = grupo "página web"). El SQL está en `supabase-schema.sql` (ya ejecutado).
- **`/promos/` (ES)** ya renderiza dinámicamente desde la base (`/api/promos`). **`/en/promos/` sigue estática** (no hay promos en inglés cargadas).
- **PENDIENTE:** el asistente de IA del panel (escribir en lenguaje natural → Claude API con tool use acotado). Todavía NO está. La `ANTHROPIC_API_KEY` ya está en el `.env`.

## DECISIONES TÉCNICAS BLOQUEADAS
- CSS y JS son archivos compartidos: editar `style.css`/`main.js` antes que tocar los HTML uno por uno.
- Posts de blog nuevos usan la plantilla `.article-*` (`style.css`) + `blog-post.js`. Copiar de `public/pages/blog/llegamos-a-benidorm.html`.
- **Existe la skill `/blog`** (`.claude/skills/blog/SKILL.md`) — procedimiento fijo para publicar un post (template, SEO, rutas, listados, deploy).
- `sharp` se usa para optimizar imágenes; instalado con `npm install sharp --no-save` (NO está en package.json a propósito).
- Supabase: reutilizar el proyecto "AJAX Sistema de Gestión". NO crear proyecto nuevo. Tablas del panel siempre con prefijo `ppweb_`.
- La IA del panel NO edita código: solo acciones acotadas sobre datos (tablas `ppweb_*`).
- Mail de contacto oficial: `pizzeriapopular@grupoajax.es`. Dorado de marca: `#F5C66B`.

## ARCHIVOS CLAVE
- `index.js` — backend Express: rutas del sitio + `/api/contacto` + `/api/franquicia` + rutas del panel `/admin` + API `/api/admin/*` + `/api/promos`.
- `lib/supabase.js` — clientes Supabase + `requireAdmin`.
- `public/admin/` — panel: `login.html`, `index.html`, `admin.css`, `admin.js`.
- `supabase-schema.sql` — schema de las tablas del panel (ya ejecutado en Supabase).
- `deploy.sh` — despliegue al VPS.
- `public/css/style.css` — incluye `.article-*` (blog) y `.footer-vocai` (crédito).
- `public/js/main.js` — incluye la inyección del crédito "Desarrollado por VOCAI" en el footer.
- `public/js/blog-post.js` — interacciones del blog post.
- `.claude/skills/blog/SKILL.md` — skill `/blog`.

## CAMBIOS DE ESTA SESIÓN (2026-05-20)
- Migración completa a VPS DigitalOcean (infra, seguridad, deploy.sh).
- Panel admin construido: `lib/supabase.js`, rutas en `index.js`, `public/admin/*`, `supabase-schema.sql`.
- Tablas Supabase creadas y verificadas (4 promos de carga inicial).
- `/promos/` conectada a la base de datos (render dinámico, modal por delegación de eventos).
- Footer "Desarrollado por VOCAI" en las 26 páginas: link a `vocai.es`, icono Instagram `@vocai.st`, gradiente azul→rosa de marca, peso 800.
- Skill `/blog` creada.
- Bugs resueltos: modal del panel no se cerraba (`display:flex` pisaba `[hidden]`); `deploy.sh` pisaba `google-ratings.json`.

## BUGS PENDIENTES
- Ninguno conocido al cierre.

## PRÓXIMO PASO CONCRETO
El usuario va a pasar "algo interesante" (tema nuevo, fuera de la web). Para el sitio, las tareas abiertas en orden sugerido:
1. **Asistente de IA del panel** — Claude API con tool use acotado (crear/editar/borrar/ordenar promo) + paso de confirmación. Al tocar Claude API, invocar el skill `claude-api`.
2. **Backlog de blog** — definir ~10-12 títulos concretos sobre los 5 pilares (ver SKILL.md de `/blog`).
3. **`sitemap.xml`** — el sitio no tiene; conviene para SEO.
4. **Conectar `/en/promos/`** a la base + cargar promos en inglés.
5. **Editor de blogs en el panel** (Fase 3).

## COSAS ABIERTAS / RIESGOS
- **Dominio sin apuntar:** falta que el usuario cree los registros DNS A (`@` y `www` → `167.99.240.64`) en Namecheap. Después correr `sudo certbot --nginx -d pizzeriapopular.es -d www.pizzeriapopular.es` en el VPS y actualizar `server_name` en `/etc/nginx/sites-available/pizzeria-popular`.
- **Supabase compartido:** el `service_role` da acceso TOTAL a la base del sistema AJAX. El código solo debe tocar tablas `ppweb_*`.
- **Auth compartido:** el panel valida contra `ppweb_admins`, no solo "logueado".
- Mantenimiento del VPS: certbot y parches de seguridad son automáticos; pm2 sobrevive reinicios.
- El hero del post de Benidorm es imagen IA (`benidorm-balcon.jpg`); si hay foto real apaisada del Balcón, reemplazar.
- `benidorm-pareja-atardecer.jpg` vino comprimida de WhatsApp (1200x1600).

## NO HACER
- NO usar Railway — la producción es el VPS. Deploy = `bash deploy.sh`.
- NO crear proyecto Supabase nuevo. NO tocar `pp_resenas_google` ni tablas del sistema AJAX.
- NO hacer que la IA del panel edite código — solo datos `ppweb_*`.
- NO duplicar markup; resolver en `style.css`/`main.js`.
- NO commitear `.env`. NO subir `node_modules`.
- NO editar otros archivos al cerrar sesión salvo `handoff.md`.

## INSTRUCCIONES PARA EL PRÓXIMO CHAT
Leé este handoff + CLAUDE.md (global `~/.claude/CLAUDE.md`) + los archivos clave. La producción es el VPS: cambios en vivo con `bash deploy.sh`, y `git push` para respaldo. Continuá desde "Próximo paso concreto" sin preguntas innecesarias.
