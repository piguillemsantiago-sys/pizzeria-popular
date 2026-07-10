---
name: placa-vps
description: Probar o diagnosticar la generación de imágenes IA (Gemini) del generador de placas en el VPS — el único lugar donde corre, porque GEMINI_API_KEY vive solo ahí. Sube el script por scp, lo corre por SSH, baja los PNG y los inspecciona.
---

# /placa-vps — Iterar imágenes IA en el VPS

Gemini (los fondos IA del generador de placas) NO corre en local:
`geminiDisponible()` es false porque `GEMINI_API_KEY` vive solo en el `.env` del
VPS. Para iterar o diagnosticar una placa generada por IA hay que hacer el
round-trip al VPS `pizzeria-vps` (`/var/www/pizzeria-popular`).

## Paso 1 — Preparar el script de prueba

Usar `scripts/test-placa-evento.js` como base (o escribir uno). REGLA DURA: la
PRIMERA línea del script debe ser `require('dotenv').config()` — si no, no toma
la key ni `FONTCONFIG_FILE` (las fuentes Abuget/Abril/Montserrat se resuelven por
`FONTCONFIG_FILE`→`fonts/` del proyecto, NO por `~/.fonts`) y da falsos negativos
de fuente que hacen perder tiempo.

## Paso 2 — Subir, correr, bajar

```
scp scripts/<script>.js pizzeria-vps:/var/www/pizzeria-popular/
ssh pizzeria-vps "cd /var/www/pizzeria-popular && node <script>.js"
scp pizzeria-vps:/var/www/pizzeria-popular/<salida>.png "<carpeta scratchpad>/"
```

## Paso 3 — Inspeccionar

Abrir el/los PNG con Read y criticar de verdad: legibilidad, que el SUJETO esté
presente (el bug histórico era pedir fuego y que devuelva pizza), nitidez, paleta
de marca, zona libre para el texto. Medir, no estimar. Si Claude no puede leer
imágenes en la sesión, usar `mcp__Grok__analyze_image` como fallback.

## Cambiar modelo o resolución (sin deploy)

Editar la env en el VPS + `pm2 restart pizzeria-popular --update-env`. NO requiere
deploy:
- `GEMINI_IMAGE_MODEL` — hoy `gemini-3.1-flash-image` (default en código:
  `gemini-2.5-flash-image`).
- `GEMINI_IMAGE_SIZE` — `2K` activo (Gemini entrega 1536×2752 → downscale más
  nítido). Si un modelo futuro rompe con 2K (fondos ámbar / borrosos sin sujeto),
  quitar la env y vuelve al default.

## Reglas

- La calidad depende ~70% del PROMPT (`escenaIA`), no del modelo. Primero afinar
  el prompt; subir de modelo es trivial (env var).
- El copy / `escenaIA` SÍ se testea LOCAL (usa la key de Anthropic). Solo la
  IMAGEN necesita el VPS.
- El mandato del generador es VELOCIDAD para generar+publicar placas rápido: no
  apilar chiches ni perillas.
