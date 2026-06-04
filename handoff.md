# HANDOFF — Pizzería Popular

## OBJETIVO PRINCIPAL
Sitio web de Pizzería Popular (cadena argentina de pizza al horno de leña en España, 6 locales) + un **panel de administración con IA** + un **chatbot público "Pepe"**. HTML/CSS/JS vanilla + Node/Express. Producción en un VPS propio.

## ESTADO ACTUAL
- Repo: `github.com/piguillemsantiago-sys/pizzeria-popular`, branch `main`. Working tree limpio. Copia de trabajo local: **`C:\Dev\pizzeria-popular`** (NO la carpeta de `Documents/01-Clientes/Pizzeria-Popular`, que es solo material/assets viejos y tiene un handoff desactualizado).
- **Producción: VPS DigitalOcean** (`167.99.240.64`). **En vivo con dominio + HTTPS** (verificado 2026-06-02, HTTP 200): `https://grupoajax.es`, `https://www.grupoajax.es`, `https://pizzeriapopular.es`, `https://www.pizzeriapopular.es`. Nginx enruta por `server_name` (curl directo a la IP da 404, es normal). Home EN en `/en/home`.
- Panel admin operativo en `/admin/` — ahora es un **dashboard con sidebar** (tema negro premium + dorado). Área **Marketing** con 5 secciones: Calendario, Planificación, Inteligencia, Generador (placeholders "Próximamente") y **Web** (contiene el panel real: Promociones, Blog, Calendario, Pepe). Nav por `switchSection` en `admin.js`. Assets versionados con `?v=N` (cache-busting) — al editar `admin.css`/`admin.js` hay que **bumpear la versión** en `index.html` (van por v=5).
- Chatbot público **Pepe** funcionando en toda la web. **Crece desde el panel** (base de conocimiento editable) y lee promos/horarios reales de la base. Registro de chats operativo.
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
- **Pepe:** estadísticas centradas en **personas** (sesiones únicas: total/hoy/últimos 7 días) + "Mensajes respondidos", gráfico por día, lo más preguntado, últimas consultas. Análisis IA con recomendaciones **divididas en web y Pepe** (botón manual + cron diario 7am); `analyze()` ve también las respuestas de Pepe. `lib/chat-stats.js` (opus-4-7). Incluye el **Cerebro de Pepe** (ver abajo).
- **Cerebro de Pepe** (pestaña Pepe): base de conocimiento editable (`ppweb_pepe_conocimiento`). Agregar/editar-en-línea/activar/borrar datos y autorizaciones que Pepe usa al instante. Las recos IA "para Pepe" tienen botón "➕ Enseñar a Pepe" que las carga acá. CRUD: `/api/admin/pepe/knowledge`.
- Admin dado de alta: `piguillemsantiago@gmail.com` (user_id `34323240-a10f-4ac9-8ceb-b7a40cf611ce`).

## CHATBOT PÚBLICO — "PEPE"
Widget de chat en toda la web (`public/js/main.js`, fin del archivo). `lib/chatbot.js`, modelo `claude-haiku-4-5`.
- Se **lanza desde la pizza flotante** (no hay botón aparte). Punto verde de disponibilidad. Nubecita de invitación discreta (1 vez por sesión).
- Diseño claro. Avatar = robot cocinero SVG (`public/images/pepe-robot.svg`).
- **Tono humano y cálido** (reescrito 2026-06-04): se relajó el límite duro de 40 palabras → respuestas naturales de 1-5 frases, `max_tokens` 320. Sigue con todas las barreras anti-invento.
- Sabe: 6 locales (dirección, teléfono, **WhatsApp `wa.me`**), carta (varía por local), delivery, reservas, links de la web. El prompt se arma así: `SYSTEM + knowledgeBlock() + promosBlock() + horariosBlock()`, cada bloque con cache 60s:
  - `horariosBlock()` — horarios reales de Google Places.
  - `promosBlock()` — **promos vigentes** leídas de `ppweb_promos` (idioma es). Pepe cuenta la promo concreta, no solo el link. NO duplicar promos en el Cerebro.
  - `knowledgeBlock()` — el **Cerebro** (`ppweb_pepe_conocimiento`). Solo para info que NO está en ninguna sección de la web. `reloadKnowledge()` invalida el cache al editar desde el panel.
- Regla de oro del Cerebro: ¿ya está en la web (promos/horarios)? → no lo cargues, Pepe lo lee solo. ¿No está en ningún lado? → al Cerebro. Datos delicados (ej: sin TACC) se redactan honestos, sin garantizar lo que no se puede.
- Cada turno se registra en `ppweb_chat_logs` (`/api/chat` con `sessionId`).
- Móvil: el panel se ajusta al `visualViewport` (no se descentra ni hace zoom con el teclado); input a 16px.

## SUPABASE / DATOS
- Proyecto compartido **"AJAX Sistema de Gestión"** (ref `zaoaxkewnratzenklyth`). Tablas del panel con prefijo `ppweb_`.
- Tablas: `ppweb_promos`, `ppweb_admins`, `ppweb_posts`, `ppweb_chat_logs`, `ppweb_chat_insights`, `ppweb_pepe_conocimiento` (Cerebro de Pepe, creada 2026-06-04).
- SQL (ya ejecutados, en la raíz): `supabase-schema.sql`, `supabase-posts.sql`, `supabase-chat-logs.sql`. ⚠️ La tabla `ppweb_pepe_conocimiento` se creó a mano en el SQL Editor (no hay archivo .sql versionado todavía): `id bigint identity pk, contenido text, activo bool default true, origen text default 'manual', created_at timestamptz`. RLS activado.
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

