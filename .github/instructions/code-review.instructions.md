---
applyTo: "**"
---

# Instrucciones de revisión de código — Evaluador de Tareas

## Regla principal: leer antes de sugerir

Antes de proponer cualquier cambio, sigue estos pasos **en orden**:

1. **Primero**, analiza los comentarios en el código (tanto en la misma línea como en bloques) — documentan decisiones deliberadas de diseño.
2. **Luego**, revisa el historial de commits (`git log`) y sus mensajes — explican el "por qué" de cada cambio.
3. **Finalmente**, consulta los PRs y code reviews anteriores — contexto de discusiones ya resueltas.

Si el código tiene un comentario que justifica una decisión, **no sugieras invertir esa decisión** sin confirmar primero que entiendes sus implicancias y sus efectos en la lógica de negocio.

Si no existe documentación, comentarios ni contexto previo disponible para un fragmento de código, **indícalo explícitamente en tu revisión** y procede con precaución, señalando las incertidumbres antes de sugerir cambios.

---

## Evaluar impacto antes de recomendar

Para cada sugerencia responde estas preguntas antes de proponerla:

- ¿Este cambio puede romper lógica de negocio existente?
- ¿Existen tests (Jest/Playwright) que cubran este comportamiento? Si los hay, ¿seguirían pasando?
- ¿La capa de API o la base de datos dependen del valor/formato actual?
- ¿Existe una razón documentada (comentario, commit, PR) por la que el código está así?

Si no estás seguro del impacto del cambio o si la documentación no es concluyente, **menciona el riesgo explícitamente** en tu comentario en lugar de solo proponer el cambio.

---

## Cambios de alto riesgo — nunca aplicar sin confirmación explícita

- Modificar lógica de cálculo de notas (`scoreCalculator.ts`)
- Cambiar el esquema de la base de datos (migraciones)
- Alterar la lógica de autenticación / sesión / tokens
- Reorganizar o renombrar rutas de API (`/api/tasks`, `/api/reports`, etc.)
- Modificar la relación entre `month`/`year` (periodo de evaluación) y `effort_score_date` (fecha de esfuerzo) — **son campos independientes por diseño**

---

## Respetar los comentarios de intención

Los comentarios que empiezan con `// INTENTIONALLY`, `// by design`, `// deliberate`, `// month/year and effort_score_date are independent` o similares señalan código validado conscientemente. Tratalos como contratos: **no sugieras cambiarlos**.

---

## Convenciones del proyecto

- **Fechas locales**: usar `new Date()` construyendo strings `YYYY-MM-DD` con `getFullYear/getMonth/getDate`. **Nunca usar `toISOString()`** para valores de fecha que el usuario ingresa — genera mismatch de timezone.
- **Constantes de runtime** (que dependen de `new Date()`): deben vivir dentro del componente o función, **no como module-level statics**, para que reflejen el valor real en el momento de uso.
- **Validaciones**: deben existir en frontend **y** en la API. No simplificar validaciones asumiendo que "son redundantes".
- **Cache**: `useCachedFetch` + `invalidateCache(key)` — no proponer fetches directos sin pasar por este patrón.
- **Audit log**: se registra en CREATE/UPDATE/DELETE; no modificar sin revisar el patrón `after()`.
- **Scores**: base 10; penalizaciones: grave −1.50, media −0.75, baja −0.50 cada 5. Mínimo 0.
- **Tareas Deprecadas/Pendientes**: excluidas de promedios y reportes — no alterar esta lógica.

---

## Qué NO hacer

- No sugerir `toISOString()` para campos de fecha visibles al usuario.
- No mover constantes de runtime fuera del componente como module-level statics.
- No agregar lógica de negocio nueva sin validar si ya existe equivalente en la API.
- No simplificar validaciones existentes.
- No proponer cambios en la lógica de reportes o versionado sin leer `reports/route.ts` completo.
