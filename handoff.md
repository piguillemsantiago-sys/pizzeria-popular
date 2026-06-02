# HANDOFF — Pizzería Popular

## OBJETIVO PRINCIPAL
Sitio web de Pizzería Popular (cadena argentina de pizza al horno de leña en España, 6 locales) + un **panel de administración con IA** + un **chatbot público "Pepe"**. HTML/CSS/JS vanilla + Node/Express. Producción en un VPS propio.

## ESTADO ACTUAL
- Repo: `github.com/piguillemsantiago-sys/pizzeria-popular`, branch `main`. Working tree limpio. Copia de trabajo local: **`C:\Dev\pizzeria-popular`** (NO la carpeta de `Documents/01-Clientes/Pizzeria-Popular`, que es solo material/assets viejos y tiene un handoff desactualizado).
- **Producción: VPS DigitalOcean** (`167.99.240.64`). **En vivo con dominio + HTTPS** (verificado 2026-06-02, HTTP 200): `https://grupoajax.es`, `https://www.grupoajax.es`, `https://pizzeriapopular.es`, `https://www.pizzeriapopular.es`. Nginx enruta por `server_name` (curl directo a la IP da 404, es normal). Home EN en `/en/home`.
- Panel admin operativo en `/admin/` con 4 pestañas: **Promociones, Blog, Calendario, Pepe**. **Rediseñado** esta sesión: tema negro premium + dorado.
- Chatbot público **Pepe** funcionando en toda la web. Registro de chats **operativo** (tablas creadas esta sesión).
- `.env` (local y VPS): `PORT, NODE_ENV, GOOGLE_PLACES_API_KEY, SMTP_*, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY, GDRIVE_FOLDER_ID (opcional)`. `.env` gitignored.

## INFRAESTRUCTURA — VPS
- DigitalOcean, Ubuntu 24.04, IP `167.99.240.64`. Node 22 + pm2 (app `pizzeria-popular`) + Nginx (:80→:3000) + certbot (instalado, HTTPS sin activar) + ufw + swap.
- SSH: alias `pizzeria-vps` (usuario `deploy`, clave `~/.ssh/pizzeria_vps`).
- Proyecto en el VPS: `/var/www/pizzeria-popular`.
- **Deploy:** `bash deploy.sh` → sincroniza por SSH (tar) + `npm install` + `pm2 restart` + health check. Excluye `node_modules`, `.git`, `.env`, `google-ratings.json`.
- Flujo: editar local → `bash deploy.sh` (deja en vivo) → `git push` (respaldo).

## PANEL DE ADMINISTRACIÓN — ESTADO
Panel privado en `/admin/`. Login Supabase Auth + `requireAdmin` server-side + RLS + whitelist `ppweb_admins`.
- **Promociones:** ABM completo + asistente IA (lenguaje natural → `lib/assistant.js`, opus-4-7, plan/confirmar).
- **Blog:** ABM de posts con 3 estados (`preparacion`/`pendiente`/`publicado`), autopublicación (cron 6am), previsualización (`/admin/preview/:id/`). Asistente IA que genera el post completo ES+EN con la plantilla `.article-*` (`lib/blog-assistant.js`, opus-4-7, visión). Selector de fotos: subida directa + Google Drive.
- **Calendario:** posts del blog por fecha.
- **Pepe:** estadísticas del chatbot (consultas totales, conversaciones, por día, lo más preguntado, últimas consultas) + análisis IA con recomendaciones (botón manual + cron diario 7am). `lib/chat-stats.js` (opus-4-7).
- Admin dado de alta: `piguillemsantiago@gmail.com` (user_id `34323240-a10f-4ac9-8ceb-b7a40cf611ce`).

## CHATBOT PÚBLICO — "PEPE"
Widget de chat en toda la web (`public/js/main.js`, fin del archivo). `lib/chatbot.js`, modelo `claude-haiku-4-5`.
- Se **lanza desde la pizza flotante** (no hay botón aparte). Punto verde de disponibilidad. Nubecita de invitación discreta (1 vez por sesión).
- Diseño claro. Avatar = robot cocinero SVG (`public/images/pepe-robot.svg`).
- Respuestas cortas (máx 2 frases / 40 palabras), resolutivas, con emojis y **links clicables** (`[texto](ruta)` → botón; soporta `**negrita**`).
- Sabe: 6 locales (dirección, teléfono, **WhatsApp `wa.me`**), carta (varía por local), delivery, reservas, links de la web, y los **horarios reales** de cada local (vía Google Places).
- Cada turno se registra en `ppweb_chat_logs` (`/api/chat` con `sessionId`).
- Móvil: el panel se ajusta al `visualViewport` (no se descentra ni hace zoom con el teclado); input a 16px.

