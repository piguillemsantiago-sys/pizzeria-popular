# Auditoría del Generador — 2 jul 2026

Alcance: sección Generador del panel (`lib/generador.js`, `lib/banco.js`, `lib/referencia.js`, rutas `/api/admin/gen/*` en `index.js`, frontend en `public/admin/admin.js` líneas ~1442-1853).

Objetivo del dueño de la herramienta: generar rápido el contenido de historias, carruseles y las imágenes a usar. Queja actual: comete muchos errores, no gusta el diseño ni los resultados.

---

## Cómo funciona hoy (resumen)

1. **Generar copy** → Claude (opus-4-7) escribe JSON con caption + placas (título/acento/bajada/cta/lugar/escenaIA/pistas/banderas/evento). Después OTRA llamada a Opus elige fotos del banco (450 descripciones de catálogo en el prompt).
2. El panel muestra las placas como formularios editables + foto (Otra/Cambiar/IA).
3. **Componer piezas** → por cada placa: baja la foto (Drive/Gemini/URL), sharp compone texto SVG con fórmulas (wrap por caracteres, tamaños por heurística, ubicación del bloque por stdev de franjas), sube a Supabase storage.
4. **"¿Querés cambiar algo?"** → ajustarCopy (Opus) + interpretarRetoque (Haiku) en paralelo → merge → recompone TODO.

---

## A. Bugs concretos (el "comete muchos errores")

### A1. `max_tokens: 1500` trunca los carruseles — CRÍTICO
`generador.js:239` (generarCopy) y `:327` (ajustarCopy). Un carrusel de 4-5 placas con escenaIA de 2-4 oraciones + 3-4 pistas por placa + caption supera fácil los 1500 tokens de salida → JSON cortado → `parseJsonIA` devuelve null → reintento a ciegas (mismo límite) → "La IA no devolvió un copy válido" después de ~40s de espera.
**Fix:** subir a 4000 y usar structured outputs (ver A5).

### A2. El ajuste BORRA banderas y evento — CRÍTICO
El estado que se le pasa al modelo en `ajustarCopy` (`generador.js:311-319`) NO incluye banderas ni evento, pero el JSON de ejemplo del AJUSTE_SYSTEM sí los muestra (`"banderas": [], "evento": ""`). El modelo no puede "devolver las mismas que ya tiene la placa" porque no las ve → devuelve `[]`/`""` → el merge del route (`index.js:834-835`: `nu.banderas != null ? nu.banderas : ...`) pisa las reales.
**Síntoma:** placa de partido con banderas + "EN VIVO" → pedís "título más grande" → desaparecen las banderas y el cartel.
**Fix:** incluir banderas/evento en el estado que ve el modelo, y en el merge tratar `[]`/`""` como "no tocar" salvo que la instrucción los mencione.

### A3. El ajuste reescribe campos no pedidos — ALTO
El AJUSTE_SYSTEM devuelve SIEMPRE todos los campos; el merge aplica `nu.titulo != null ? nu.titulo : orig.titulo` — como nunca es null, cualquier paráfrasis del modelo pisa el original en silencio. Es exactamente el problema ya documentado en memoria ("ajuste: no sobrescribir el pedido").
**Fix:** con structured outputs, hacer los campos opcionales y pedir devolver SOLO los campos cambiados; el merge conserva `orig` para todo lo omitido.

### A4. El caption editado a mano se pierde — MEDIO
`#genCaption` no tiene listener de input (verificado: solo se escribe en admin.js:1590 y :1840, nunca se lee del DOM). Editás el caption a mano → "Aplicar y rehacer" manda `genState.caption` (el viejo) → tu edición vuela.
**Fix:** listener `input` → `genState.caption = value` (1 línea + bump de `?v=` en index.html).

### A5. JSON por regex, sin garantías — MEDIO (causa raíz de varios errores)
`parseJsonIA` (generador.js:126) + `match(/\{[\s\S]*\}/)` en banco.js:196 y referencia.js:78. La API ya soporta **structured outputs** (`output_config: {format: {type: "json_schema", schema: ...}}`) que garantiza JSON válido conforme al schema — sin reintentos, sin parseo frágil, sin campos con tipos inesperados.
**Fix:** migrar las 5 llamadas (copy, ajuste, elección de fotos, guía de estilo, retoque). Elimina toda la clase de errores de parseo.

