---
name: deploy-pp
description: Deploy guiado de Pizzería Popular al VPS con los guardarraíles que ya causaron incidentes (carpeta correcta, cache-busting del admin, validar boot, avisar untracked, verificar por SSH). Envuelve deploy.sh, no lo reemplaza.
---

# /deploy-pp — Deploy al VPS con guardarraíles

Deja en producción un cambio de Pizzería Popular. Producción = VPS DigitalOcean
`167.99.240.64` (alias SSH `pizzeria-vps`, usuario deploy), app en
`/var/www/pizzeria-popular` con pm2 (proceso `pizzeria-popular`), servida en
`grupoajax.es` + panel en `grupoajax.es/admin`. Deploy = `bash deploy.sh` (tar
por SSH). NUNCA Railway, NUNCA `railway up`, NUNCA `git pull` en el server.

## Paso 1 — Preflight (antes de tocar el server)

1. **Carpeta correcta.** Confirmar que el cwd es `C:\Dev\pizzeria-popular` y NO
   la carpeta de Documents (que es solo assets). Si estás en Documents, parar y
   cambiar de carpeta.
2. **Cache-busting del admin.** Si el diff tocó `public/admin/admin.js` o
   `public/admin/admin.css`, verificar que se haya bumpeado el `?v=N` en
   `public/admin/index.html`. Si no, bumpearlo — si no, el cambio NO se ve (los
   .js/.css se cachean; solo el .html es no-cache).
3. **Boot local.** `deploy.sh` sube TODO el working tree y un error de sintaxis
   en cualquier archivo requerido tumba pm2 al reiniciar. Validar que bootea:
   `PORT=3999 node index.js` en background + `curl -s -o /dev/null -w '%{http_code}' http://localhost:3999/`
   debe dar 200; después cortarlo. Si no bootea, NO deployar.
4. **Untracked a prod.** `deploy.sh` sube el working tree, NO lo commiteado: los
   archivos sin trackear van igual a producción y el estado git ≠ lo desplegado.
   Correr `git status` y avisar de untracked/modificados que subirían sin querer.

## Paso 2 — Deploy

```
bash deploy.sh
```

## Paso 3 — Verificar (por SSH, NUNCA curl externo)

El sitio público está detrás de un WAF que da 403 a requests automatizados → el
curl externo no sirve. Verificar por SSH:

```
ssh pizzeria-vps "pm2 describe pizzeria-popular; curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/"
```

- pm2 debe estar `online` y sin restarts nuevos (un loop de restarts = boot roto).
- El curl interno debe dar 200.
- Confirmar que el código NUEVO llegó: grep de un token único del cambio en el
  archivo del server, ej.
  `ssh pizzeria-vps "grep -c '<token>' /var/www/pizzeria-popular/<archivo>"`.

## Paso 4 — Respaldo

Los cambios en vivo suelen quedar sin commitear. Hacer `git push` para respaldar
(repo `github.com/piguillemsantiago-sys/pizzeria-popular`, branch main).

## Reglas

- Si el boot del Paso 1 falla, NO deployar: se cae producción.
- Si el cambio es visual (web / placa / panel), sacar captura y criticar antes de
  avisar al dueño (ver /placa-vps y el protocolo de "verificar diseño con capturas").
- Cambiar modelo/tamaño de Gemini NO necesita deploy: es env var en el VPS +
  `pm2 restart pizzeria-popular --update-env`.
