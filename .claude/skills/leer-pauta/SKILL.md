---
name: leer-pauta
description: Lee una campaña de Meta/Google viva y dice qué toca hacer HOY según el día de vida y la regla fija de la agencia. Read-only — crear, pausar y escalar sigue siendo MANUAL en Ads Manager (la API solo lee).
---

# /leer-pauta [conjunto] [fecha-lanzamiento] — Lectura de campaña

Read-only: recomienda, el humano ejecuta en Ads Manager. La API es solo
`ads_read` (no crea ni pausa campañas). Salida supervisada.

## Paso 1 — Día de vida

Dada la fecha de lanzamiento, calcular en qué día va la campaña.

## Paso 2 — Regla fija por día (playbook de la agencia)

- **Días 1-3:** aprendizaje. NO tocar.
- **Día 4:** si 0 resultados (conversaciones / leads cualificados), ajustar
  creatividad o público. NO subir budget.
- **Días 5-7:** pausar las flojas y escalar la ganadora (+20-30% cada 2-3 días,
  techo útil ~15-25 €/día si el público es finito). Lectura del ganador ~día 7.
- **Parada dura día 14:** sin un resultado cualificado, parar.
- Google Ads: leer incremental días 5-10.

## Paso 3 — Números (si hay credenciales)

`META_ADS_TOKEN` vive solo en el VPS; Supabase SÍ se lee desde local. Leer el
último snapshot de `ppweb_meta_ads` (nivel adset) y sacar por conjunto:
invertido / alcance / clics al enlace / entraron (landing_page_view) / CTR /
€-clic. Marcar la ganadora ★.

Cruzar con la INTENCIÓN del tracker propio cuando aplique: eventos `comollegar` +
WhatsApp en `ppweb_eventos` por path — Meta reporta `find_location` en 0 aunque
el tracker propio sí lo capture.

## Paso 4 — Veredicto

Por conjunto: estado + la acción concreta que toca ejecutar HOY a mano. En rojo
las ventanas críticas (parada dura, día de lectura del ganador) y cuáles siguen
en aprendizaje intocables.

## Reglas

- El CTA debe coincidir con el destino: audiencia fría → Reconocimiento/Alcance a
  la ficha de Google; reservas vía retargeting (paso 2).
- "Por conjunto", no "por local" (los conjuntos a veces son promos, no locales).
- Meta es COMPLEMENTO; no sobre-optimizar una campaña de bajo presupuesto.
