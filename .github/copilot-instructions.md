# Copilot Instructions — Evaluador de Tareas

## Contexto del proyecto

Aplicación Next.js 15+ (App Router) con Supabase Auth, PostgreSQL y TypeScript.
Gestiona la evaluación mensual de tareas por squad, cálculo automático de notas, reportes
versionados y generación de comentarios por IA.

---

## Reglas de revisión de código

> **Orden de prioridad al revisar:** 1 → Leer contexto existente · 2 → Evaluar impacto · 3 → Verificar si es cambio de alto riesgo · 4 → Respetar comentarios de intención. Solo proponer un cambio si ninguna regla anterior lo bloquea.

### 1. Leer antes de sugerir

Antes de proponer cualquier cambio, analiza:

- Los comentarios en el código (tanto en la misma línea como en bloques separados) — documentan decisiones deliberadas de diseño.
- El historial de commits (`git log`) y sus mensajes — explican el "por qué" de cada cambio.
- Los PR y code reviews anteriores — contexto de discusiones ya resueltas.

Si el código tiene un comentario que justifica una decisión (p. ej. `// month/year and effort_score_date are independent`), **no sugieras invertir esa decisión** sin primero confirmar que entiendes las implicancias.

### 2. Evaluar el impacto antes de recomendar

Para cada sugerencia pregúntate:

- ¿Este cambio puede romper lógica de negocio existente?
- ¿Existen tests (Jest/Playwright) que cubran este comportamiento? Si los hay, ¿seguirían pasando?
- ¿La capa de API o la base de datos dependen del valor/formato actual?
- ¿Existe una razón documentada (comentario, commit, PR) por la que el código está así?

Si alguna respuesta es dudosa, menciona el riesgo explícitamente en tu comentario en lugar de solo proponer el cambio.

### 3. Cambios de alto riesgo — pedir confirmación

Los siguientes tipos de cambios **nunca deben aplicarse sin confirmación explícita**:

- Modificar lógica de cálculo de notas (`scoreCalculator.ts`)
- Cambiar el esquema de la base de datos (migraciones)
- Alterar la lógica de autenticación / sesión / tokens
- Reorganizar o renombrar rutas de API (`/api/tasks`, `/api/reports`, etc.)
- Modificar la relación entre `month`/`year` (periodo de evaluación) y `effort_score_date` (fecha de esfuerzo) — son campos independientes por diseño

### 4. Respetar los comentarios de intención

Los comentarios que empiezan con `// INTENTIONALLY`, `// by design`, `// deliberate` o similares
señalan código que fue revisado y validado conscientemente. Respétalos como contratos.

---

## Convenciones del proyecto

- **Validaciones**: deben existir en frontend Y en la API (`/api/tasks/route.ts`).
- **Años válidos**: solo desde el año en curso en adelante (`new Date().getFullYear()`).
- **Scores**: base 10, penalizaciones por devoluciones (grave −1.50, media −0.75, baja −0.50 c/5). Mínimo 0.
- **Tareas Deprecadas/Pendientes**: excluidas de promedios y reportes.
- **Audit log**: se registra en CREATE/UPDATE/DELETE; no modificar sin revisar el patrón `after()`.
- **Cache**: `useCachedFetch` + `invalidateCache(key)` — no hacer fetches directos sin pasar por este patrón.
- **Fechas locales**: usar `new Date()` y construir strings `YYYY-MM-DD` con `getFullYear/getMonth/getDate` (local), **nunca** `toISOString()` para valores que el usuario ingresa.

---

## Qué NO hacer

- No sugerir `toISOString()` para campos de fecha visible al usuario (genera mismatch de timezone).
- No mover constantes de "runtime" (que dependen de la fecha actual) fuera del componente como módulo-level statics.
- No agregar lógica de negocio nueva sin validar si ya existe un equivalente en la API.
- No simplificar validaciones existentes asumiendo que "son redundantes".
- No proponer cambios en la lógica de reportes o versionado sin leer `reports/route.ts` completo.
