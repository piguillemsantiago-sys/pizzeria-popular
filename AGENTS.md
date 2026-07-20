# Agency OS — Web y panel de Pizzería Popular

## Repositorio

- Función: web pública, panel administrativo, chatbot Pepe, APIs, analítica, reseñas GBP y generadores de contenido de Pizzería Popular.
- Stack: Node.js + Express, HTML/CSS/JavaScript vanilla, Supabase, integraciones Google/Anthropic y tareas cron.
- Rama productiva: `main` con upstream `origin/main`.
- Producción: VPS propio; `bash deploy.sh` sincroniza por SSH, instala dependencias, reinicia PM2 y verifica salud. El push Git es respaldo y, según el flujo vigente, no despliega el VPS por sí solo.
- Colaboración: el historial local muestra un único autor humano, pero el proyecto usa datos/infraestructura compartidos con Grupo AJAX y tiene trabajo coordinado desde otros flujos. Tratarlo como compartido y nunca sobrescribir trabajo ajeno.

## Inicio de jornada

1. Leer solo el contexto necesario de `handoff.md`, `memory.md` y documentación vigente; tratar lo fechado como potencialmente desactualizado.
2. Ejecutar `git status`.
3. Ejecutar `git fetch --prune` por separado.
4. Comprobar rama, upstream, ahead/behind, cambios locales y operaciones Git en curso.
5. Detenerse ante divergencia, conflictos, cambios desconocidos o indicios de trabajo de otra persona.
6. Hacer fast-forward únicamente si es inequívocamente seguro, el pedido lo autoriza y el flujo existente lo permite. Nunca hacer pull, merge o rebase por iniciativa propia.

## Autonomía y límites

Se permiten automáticamente lecturas, diagnóstico, modificaciones solicitadas, verificaciones seguras, commits explícitamente pedidos y push de ramas no productivas. Nunca sobrescribir trabajo de otra persona.

Tratar como seis acciones separadas, cada una con su propio estado y autorización:

1. documentación;
2. commit;
3. push de rama no productiva;
4. merge;
5. push a `main`;
6. deploy al VPS.

Detenerse antes de merge a producción, push a `main`, `bash deploy.sh`, migraciones, cambios de datos, operaciones destructivas o cualquier acción difícil de revertir. Si en el futuro un push a `main` pasa a activar producción, exigir autorización explícita conjunta de push y deploy.

Nunca usar `railway up`. Nunca mostrar, copiar, registrar ni versionar secretos, `google-drive-key.json`, tokens ni valores de `.env`. Mantener intactas las configuraciones y skills de Claude Code salvo pedido explícito.
