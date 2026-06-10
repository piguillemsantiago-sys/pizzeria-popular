# Memoria de Pizzería Popular

> Bitácora día a día del proyecto. Entradas nuevas arriba.

## 2026-06-10

- **Bug "Error del servidor." al generar blog (RESUELTO).** Causa: la generación con IA (Opus 4.7 + thinking + `max_tokens` 16000) tarda ~75s, y Nginx cortaba a los 60s (`proxy_read_timeout` por defecto) → 504 con HTML → el frontend ([admin.js:33](public/admin/admin.js#L33)) lo mostraba como "Error del servidor.". El modelo y params (`claude-opus-4-7`, `thinking: adaptive`, `output_config.effort: medium`) estaban OK (verificado con la skill `claude-api`). **Fix:** agregado `proxy_read_timeout 300s;` + `proxy_send_timeout 300s;` al `location /` de `/etc/nginx/sites-available/pizzeria-popular` en el VPS (con backup + `nginx -t` + reload). ⚠️ La config de Nginx NO está versionada: vive solo en el server.
- **Edición de posts con IA ("retoques").** El asistente no recibía el cuerpo de los posts (solo id/título/idioma/estado/slug) → no podía "quitar una frase" ni "poner fotos" en algo existente. Cambios: `index.js` (`/api/admin/blog-assistant`) ahora selecciona el contenido completo (`subtitulo,eyebrow,meta_desc,keyword,hero_image,fecha,local,contenido`); `lib/blog-assistant.js` inyecta ese contenido al contexto + reglas "EDICIÓN DE POSTS EXISTENTES" en el SYSTEM (parte del contenido actual, conserva lo no pedido, ES+EN en sintonía). Probado: instrucción de edición → `editar_post` con contenido modificado (~30s).
- **Pepe ahora conoce el blog.** Agregado `blogBlock()` en `lib/chatbot.js`: inyecta los posts PUBLICADOS (título, link por idioma, extracto) al prompt, junto a conocimiento/promos/horarios. Antes decía "no tengo acceso a la sección de blogs". Probado: responde y linkea el blog. ⚠️ Pepe solo ve posts en estado `publicado` (nunca borradores); cache 60s.
- **`deploy.sh` arreglado.** Excluido `referencia.html` (12 MB) que causaba "broken pipe / connection reset" en cada deploy. Ahora deploy ~9s y confiable. (Durante la falla deployé copiando archivos por `scp` directo.)
- **Decisión de ritmo:** para acelerar, de acá en más se aplican cambios en vivo y prueba el usuario (sin verificación end-to-end mía en cada vuelta).
- **Pendiente:**
  1. Publicar los posts reales ("Sumate al equipo de Pizzería Popular", ES+EN, hoy en preparación) para que Pepe los tome; borrar/despublicar "Post de prueba del panel".
  2. **Respaldar en git: los cambios de hoy están EN VIVO pero NO commiteados/pusheados** — correr `/handoff` o `/checkpoint`.

## 2026-06-04

- **Foto Benidorm:** la tarjeta "NUEVO LOCAL · Benidorm" usaba por error la foto de Russafa (`tl-russafa.jpg`). Cambiada por la foto real (`tl-benidorm-local.jpg`, comprimida 5,26 MB → 79 KB) en `public/pages/index.html` y `public/en/home.html`.
- **Rediseño del panel admin:** tema negro premium + dorado de marca (solo CSS, HTML/JS intactos). Profundidad por capas, segmented tabs, botones con gradiente, login y modales pulidos.
- **Dashboard con sidebar:** reestructurado `/admin` a un dashboard. Área **Marketing** con 5 secciones: Calendario, Planificación, Inteligencia, Generador (placeholders "Próximamente") y **Web** (contiene el panel actual: Promociones, Blog, Calendario, Pepe). Nav por `switchSection`. Se agregó cache-busting `?v=N` a los assets (`admin.css`/`admin.js`) para evitar caché vieja.
- **Estadísticas de Pepe → personas:** las tarjetas ahora muestran personas (sesiones únicas): total, hoy, últimos 7 días + "Mensajes respondidos". Antes contaban mensajes. `getStats()` calcula `personasHoy`/`personas7`.
- **Pepe que crece (lo grande del día):**
  - **Tono más humano** en el system de `lib/chatbot.js`; se relajó el límite duro de 40 palabras (1-5 frases), `max_tokens` 320.
  - **Cerebro de Pepe:** tabla `ppweb_pepe_conocimiento` editable desde el panel (pestaña Pepe). Pepe la inyecta al prompt (cache 60s, `reloadKnowledge()` al editar). CRUD en `/api/admin/pepe/knowledge`. Botón "Editar" en línea por entrada.
  - **Recomendaciones divididas:** `analyze()` devuelve `recomendaciones_web` y `recomendaciones_pepe`; ahora ve también las respuestas de Pepe. Botón "➕ Enseñar a Pepe" carga la reco al Cerebro.
  - **Pepe lee promos:** inyecta las promos activas (`ppweb_promos`, idioma es) al prompt, igual que los horarios de Google. Cuenta la promo concreta (día, condiciones) sin duplicar nada. Regla: lo que ya está en la web (promos, horarios) NO se carga al Cerebro; el Cerebro es solo para lo que no vive en ningún lado.
  - Primer dato real cargado: **opciones sin TACC** (3 fainás: clásica, napolitana, calabaza y champiñones) con la advertencia de contaminación cruzada (misma cocina) y derivación al local. Probado: Pepe lo maneja honesto y cálido.
- **Supabase — tablas creadas hoy por el usuario (SQL en el panel):** `ppweb_chat_logs`, `ppweb_chat_insights` (faltaban → Pepe no guardaba nada) y `ppweb_pepe_conocimiento`.
- **Commits:** `9efddc8`, `d2d72be`, `1649a5e`, `dd0bc14`, `f4c63b3`, `65ad1e1`, `abe0d0f`, `ddf29e6`, `b6cf03e` (+ handoff `59ac19a`). Todos pusheados.
- **Pendiente / próximo paso:** seguir cargando datos al Cerebro (reservas de grupos, mascotas, estacionamiento) cuando el usuario los tenga. Pendiente mayor: integración con AJAX (alta de admins). El dashboard tiene 4 secciones de Marketing como placeholders para construir de a poco.
