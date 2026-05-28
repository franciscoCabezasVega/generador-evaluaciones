This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Decisiones de arquitectura y seguridad

### Autocompletado de formulario con IA + ClickUp (AI1)

El formulario de creación/edición de tareas incluye un botón **"Autocompletar con IA"** que aparece debajo del campo Link cuando se ingresa una URL de ClickUp válida. El flujo es:

1. El cliente llama a `POST /api/tasks/ai-autofill` con `{ linkOrId }`.
2. El endpoint obtiene la tarea de ClickUp vía `GET /api/v2/task/{taskId}` (requiere `clickup_settings` configurado en Ajustes).
3. Carga los catálogos activos de la BD (`products`, `project_types`, `complexities`, `squads`, `qa_members`).
4. **Pre-resolución server-side** (antes de llamar a la IA): el squad se extrae del campo personalizado "Equipo" de ClickUp resolviendo el UUID del label contra `type_config.options`; el `product_type` se deriva del producto al que pertenece ese squad en el catálogo; el estado se mapea desde el status de ClickUp; el QA asignado se matchea por email/username contra `qa_members`. Estos valores son más confiables que lo que inferiría la IA.
5. Llama a **OpenAI gpt-4o-mini** (JSON mode) con el contexto sanitizado. La IA solo infiere: nombre, tipo de proyecto y complejidad (talla). **No infiere** mes, año ni fecha de esfuerzo — esos campos quedan con sus valores por defecto para que el usuario los complete.
6. Valida cada sugerencia contra los catálogos: cualquier valor que no exista exactamente en el catálogo se descarta (`null`) — nunca se propaga al frontend un valor inventado.
7. Los valores pre-resueltos (squad, producto, estado, QA) sobrescriben lo que haya devuelto la IA.
8. En **modo creación** con campos vacíos: aplica todas las sugerencias directamente (incluyendo squad). En **modo edición** o con campos ya completados: muestra un panel de diff con toggles por campo.

Variables de entorno requeridas: `OPENAI_API_KEY`.
La API key de ClickUp se configura cifrada en la tabla `clickup_settings` desde la sección Ajustes de la app.

Consideraciones de seguridad: todo texto proveniente de ClickUp se sanitiza con `sanitizeForPrompt()` antes de inyectarse en el prompt; el endpoint requiere sesión activa; la API key de ClickUp nunca se expone al cliente.

### Atomicidad de operaciones sobre tareas (C1)

Los endpoints `POST /api/tasks` y `PATCH /api/tasks/[id]` invocan los RPCs de PostgreSQL `create_task_with_squads` y `update_task_with_squads`. Cada RPC ejecuta tarea + squads en una sola transacción, eliminando el riesgo de inconsistencia si la segunda escritura fallaba.

### `auth.uid()` en RPCs — defensa en profundidad (C2)

Ambos RPCs obtienen el `user_id` del JWT actual vía `auth.uid()`. El payload del cliente nunca puede inyectar un `user_id` diferente, aunque RLS esté mal configurado.

### Cache de idempotencia solo para 2xx (C3)

`withIdempotency` solo almacena respuestas exitosas (HTTP 2xx). Los errores transitorios (400, 500, red) no se cachean, evitando que un retry con la misma `Idempotency-Key` reciba un error permanente por un fallo temporal anterior.

### Validación de `Idempotency-Key` (M2)

El header `Idempotency-Key` es validado con el regex `/^[a-zA-Z0-9_-]{1,128}$/`. Una clave con formato inválido devuelve `400` — nunca se degrada silenciosamente a "sin idempotencia".

### TTL del caché de auth reducido a 5 s (I1)

El caché en memoria de `getAuthContext` expira en 5 s (antes 30 s). Un usuario cuyo rol es degradado recibe `403` en máx. 5 s sin reinicio del servidor.

### Token no almacenado en caché (I3)

`AuthCacheEntry` solo guarda `{ user, role }`. El token siempre se obtiene del request actual para evitar devolver un token vencido si el cliente hizo un refresh entre peticiones.

### Timeouts de BD aislados por RPC (I4)

Los RPCs ejecutan `SET LOCAL statement_timeout = '10s'` dentro de su propio transaction scope. El `ALTER ROLE authenticated SET statement_timeout` global fue revertido (migración `reset_role_timeouts`) porque afectaba reportes y batch de IA que requieren más tiempo.