## SUPABASE / DATOS
- Proyecto compartido **"AJAX Sistema de Gestión"** (ref `zaoaxkewnratzenklyth`). Tablas del panel con prefijo `ppweb_`.
- Tablas: `ppweb_promos`, `ppweb_admins`, `ppweb_posts`, `ppweb_chat_logs`, `ppweb_chat_insights`.
- SQL (ya ejecutados, en la raíz): `supabase-schema.sql`, `supabase-posts.sql`, `supabase-chat-logs.sql`.
- ✅ RESUELTO (2026-06-02): faltaban `ppweb_chat_logs` y `ppweb_chat_insights` (nunca se había corrido `supabase-chat-logs.sql`) → la pestaña Pepe daba "Could not find the table ... in schema cache" y NO se guardaba ningún chat. El usuario corrió el SQL en el SQL Editor; tablas verificadas (HTTP 200) y registro probado end-to-end. Empieza a acumular datos desde ahora (antes no guardaba nada).
- Storage: bucket `ppweb-blog` (imágenes del blog).

## INTEGRACIONES
- **Google Places** (`google-places.js`): ratings + reseñas + **horarios** (`regularOpeningHours`) de los 6 locales → `public/data/google-ratings.json`. Cron semanal (domingo 3am). Para refrescar manual: `GET /api/update-ratings?key=secretkey123`.
- **Google Drive** (`lib/drive.js`): cuenta de servicio `drive-lectura@pizzeria-web-drive.iam.gserviceaccount.com`, key `google-drive-key.json` (NO commitear). Carpeta raíz `1ZbEpKgfuI5b3oVxxTVfjuOghadpBTgfn` (env `GDRIVE_FOLDER_ID`).
- **Claude API** (`@anthropic-ai/sdk`): asistentes del panel (opus-4-7) + chatbot (haiku-4-5).

## INTEGRACIÓN CON AJAX — EN CURSO (lo grande pendiente)
El panel de la web se está integrando como **módulo nativo dentro del Sistema de Gestión de Grupo AJAX**.
- El "Sistema de Gestión AJAX" = la app de Railway `https://habit-tracker-production-b9ab.up.railway.app` (RRHH, Marketing, Cocina, Auditorías, etc. — NO es solo menús). Su `/admin` es el sistema completo. Usa el mismo Supabase y también Claude/Gemini.
- **Enfoque acordado:** módulo nativo re-skineado con el diseño de AJAX. Reutiliza la LÓGICA (`public/admin/admin.js`) y la ESTRUCTURA (`public/admin/index.html`); **NO** reutiliza `admin.css` (tema oscuro, choca con AJAX). El backend NO se reescribe: AJAX consume la API `/api/admin/*` del VPS vía un **proxy en el backend de AJAX** (server-to-server, evita CORS y mixed-content).
- El trabajo del lado AJAX lo hace OTRO chat de Claude, en el repo de AJAX (el frontend de AJAX usa `App.token`, no supabase-js).
- **Pendiente del lado pizzería:** dar de alta en `ppweb_admins` los `user_id` de Supabase de los admins de AJAX que usen el módulo (esperando que el usuario pase los emails). SQL de alta por email: `insert into ppweb_admins (user_id) select u.id from auth.users u where u.email = any(array['...']) and u.id not in (select user_id from ppweb_admins);`
- **Caveat clave:** el módulo de AJAX es una COPIA del frontend → los cambios de UI NO se auto-sincronizan (el backend y los datos SÍ). End state: cuando el módulo de AJAX esté validado, **retirar el panel viejo `/admin` del VPS** → queda un solo frontend.

## DECISIONES TÉCNICAS BLOQUEADAS
- CSS y JS son archivos compartidos: editar `style.css`/`main.js` antes que tocar HTML uno por uno.
- Posts de blog nuevos: plantilla `.article-*` + `blog-post.js`. Existe la skill `/blog`.
- Posts servidos desde la base se renderizan con `lib/render-post.js` + `templates/post-es.html`/`post-en.html`.
- `sharp` instalado con `npm install sharp --no-save` (no está en package.json a propósito).
- Supabase: reutilizar el proyecto "AJAX Sistema de Gestión". NO crear proyecto nuevo. Tablas siempre con prefijo `ppweb_`.
- La IA del panel NO edita código: solo acciones acotadas sobre datos `ppweb_*`.
- Bug recurrente CSS: elemento con `[hidden]` pero regla que pone `display:flex/block` → agregar `.selector[hidden]{display:none}`.
- Mail oficial: `pizzeriapopular@grupoajax.es`. Dorado de marca: `#D8A460` / brillante `#F5C66B`.