## CAMBIOS DE ESTA SESIÓN (2026-06-04)
- **Dashboard con sidebar** (`public/admin/index.html` + `admin.js` + `admin.css`): área Marketing → Web (panel actual) + 4 placeholders. `switchSection()`. Commits `dd0bc14`, `f4c63b3` (cache-busting `?v=`).
- **Estadísticas de Pepe → personas** (`chat-stats.js getStats`, `admin.js`, `index.html`): tarjetas Personas total/hoy/7-días + Mensajes respondidos (antes contaban mensajes). Commit `65ad1e1`.
- **Pepe que crece** (commit `abe0d0f`): tono humano en `lib/chatbot.js` (sin límite de 40 palabras, max_tokens 320); **Cerebro** `ppweb_pepe_conocimiento` con CRUD `/api/admin/pepe/knowledge` + inyección al prompt (`knowledgeBlock`, `reloadKnowledge`); `analyze()` divide `recomendaciones_web` / `recomendaciones_pepe` y ve las respuestas de Pepe; botón "Enseñar a Pepe".
- **Editar conocimiento en línea** (commit `ddf29e6`): botón "Editar" por entrada del Cerebro.
- **Pepe lee promos** (commit `b6cf03e`): `promosBlock()` inyecta `ppweb_promos` (idioma es) al prompt. Cuenta la promo concreta. No duplicar en el Cerebro.
- **Supabase:** creada `ppweb_pepe_conocimiento`. Primer dato cargado: opciones sin TACC (3 fainás) con advertencia de contaminación cruzada. Probado end-to-end (Pepe nombra las 3 + advierte + deriva al local).
- Assets del admin van por `?v=5`. Recordar bumpear al editar `admin.css`/`admin.js`.

## CAMBIOS DE LA SESIÓN ANTERIOR (2026-06-02)
- `public/pages/index.html` — tarjeta "NUEVO LOCAL · Benidorm" (línea ~327) usaba por error la foto de Russafa (`tl-russafa.jpg`); ahora apunta a `tl-benidorm-local.jpg`. Corregidas barras `\` → `/`. Commit `9efddc8`.
- `public/en/home.html` — misma corrección en la home en inglés. Commit `d2d72be`.
- `public/images/extracted/tl-benidorm-local.jpg` — **nueva** foto real del local (origen `Downloads/web benidorm.JPG`, 4 personas). Comprimida con .NET System.Drawing: 5,26 MB → ~79 KB (1100×617, JPEG q82). En el VPS no hay ImageMagick/sharp/ffmpeg.
- `public/admin/admin.css` — **rediseño completo** del panel (solo CSS, HTML/JS intactos): tema negro real (`--pp-bg #08080a`) con glow dorado sutil, profundidad por capas, pestañas tipo segmented control, botones con gradiente/sombra, tarjetas con hover, inputs con focus ring dorado, scrollbars finos, login y modales pulidos. Commit `1649a5e`. Las variables de marca (`--pp-gold #D8A460` / `--pp-gold-bright #F5C66B`) se mantienen.
- Supabase: creadas `ppweb_chat_logs` y `ppweb_chat_insights` (ver sección SUPABASE).

## BUGS PENDIENTES
- Ninguno conocido al cierre.

## PRÓXIMO PASO CONCRETO
1. **Seguir cargando el Cerebro de Pepe** con datos que NO están en la web: reservas de grupos grandes, mascotas, estacionamiento/accesibilidad, platos a recomendar. Redactarlos honestos y afirmativos (como el de sin TACC). El usuario los pasa cuando los tenga a mano.
2. **Construir las secciones de Marketing** (hoy placeholders): Calendario, Planificación, Inteligencia, Generador. Definir con el usuario qué hace cada una antes de armarla.
3. **Integración AJAX:** cuando el usuario pase los emails de los admins de AJAX → alta en `ppweb_admins`. OJO: el dashboard nuevo (sidebar) divergió más del módulo de AJAX — reevaluar si la integración sigue en pie o si este dashboard es la nueva dirección.
4. Pepe ya acumula consultas reales: en unos días revisar la pestaña Pepe ("Lo que más preguntan" + "Analizar con IA") y usar "Enseñar a Pepe" para alimentar el Cerebro.
5. (Opcional) Versionar el SQL de `ppweb_pepe_conocimiento` como `supabase-pepe-conocimiento.sql` en la raíz, para no perder el esquema.

## COSAS ABIERTAS / RIESGOS
- Caché del admin: al editar `admin.css`/`admin.js` SIEMPRE bumpear `?v=N` en `index.html` (y en `login.html` el css), si no el navegador sirve la versión vieja (ya pasó en esta sesión: panel sin estilo + sección Web en negro).
- Cerebro de Pepe vs base: NO cargar al Cerebro datos que ya viven en la web (promos, horarios) — Pepe los lee solo y duplicarlos genera desincronización.
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