### A6. Estilo aleatorio en cada generación — MEDIO
`generador.js:251-252`: el diseño (clasico/editorial/titular/sandwich/producto) se asigna con `Math.random()`. Misma instrucción → resultado distinto cada vez. Impredecible = sensación de "comete errores".
**Fix:** que la IA elija el estilo según el contenido (campo `estilo` en el schema del copy con guía de cuándo usar cada uno: producto→producto, anuncio→sandwich, etc.). Determinístico y con criterio.

### A7. Modelos viejos hardcodeados — MEDIO
`claude-opus-4-7` hardcodeado en 5 lugares (generarCopy, ajustarCopy, afinarPromptIA, sugerirEscenaBlog, elegirFotos). Solo el retoque tiene env var. Vigentes hoy: `claude-opus-4-8` ($5/$25 MTok, mismo precio que 4.7) y `claude-sonnet-5` ($3/$15, intro $2/$10 hasta ago 2026) que alcanza calidad casi-Opus en este tipo de tarea.
**Fix:** `CLAUDE_COPY_MODEL` en env (mismo patrón que ya usamos con GEMINI_IMAGE_MODEL: cambiar = env + restart, sin deploy). Default `claude-opus-4-8`.

---

## B. Por qué los resultados no convencen (arquitectura)

### B1. Nadie MIRA la pieza antes de mostrarla — LA CAUSA RAÍZ
Todo el pipeline de composición es open-loop: wrap por cantidad de caracteres, tamaño del acento por `ancho/(len*0.46)`, ubicación del texto por stdev de franjas de grises (una zona "lisa" no es una zona "segura": puede ser la pizza). Ningún humano ni IA ve el resultado antes que vos. Nuestra propia regla de trabajo ("verificar diseño con capturas antes de avisar") no está incorporada al producto.
**Fix propuesto:** pase de **crítica visual**: tras componer, mandar la pieza (thumbnail ~700px) a Claude vision con checklist concreta (¿el texto tapa al sujeto? ¿la cursiva se lee? ¿jerarquía correcta? ¿el logo choca con algo?) → si detecta problema, auto-corregir UNA vez (mover bloque/achicar/reforzar scrim) y recomponer. Costo: 1 llamada Haiku/Sonnet con imagen por placa (~centavos), +3-5s. Ataca directo "los resultados que me da".

### B2. Elegís con palabras, no con los ojos
Flujo actual: 1 resultado → describir el cambio en texto → esperar recomposición completa → ver. Para una tarea visual el loop debería ser: **2-3 variantes lado a lado → clic en la que te gusta**. Elegir > describir. (Coherente con memoria "diseño: no abrumar": pocas opciones aterrizadas, con render real.)

### B3. Lento: composición secuencial + recompone todo
- `generarPiezas` compone placa por placa (~8s c/u → carrusel 5 = ~40s). Componer en paralelo (pool de 3) → ~10-15s.
- El ajuste recompone TODAS las placas aunque cambies una palabra de una. Recomponer solo las placas afectadas.
- `elegirFotos` manda 450 descripciones a Opus en cada generación (~15-20k tokens input, lento). Mitigable con prompt caching (el catálogo como prefijo cacheado) o pre-filtrado por tipo.

### B4. Sin memoria de lo que funcionó
Cero few-shot: cada copy arranca de cero, solo con el system prompt + guía de estilo (4 imágenes descriptas por Haiku). No hay biblioteca de copies aprobados que anclen el tono real de la marca.
**Fix liviano:** guardar los últimos N copies que SÍ se compusieron (señal de aprobación implícita) y meter 2-3 como ejemplos en el prompt.

### B5. Sin historial ni persistencia
`genState` vive en memoria del navegador: F5 = perdiste todo. Las piezas quedan en storage (`social/<timestamp>-*.jpg`) pero no hay galería para verlas, reusarlas ni duplicarlas. Tampoco se pueden agregar/quitar/reordenar placas de un carrusel.

