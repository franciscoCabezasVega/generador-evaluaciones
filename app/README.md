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

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
