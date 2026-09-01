---
name: auditar-ficha
description: Genera o refresca la checklist SEO de una ficha de Google Business Profile por local (Pizzería Popular), ordenada por impacto y con textos listos para pegar; también verifica que lo aplicado a mano quedó bien. Todo manual en el dashboard hasta que Google apruebe la GBP API.
---

# /auditar-ficha <local> — Higiene de ficha GBP por local

Locales en alcance: `luceros`, `playa-san-juan`, `benidorm`, `russafa`,
(`santa-clara` cerró el 1/9/2026, no se audita). **Boadilla EXCLUIDA** (no tocar esa ficha). Las guías viven en
`gbp-fichas/<local>.md` + `gbp-fichas/00-resumen.md`.

## Paso 1 — Estado público real

Leer el `place_id` del local en `google-places.js` y pegar la Places API
(`GOOGLE_PLACES_API_KEY`) para el estado real: nombre+emoji, dirección, web
(http/https y si carga), nivel de precio, nº de fotos, rating, nº de reseñas.

Si no hay `GOOGLE_PLACES_API_KEY` a mano, caer al flujo manual: pedirle al dueño
la lista "Información completa" del dashboard GBP — esa lista es la fuente de
verdad de los campos que Google marca como faltantes.

## Paso 2 — Diffear y (re)generar la checklist

Comparar contra la ficha sana y (re)generar `gbp-fichas/<local>.md` con la
checklist ORDENADA POR IMPACTO:
- **Conversión:** menú → reservas (RESTOO) → chat (WhatsApp) → fotos.
- **Datos:** dirección → precio → descripción → categorías → atributos →
  horarios+festivos → web.
- **Contenido:** productos → Q&A → reseñas.

Reusar los bloques ya escritos en `00-resumen.md` (redirect `/carta/<slug>`, URL
RESTOO por local, 8 productos reales de la carta, festivos Comunitat Valenciana,
plantillas Q&A) y dejar los textos listos para pegar (descripciones medidas
600–660 caracteres).

**Modo verificación:** re-pegar la API y marcar ✅/❌ lo ya aplicado (control
recurrente: PSJ "vieron el menú" a mediados de julio, botón Reservar de Benidorm
~9/07).

## Reglas duras (decisiones del dueño — NO re-proponer)

- Ignorar sugerencias de PAGO de Google (Crear anuncio / Anunciar): no cuentan.
- NUNCA marcar un atributo que no sea verídico (celíacos solo con protocolo
  confirmado en cocina; no copiar de otra sede ni inferir de una reseña).
- El emoji 🍕 del nombre SE QUEDA. Sin landing por local.
- Sitio web = `https://grupoajax.es/` hasta recuperar pizzeriapopular.es. Link de
  menú: NUNCA la URL cruda de Railway; usar `grupoajax.es/carta/`.
- Honestidad SEO: descripción / posts / respuestas NO rankean el Local Pack
  (sirven a conversión, se hacen igual). Lo que rankea: reputación, nombre
  conforme, NAP consistente, categorías y atributos verídicos.
- Todo se aplica A MANO en el dashboard: la GBP API sigue bloqueada (caso
  `1-2509000040750`).
