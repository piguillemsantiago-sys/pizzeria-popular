# Memoria de Pizzería Popular

> Bitácora día a día del proyecto. Entradas nuevas arriba.

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
