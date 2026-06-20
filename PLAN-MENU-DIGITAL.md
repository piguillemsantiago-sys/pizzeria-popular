# Plan de migración — Admin del Menú Digital → pizzeria-popular

> Portar **solo el panel de control (admin)** del Menú Digital (hoy en `habit-tracker`,
> Railway) a una sección nueva "Menú Digital" dentro de `grupoajax.es/admin`.
> **No se toca** el menú público ni los QR (siguen en Railway). Mismo Supabase →
> cero migración de datos, sin segundo cliente, mismo `auth.users`.

## 1. Resumen

Se reutiliza el `supabaseAdmin` existente (mismo proyecto `zaoaxkewnratzenklyth`) contra
`restaurants` / `menu_*` / `menu_user_restaurants` / `user_profiles`. Se respeta el modelo
maestro AJAX→locales y el scoping por gerente.

**NO se toca:** menú público ni QR (siguen en Railway en `/<slug>`); datos (mismo Supabase);
el writer de `menu_analytics` (lo alimenta Railway). Los QR generados desde el admin portado
siguen apuntando a `https://habit-tracker-production-b9ab.up.railway.app/<slug>`. No se crea
segundo cliente Supabase. El login y `/api/admin/config` no se tocan.

## 2. Archivos nuevos en pizzeria-popular

- **`lib/menu-effective.js`** — copia 1:1 de `habit-tracker/src/helpers/menu-effective.js`;
  cambiar solo el import a `require('./supabase')`. Exporta los helpers de herencia
  (`getAjaxRestaurantId, getEffectiveMenu, getAdminCategories/Subcategories/Items, groupBy, AJAX_SLUG`).
- **`lib/menu.js`** — lógica de `admin-menu.js` (706 líneas) reescrita al patrón del destino
  (funciones puras, no `express.Router`). Incluye `PUBLIC_MENU_BASE_URL`/`publicMenuUrl(slug)`
  idénticos, `getMenuAccess(userId)`, `assertAllowed`, QR (qrcode/pdfkit lazy). Cierra el agujero
  de subcategorías (exigir `isOwner` en operaciones de estructura maestra). Omite
  `refresh-google-reviews` (stub 503).
- **`lib/menu-analytics.js`** — `getSummary(ctx, …)` y `getGlobal(ctx, …)` como funciones puras.
- **`public/admin/menu.css`** — copia de `menu-admin.css` (878 líneas, clases `.ma-*`); cambiar
  `#menu-digital` → `#section-menu`; reconciliar clases de botón con el design system del destino.
- **`public/admin/menu.js`** — `MenuAdminModule` (1910 líneas) adaptado: fetch vía
  `window.PPAdmin.api()`, token de blobs vía `PPAdmin.sb.auth.getSession()`, sacar botón "Volver".

## 3. Ediciones a archivos existentes

- **`index.js`** — importar `lib/menu` y `lib/menu-analytics`; helper `menuCtx(req)`; registrar
  `/api/admin/menu/*` y `/api/admin/menu-analytics/*` (todas con `requireAdmin`) antes del 404;
  extender `/api/admin/me` para devolver el scope del menú.
- **`public/admin/index.html`** — CDNs Chart.js + SortableJS; nav item `data-section="menu"`;
  `<section id="section-menu"><div id="menu-admin-root"></div></section>`; `<link>`+`<script>` del
  menú; bump `?v` de admin.css/admin.js.
- **`public/admin/admin.js`** — exponer `window.PPAdmin = { api, esc, sb, showToast }`;
  `SECTION_LABELS['menu']`; lazy-load en `switchSection`; **gate de render por permiso en `init()`**
  (gerente solo-menú: ocultar resto + arrancar en Menú) y **gatear el wiring de Promos/Posts/Web**
  detrás de `if (!onlyMenu)` (si no, `init()` rompe por listeners a nodos removidos).
- **`.env` (local + VPS)** — `PUBLIC_MENU_BASE_URL=https://habit-tracker-production-b9ab.up.railway.app`.
- **`package.json`** — agregar `qrcode@^1.5.4` y `pdfkit@^0.15.0` (ambos FALTAN).
- **`deploy.sh`** — asegurar `npm install` en el VPS (si no, `require('qrcode')` rompe el arranque).

## 4. Auth y scoping