### DELETE 404 como éxito idempotente (I7)

En un entorno multi-Lambda, un `DELETE` que devuelve 404 significa "ya fue eliminado por otra instancia". `mutationQueue.ts` trata este caso como éxito en lugar de error, evitando revertir el optimistic update innecesariamente.

### Retry con jitter en `useCachedFetch` (P1)

Los reintentos de fetch usan backoff exponencial con jitter aleatorio `(0.5–1.5 × baseDelay)` para evitar thundering herd cuando múltiples componentes fallan simultáneamente. La invalidación de caché al montar también omite el primer render para no forzar refetch innecesario en cold start.

### Audit trail — cliente de servicio en `after()` (A1)

El bloque `after()` del `PUT /api/timings/[id]` usa `getServiceClient()` (service role key) en lugar del Bearer token del usuario para insertar en `audit_logs`. El token del usuario puede fallar silenciosamente en el contexto async post-response de `after()` debido a que la sesión Supabase ya no está activa al momento de la escritura. La identidad del usuario (`user_id`, `user_email`) se captura por closure desde el scope del request principal.

### Audit trail — skip cuando no hay cambios reales (A2)

Tanto el `PUT /api/timings/[id]` como `syncTaskTimings` comparan el estado anterior vs el nuevo con `normalizeEntries()` (serialización + sort estable) antes de insertar en `audit_logs`. Si los valores son idénticos, se omite el registro para evitar entradas de audit vacías.

### Audit trail — sync manual atribuido al usuario real (A3)

Cuando el usuario hace clic en "Sincronizar" desde el formulario de timing (ruta `POST /api/tasks/[id]/clickup-sync`), se pasa `userCtx: { userId, userEmail }` a `syncTaskTimings`. El audit log queda atribuido al email real del usuario en lugar de `system@cron.local`. El cron job sigue usando `system@cron.local` al no pasar `userCtx`.

### `handleEdit` fetcha datos frescos del servidor (A4)

`handleEdit` en `timings/page.tsx` hace un `GET /api/timings/[id]` directo (no cacheado) antes de abrir el formulario de edición. Esto evita abrir el form con datos stale del listado cuando un sync de ClickUp actualizó la BD entre la carga del listado y el clic en "Editar".

### Work Calendar Adjustment (W1)

`getAdjustmentFactor(qa, year, month, window?, isOngoing?, rawCalendarHoursOverride?)` en `workCalendarService.ts` calcula el ratio `workHours / calendarHours` para cada QA, descontando días OOO y feriados nacionales (multi-país vía `country_code`). El factor (~0.1935 para un mes de 18 días hábiles × 8h / 744h) se aplica a las horas calendario de ClickUp para obtener horas efectivas de trabajo. La feature está controlada por el flag `ENABLE_WORK_CALENDAR_ADJUSTMENT` en `vercel.json`.

Cuando `rawCalendarHoursOverride` está presente (= `current_status.by_minute / 60` de ClickUp), se usa como denominador en lugar del ancho de ventana calendario calculado. Esto corrige el desbordamiento de fin de semana: si ClickUp mide tiempo a través del fin de semana pero la ventana activa se recorta al viernes EOD mediante `findLastWorkingMoment`, el factor resultante compensa exactamente la diferencia.

Split cumulative/current-session: `status_history[i].total_time.by_minute` en ClickUp es acumulado (todas las sesiones pasadas). El campo `current_status.total_time.by_minute` refleja solo la sesión activa en curso. `syncTaskTimings` los trata por separado: las horas congeladas usan el factor mensual completo y las horas activas usan `rawCalendarHoursOverride` para precisión dentro de la ventana real.

Restricciones de timezone: las fechas OOO y feriados se manejan como strings `YYYY-MM-DD` en hora local. Nunca se usa `toISOString()` para evitar desfase de un día.

### ClickUp Sync — modo preview (W2)

`POST /api/tasks/[id]/clickup-sync` acepta `{ preview_only: true }` en el body. Cuando está activo, `syncTaskTimings` calcula las horas desde ClickUp y las devuelve en `preview_qa_entries` sin escribir en `timing_qa_category_hours` ni en `audit_logs`. `TimingForm` usa este modo automáticamente en edición (cuando el timing ya existe) para cargar las horas calculadas en el formulario; el guardado real ocurre al hacer submit del form. El cron job y el modo creación siempre llaman con `previewOnly=false`.

