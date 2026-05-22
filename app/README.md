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

`getAdjustmentFactor(qa: QAWorkConfig, year, month, window?)` en `workCalendarService.ts` calcula el ratio `workHours / calendarHours` para cada QA, descontando días OOO (Out-of-Office) y feriados nacionales (multi-país vía `country_code`). El factor (~0.215 para un mes completo de 8h/24h) se aplica a las horas calendario de ClickUp para obtener horas efectivas de trabajo. La feature está controlada por el flag `ENABLE_WORK_CALENDAR_ADJUSTMENT` en `vercel.json`.

Restricciones de timezone: las fechas OOO y feriados se manejan como strings `YYYY-MM-DD` en hora local (Colombia, UTC-5). Nunca se usa `toISOString()` para evitar desfase de un día.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