- Entrada: se reutiliza `requireAdmin` (Bearer + `ppweb_admins`). El scoping fino vive en
  `lib/menu.js` vía `getMenuAccess(req.adminUser.id)`.
- Regla de acceso: `user_profiles.role==='dueno'` → todos los locales activos; fila
  `menu_user_restaurants.role==='menu_owner'` → todos; si no → solo los `restaurant_id` asignados;
  nada → 403. Operaciones de estructura maestra exigen `isOwner`.
- Doble gate: un gerente del menú debe estar en `ppweb_admins` (para pasar `requireAdmin`) **y** en
  `menu_user_restaurants` (scope). El front le oculta las secciones que no son Menú.
- Login: NO se toca.

**Ambigüedad a confirmar con el dueño:** cómo distinguir "admin full del panel" de "gerente
solo-menú" (ambos deben estar en `ppweb_admins`). Recomendación: `isFullAdmin = (role==='dueno')`.

## 5. Config / env

- `PUBLIC_MENU_BASE_URL` con el valor de Railway (crítico para QR). Nunca poner la URL del VPS.
- Deps a instalar: `qrcode`, `pdfkit`. Bucket de fotos `menu-images` ya existe y es público.

## 6. Riesgos principales

1. **QR generados ≠ QR físicos** → mantener `PUBLIC_MENU_BASE_URL` con el dominio de Railway.
2. **Romper menú público** → solo se escribe en las mismas tablas que ya edita el origen; lectura
   con la misma herencia. Railway intacto.
3. **`getAjaxRestaurantId` sin fila `slug='ajax'`** → verificar que exista antes de deployar.
4. **CSS pisa el panel** → `.ma-*` prefijado, no editar `admin.css`, revisar z-index.
5. **Un gerente ve otro local** → `assertAllowed` en cada endpoint; `GET /restaurants` ya filtrado.
6. **`init()` rompe para gerente** → gatear wiring de Promos/Posts/Web tras `if (!onlyMenu)`.
7. **`require('qrcode')` rompe arranque en VPS** → `npm install` en el deploy.

## 7. Verificación (post-implementación)

1. Arranque limpio (local + VPS), sin errores de `require`.
2. **QR idéntico (crítico):** descargar QR de un local, decodificarlo y confirmar que la URL es
   exactamente `https://habit-tracker-production-b9ab.up.railway.app/<slug>`. Probar PNG/SVG/PDF.
3. **Scoping:** gerente con un solo local → ve solo "Menú Digital" y solo su local; `GET …?restaurant_id=<otro>` → 403.
4. **Edición refleja en público:** editar plato → aparece en el menú público de Railway.
5. **Override no destruye maestro:** desactivar categoría en un local no la apaga en AJAX/otros.
6. Subida de imagen → Storage `menu-images`. Analytics (Chart.js) carga datos reales.
7. **No regresión:** admin full ve Web/Promos/Analítica/Generador/Inteligencia igual que antes.

## 8. Plan de ejecución incremental (cada paso commiteable, de seguro a riesgoso)

1. **Deps + env** (no afecta nada en vivo): `npm install qrcode pdfkit` + `PUBLIC_MENU_BASE_URL`.
2. **`lib/menu-effective.js`** (copia + fix import). No referenciado aún.
3. **`lib/menu.js` + `lib/menu-analytics.js`** completos, sin montar rutas todavía.
4. **Montar rutas** en `index.js` + extender `/api/admin/me`. Probar QR por curl (verif. §7.2).
5. **CSS + markup** (`menu.css`, `#section-menu`, nav, CDNs). Sección inerte.
6. **Front JS** (`menu.js` + `window.PPAdmin` + lazy-load). Probar como `dueno`: CRUD, QR, analytics.
7. **Gate de scoping en el front** (lo más delicado). Probar admin full y gerente scopeado.
8. **Alta de datos** de gerentes en `ppweb_admins` + `menu_user_restaurants` (dato, no código).
9. **Deploy al VPS** (`deploy.sh` con `npm install`). Verificación completa §7, QR primero.

**Red de seguridad:** ningún paso toca Railway ni el writer de analytics. Si algo falla,
`git reset --hard` al commit anterior + redeploy. El paso 7 es el de mayor riesgo (puede romper el
panel para admins) → va después de tener el menú andando y se prueba con los dos perfiles.