### Módulo de Evaluaciones de QA (QA1)

`/app/src/app/api/qa-evaluations/` expone un CRUD completo para evaluar a los miembros de QA por rango de fechas configurable. Cada evaluación almacena `excelencia`, `soft_skills` y `comentarios`. Las métricas `tasa_aceptacion` y `cumplimiento` se calculan en tiempo real desde las tareas y timings del período; cuando se guardan valores históricos cerrados, la API los devuelve directamente sin recalcular. La columna **Calificación final** se muestra en la tabla de Evaluaciones de QA, en Reportes de QA y en el PDF exportado; es un promedio calculado en el frontend de las cuatro métricas disponibles (`tasa_aceptacion`, `cumplimiento`, `excelencia`, `soft_skills`), excluyendo valores nulos.

### Métricas almacenadas vs. calculadas (QA2)

`qa_evaluations` tiene columnas `tasa_aceptacion numeric` y `cumplimiento numeric` nullable. `qaEvaluationService.listQAEvaluationsForRange` prioriza el valor almacenado cuando no es `NULL` (`ev.tasa_aceptacion != null`); si es `NULL` calcula en tiempo real. Esto permite registrar períodos históricos cerrados con los valores exactos de los reportes PDF sin alterar las tareas o timings subyacentes.

### `get_user_is_lead` — SECURITY INVOKER (QA3)

La función `public.get_user_is_lead` se creó directamente como `SECURITY INVOKER` con `SET search_path TO 'public', 'pg_catalog'`, `REVOKE EXECUTE FROM PUBLIC` y `GRANT EXECUTE TO authenticated`. Elimina el riesgo de escalación de privilegios y el vector de search_path hijacking. Migración: `20260526000001_add_is_lead_to_user_profiles.sql`.

### PDF — word-wrap en columna Comentarios (QA4)

`drawTable` en `qaReportPdfService.ts` usa `doc.splitTextToSize(cell, maxWidth)` para dividir el texto en líneas que caben en el ancho de columna. El alto de cada fila se calcula dinámicamente (`2 + maxLines × 3.2 + 2 mm`) en lugar de usar un alto fijo, evitando truncamiento de comentarios largos en el PDF exportado.

### Auth loading watchdog (I5)

`ClientProviders` arranca un timer de 15 s cuando `authLoading` es `true`. Si la carga de sesión no resuelve antes de ese límite (lock de Supabase atascado, red cortada, etc.) ejecuta `window.location.reload()` automáticamente. El timer se cancela si `authLoading` resuelve normalmente. En consola aparece `[auth] Watchdog: carga de sesión bloqueada >15s, recargando página...` para facilitar el diagnóstico.

### SessionManager — `_inflight` preservado entre timeouts de caller (I6)

`SessionManager.getSession()` apuntaba `_inflight` al resultado de `Promise.race([realCall, timeout])`. Cuando el timeout de un caller vencía, `_inflight` se ponía a `null` y el siguiente reintento creaba una **nueva** llamada a `supabase.auth.getSession()`, que competía por el mismo `navigator.lock` → cascada de timeouts en todos los `useCachedFetch` simultáneos.

Ahora `_inflight` apunta a la promesa **real** (mismo patrón que `_refreshInflight`). El timeout es por caller exclusivamente: si vence, solo rechaza para ese caller, pero `_inflight` sigue vivo. Los reintentos de `useSafeAuthFetch` y la llamada de `SessionChecker` se coalescen en la misma promesa sin añadir presión al lock. Cuando Supabase libera el lock, la promesa resuelve una sola vez y todos los callers reciben el resultado.

`SessionChecker` también retrasa su primera validación 8 s para evitar competir con los fetches de carga inicial de página.

### Cron ClickUp — guarda de día laboral (W3)

`GET /api/cron/sync-clickup-timings` verifica el día de la semana en zona horaria `America/Bogota` antes de ejecutar el sync. Los sábados y domingos retorna `{ ok: true, skipped: true, reason: "non-working day" }` sin llamar a `syncAllEnabledTasks`. Esto evita que el sync corra en fin de semana y genere horas infladas por tiempo no laboral medido por ClickUp fuera de la ventana activa. El cron-job.org recibe un 200 normal (no genera alertas falsas).

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