### B6. Detalles de UX que suman fricción
- Errores y avisos por `alert()` (hasta 3 modales encadenados tras generar).
- El dropdown de formato post-generación no hace nada (formato queda fijado al generar) — confunde.
- Los estilos del dropdown no tienen preview visual ("Editorial (serif a la izquierda)" no le dice nada al ojo).
- No hay botón "copiar caption" ni descarga en lote.

---

## C. Lo que está BIEN (no tocar)

- Cache de imagen IA entre recomposiciones (fricción #1 ya resuelta).
- Medición de tinta real para apilar texto (clave con Abuget).
- Banco indexado con descripciones IA + "dame otra" con exclusiones.
- Saneo post-IA (inclusivo, truncados con avisos visibles).
- Reglas honestas (no inventar promos, prohibido "pantalla gigante").
- Guía de estilo desde las 4 referencias más recientes, cacheada por firma.

---

## Plan propuesto (acotado, en fases)

### Fase 1 — Matar los errores (1 sesión de trabajo)
1. `max_tokens` 1500 → 4000 en copy y ajuste (A1).
2. Structured outputs en las 5 llamadas → JSON garantizado (A5).
3. Ajuste conservador: schema con campos opcionales + "devolvé solo lo que cambia"; banderas/evento visibles en el estado y nunca pisados por vacío (A2, A3).
4. Listener del caption (A4).
5. Estilo elegido por la IA, no random (A6).
6. `CLAUDE_COPY_MODEL` por env, default `claude-opus-4-8` (A7).

### Fase 2 — REDEFINIDA (pedido del dueño, 2 jul): placa completa por IA con marca en claro
Visión: que la IA genere la placa COMPLETA ya diseñada (no solo el fondo), sabiendo
de antemano la identidad de la marca. "Como Gemini", con un redactor de prompts experto.

7. **Brand Kit** editable en el panel, persistido en Supabase: paleta hex (GOLD #D8A460,
   DARK #171310), tipografías descriptas para IA (serif editorial alto contraste /
   cursiva manuscrita fina dorada / sans limpia), mood fotográfico (horno de leña,
   madera, luz cálida), tono, reglas duras (no "pantalla gigante", rioplatense).
   Se inyecta en TODO prompt de imagen + 1-2 placas de referencia adjuntas como guía visual.
8. **Redactor de prompts experto** como corazón del flujo (no opcional como hoy):
   brief del usuario → prompt de director de arte completo (escena, composición vertical,
   textos EXACTOS entre comillas y su ubicación, tipografía, paleta, luz, negativos).
9. **Modo "placa completa IA"** junto al modo actual: Gemini genera diseño+texto;
   verificación OBLIGATORIA con Claude vision (leer los textos renderizados y comparar
   con el copy; si un dato duro salió mal → regenerar). Logo real SIEMPRE compuesto
   encima con sharp (tipografía IA es aproximada; el logo no se negocia).
10. Trade-off documentado: tipografía exacta (Abuget/Abril) solo en el modo clásico;
    el modo IA la aproxima. Datos críticos (fechas/precios/direcciones) → verificados
    o en modo clásico.
11. (Sigue valiendo) Crítico visual también para el modo clásico (B1) + composición
    en paralelo (B3).

### Fase 3 — Flujo de trabajo real
10. Galería/historial de piezas generadas (ya están en storage; falta listarlas) + duplicar.
11. Copiar caption + descargar lote.
12. Few-shot con copies aprobados (B4).
13. Agregar/quitar/reordenar placas de carrusel.

**Recomendación:** Fase 1 completa + item 7 (crítico visual) primero. Eso ataca directo las dos quejas: "comete errores" y "no me gustan los resultados". Fase 2/3 según cómo se sienta después.

---

*Verificación pendiente al implementar: probar carrusel de 5 placas end-to-end, ajuste sobre placa de partido (banderas deben sobrevivir), edición de caption + rehacer.*
