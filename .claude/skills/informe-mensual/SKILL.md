---
name: informe-mensual
description: Orquesta el informe mensual por local + gerencia de Pizzería Popular (pipeline extract+build) con las trampas de cada fuente ya resueltas. Se corre los primeros 2-3 días del mes. No deploya nada (el informe es local/impreso).
---

# /informe-mensual [YYYY-MM] — Informe mensual por local

Vive en `C:\Dev\pizzeria-popular\informes\<YYYY-MM>\` (6 HTML imprimibles). Dos
scripts reutilizables en `scripts/`: `extract-informe-<mes>.js` (saca de Supabase
→ `datos-sistema.json`) y `build-informes-<mes>.js` (genera los HTML desde ese
JSON + `gbp-manual.json`).

## Paso 1 — Preparar el mes

Copiar los scripts del mes anterior y renombrarlos al mes nuevo; crear
`informes/<YYYY-MM>/`. Ajustar el rango de fechas.

## Paso 2 — Extract (Supabase), respetando el límite de cada fuente

- **Cap de 1000 filas de Supabase/PostgREST:** en cualquier agregación, PAGINAR
  con `.range()` — `.limit(50000)` NO alcanza y subcuenta (ya pasó con visitas/días).
- `ppweb_google_metrics` arranca 2026-06-18 → "reseñas nuevas" solo cubre desde ahí.
- `ppweb_meta_ads` desde 26/06 → para campañas del mes usar `acumulado_fin` como total.
- **GBP (Rendimiento) se carga A MANO** desde capturas del dueño → volcar a
  `gbp-manual.json` (la GBP API sigue bloqueada). NO inventar.
- Los últimos 5-7 días del mes salen en CERO en algunas métricas GBP
  (web/llamadas/menú): es retraso de consolidación de Google, NO un fallo. No
  dar la falsa alarma del "link roto".

## Paso 3 — Build (formato fijo acordado con el dueño el 02/07)

Correr el build a los 6 HTML con la estructura pactada:
1. **Comparativas por métrica:** ficha Google → vs mismo mes del año pasado +
   mes anterior; reseñas/respuestas/menciones por camarero → vs mes anterior;
   carta digital y web → vs mes anterior.
2. Sección **"¿Qué pasó con las acciones del mes pasado?"**: checklist ✅/❌ con
   efecto medible.
3. **Menciones por camarero:** contar nombres en los temas del dashboard ValoraIA
   (NO tarjetas NFC — el dueño lo descartó; no volver a proponerlas).

## Reglas

- Sale los primeros 2-3 días del mes con los datos que haya; los últimos ~5 días
  de GBP llegan subcontados y se consolidan después. No esperar.
- El informe es local/impreso. NO deploya. Si algo se publica, es con /deploy-pp
  (deploy.sh), nunca Railway.
- Ratings de ValoraIA (media del mes) difieren del global de Google — es
  esperado, no un bug.