## ARCHIVOS CLAVE
- `index.js` — backend Express: rutas del sitio, `/api/contacto`, `/api/franquicia`, `/api/chat`, `/api/admin/*`, crons.
- `lib/` — `supabase.js` (`requireAdmin`), `assistant.js`, `blog-assistant.js`, `drive.js`, `render-post.js`, `chatbot.js`, `chat-stats.js`.
- `google-places.js` — ratings + reseñas + horarios.
- `public/admin/` — panel: `login.html`, `index.html`, `admin.css`, `admin.js`.
- `public/js/main.js` — JS del sitio + widget del chatbot Pepe.
- `public/css/style.css` — CSS único (incluye `.article-*` y `.ppchat-*`).
- `deploy.sh`, `supabase-*.sql`, `.claude/skills/blog/SKILL.md`.

## CRONS (en `index.js`)
- Ratings Google: domingo 3am. — Autopublicar posts: diario 6am. — Análisis del chat de Pepe: diario 7am.

## CAMBIOS DE ESTA SESIÓN (2026-06-02)
- `public/pages/index.html` — tarjeta "NUEVO LOCAL · Benidorm" (línea ~327) usaba por error la foto de Russafa (`tl-russafa.jpg`); ahora apunta a `tl-benidorm-local.jpg`. Corregidas barras `\` → `/`. Commit `9efddc8`.
- `public/en/home.html` — misma corrección en la home en inglés. Commit `d2d72be`.
- `public/images/extracted/tl-benidorm-local.jpg` — **nueva** foto real del local (origen `Downloads/web benidorm.JPG`, 4 personas). Comprimida con .NET System.Drawing: 5,26 MB → ~79 KB (1100×617, JPEG q82). En el VPS no hay ImageMagick/sharp/ffmpeg.
- `public/admin/admin.css` — **rediseño completo** del panel (solo CSS, HTML/JS intactos): tema negro real (`--pp-bg #08080a`) con glow dorado sutil, profundidad por capas, pestañas tipo segmented control, botones con gradiente/sombra, tarjetas con hover, inputs con focus ring dorado, scrollbars finos, login y modales pulidos. Commit `1649a5e`. Las variables de marca (`--pp-gold #D8A460` / `--pp-gold-bright #F5C66B`) se mantienen.
- Supabase: creadas `ppweb_chat_logs` y `ppweb_chat_insights` (ver sección SUPABASE).

## BUGS PENDIENTES
- Ninguno conocido al cierre.

## PRÓXIMO PASO CONCRETO
1. **Integración AJAX:** cuando el usuario pase los emails de los admins de AJAX → darlos de alta en `ppweb_admins`. Cuando valide el módulo de AJAX → retirar el panel viejo `/admin` del VPS.
2. Nada urgente. Pepe ya acumula consultas: en unos días revisar la pestaña Pepe ("Lo que más preguntan" + "Analizar con IA") para ajustar el chatbot o detectar dudas frecuentes.
3. (HECHO) Dominio + HTTPS ya activos en `grupoajax.es` y `pizzeriapopular.es`. Si el cliente prefiere un dominio canónico, definir cuál y redirigir el otro.

## COSAS ABIERTAS / RIESGOS
- Dominio sin apuntar (DNS pendiente del usuario).
- Generación de imágenes con Gemini/Nano Banana Pro: conversada, pendiente de `GEMINI_API_KEY`.
- Supabase compartido: el `service_role` da acceso TOTAL a la base de AJAX. El código solo debe tocar tablas `ppweb_*`.
- Los links "Carta X" de la web apuntan al sistema AJAX (Railway) — es intencional.

## NO HACER
- NO usar Railway para la web — la producción es el VPS. Deploy = `bash deploy.sh`.
- NO crear proyecto Supabase nuevo. NO tocar `pp_resenas_google` ni tablas del sistema AJAX.
- NO hacer que la IA del panel edite código — solo datos `ppweb_*`.
- NO reutilizar `admin.css` en el módulo de AJAX (re-skinear con el diseño de AJAX).
- NO duplicar markup; resolver en `style.css`/`main.js`. NO commitear `.env` ni `google-drive-key.json`.
- NO editar otros archivos al cerrar sesión salvo `handoff.md`.

## INSTRUCCIONES PARA EL PRÓXIMO CHAT
Leé este handoff + CLAUDE.md (global `~/.claude/CLAUDE.md`) + los archivos clave. La producción es el VPS: cambios en vivo con `bash deploy.sh`, y `git push` para respaldo. Al tocar Claude API, invocar la skill `claude-api`. Continuá desde "Próximo paso concreto" sin preguntas innecesarias.
