[![CI](https://github.com/franciscoCabezasVega/generador-evaluaciones/actions/workflows/ci.yml/badge.svg)](https://github.com/franciscoCabezasVega/generador-evaluaciones/actions/workflows/ci.yml)

# Generador de Evaluaciones

Sistema integral y configurable de gestión y evaluación de tareas mensuales por equipo, con catálogos completamente personalizables (tipos de sistema, equipos, tipos de proyecto, complejidades y miembros QA), cálculo automático de notas, generación de reportes versionados, soporte de IA para comentarios cualitativos, auditoría completa y pipeline CI/CD con tests automatizados.

---

## Descripción General

Aplicación web desarrollada con **Next.js 16** y **TypeScript** que permite a cualquier organización registrar, evaluar y analizar tareas completadas mensualmente por equipo. Los catálogos (tipos de sistema, equipos, tipos de proyecto, complejidades y miembros QA) son completamente gestionables desde la interfaz, sin necesidad de tocar código. El sistema calcula automáticamente las notas basadas en devoluciones (graves, medias y bajas), genera reportes detallados versionados y utiliza IA para generar comentarios sobre desempeño y comunicación.

---

## Características Principales

### Autenticación y Seguridad
- **Supabase Auth**: Autenticación delegada, sin manejo directo de credenciales
- **Row Level Security (RLS)**: Control granular de acceso por usuario y rol
- **Protección de Rutas**: Middleware de autenticación en rutas protegidas
- **Manejo de Sesión**: Validación de JWT y verificación de integridad cada 5 minutos (cubierta por `onAuthStateChange` para cambios en tiempo real)
- **Login mejorado**: Toggle mostrar/ocultar contraseña + opción "Recuérdame" que persiste el email en `localStorage`
- **Logout Seguro**: `signOut` con timeout de 3 s para evitar bloqueos por `navigator.lock`; limpieza garantizada de `localStorage` en bloque `finally`; fallback de redirect tras 6 s si `clearSession` se bloquea

### Resiliencia y Manejo de Errores de Red
- **Timeout Automático**: 15 segundos por request
- **Reintentos Inteligentes**: 3 intentos totales con backoff exponencial (1s → 2s → 4s)
- **Modales Informativos**: NetworkErrorModal, SessionExpirationModal, SessionExpiredModal
- **Recuperación Automática**: Reintentos sin acción del usuario
- **SessionLockError**: Hasta 3 reintentos con delay incremental (2 s → 3 s → 4 s) cuando `navigator.lock` de Supabase está ocupado (p.ej. al volver de otra pestaña); ya no fuerza `window.location.reload()` — propaga el error a la UI para mostrar un banner contextual
- **`warmSession()`**: Pre-calienta el caché de sesión antes de lanzar fetches en paralelo (p.ej. carga de catálogos), evitando que las N peticiones compitan individualmente por el lock
- **Caché de sesión**: TTL de 5 minutos para reducir llamadas a `getSession` y contención de `navigator.lock` en escenarios multi-pestaña
- **MutationQueue resiliente**: `HTTP 409` en `POST` se trata como éxito idempotente (el recurso ya existe en el servidor); `SessionLockError` no consume un intento del presupuesto de reintentos — reintenta en 2 s automáticamente
- **Idempotency-Key automático**: El `MutationQueue` genera un UUID por mutación y lo envía como header `Idempotency-Key`; los API routes (POST/PATCH/DELETE) lo verifican contra un cache en proceso (TTL 5 min) y devuelven la respuesta cacheada si la clave ya fue procesada, eliminando duplicados por doble-click o reconexión
- **MutationQueueContext**: React context/provider que expone `useMutationQueue()` para que cualquier componente pueda encolar mutaciones, consultar estado (`pending`, `failed`, `processing`, `retryingCount`) y relanzar fallos (`retryFailed`)
- **QueueStatusIndicator**: Componente en la Navbar que refleja en tiempo real el estado de la cola — muestra "Reintentando..." cuando hay reintentos activos, spinner de sincronización, advertencia con botón "Reintentar" si hay fallos permanentes, y aviso de sin conexión cuando `navigator.onLine === false`
- **Feedback de reintento en formulario**: El botón de submit muestra `Reintentando X/N...` mientras `useSafeAuthFetch` reintenta, eliminando el `safetyTimer` de 10 s que re-habilitaba el botón prematuramente y causaba envíos duplicados
- **Auth cache en servidor**: `getAuthContext()` hashea el JWT con SHA-256 y cachea el resultado en memoria (TTL 30 s) con coalescing de Promises concurrentes, reduciendo de 2 RTTs a Supabase por request a 0 en el caso caliente
- **Audit logs no bloqueantes**: Los registros de auditoría en POST/PATCH/DELETE se escriben vía `after()` de Next.js, sin bloquear la respuesta al cliente
- **BroadcastChannel de sesión**: Cuando el caché de sesión se invalida en una pestaña (p. ej. logout), se propaga inmediatamente al resto de pestañas vía `BroadcastChannel`, evitando que operen con un JWT obsoleto
- **Adaptive timeouts en escritura**: `useSafeAuthFetch` usa timeouts más cortos para peticiones de lectura y más largos para mutaciones, con backoff automático en reintentos

### Gestión de Tareas (CRUD)
- Crear, editar, eliminar y listar tareas con validaciones completas
- Estados de tarea: **Completada**, **Deprecada**, **Pendiente**
- Cálculo de nota automático en tiempo real

### Campos de Tarea
| Campo | Descripción |
|-------|-------------|
| Nombre | Descripción de la tarea |
| Link | URL o referencia de la tarea |
| Tipo de sistema | Configurable desde el catálogo de productos |
| Equipo (squad) | Dinámico según el tipo de sistema seleccionado; definido en catálogo |
| Estado | Completada, Deprecada o Pendiente |
| Devoluciones bajas | Enteros positivos (default 0) |
| Devoluciones medias | Enteros positivos (default 0) |
| Devoluciones graves | Enteros positivos (default 0) |
| Notas adicionales | Texto libre para contexto de IA |
| Mes / Año | Asignados por defecto con fecha actual |

### Cálculo Automático de Notas

**Nota base**: 10 puntos

| Tipo | Penalización |
|------|-------------|
| Cada devolución grave | -1.50 puntos |
| Cada devolución media | -0.75 puntos |
| Cada 5 devoluciones bajas | -0.50 puntos |

- La nota mínima posible es **0**.
- Solo tareas en estado **Completada** se consideran para la nota final del squad.
- La nota final del squad es el **promedio** de las notas de todas las tareas completadas del mes.

**Ejemplos de cálculo:**

| Escenario | Graves | Medias | Bajas | Nota |
|-----------|--------|--------|-------|------|
| Sin devoluciones | 0 | 0 | 0 | **10** |
| Solo graves | 2 | 0 | 0 | **7** |
| Combinadas | 3 | 4 | 7 | **2** |
| Bajo cero (clamp) | 15 | 0 | 0 | **0** |

### Validaciones
- **Frontend**: Validación inmediata con feedback visual
- **Backend**: Validaciones de integridad y seguridad
- **Campos numéricos**: Solo enteros positivos (sin negativos, decimales ni letras)
- **Campos obligatorios**: nombre, link, tipo de sistema, equipo, estado
- **Reportes**: Excluyen tareas Deprecadas y Pendientes
- **Año mínimo**: 2026

### Catálogos Configurables

Todos los valores de dominio son gestionables desde la sección **Configuración** de la aplicación (solo administradores), sin modificar código:

| Catálogo | Descripción |
|----------|-------------|
| **Tipos de sistema** | Define los productos o áreas evaluadas (p. ej. Frontend, Backend, QA) |
| **Equipos (squads)** | Asociados a cada tipo de sistema; cada usuario asigna los suyos |
| **Tipos de Proyecto** | Clasificación funcional de las tareas (tabla `project_types`) |
| **Complejidades** | Tallas de esfuerzo (XS, S, M, L, XL u otras) |
| **Miembros QA** | Personas que pueden ser asignadas a una tarea |
| **Categorías de Timing** | Tipos de tiempo registrados por QA (p. ej. Testing efectivo, Espera de fixes, Re-test) |

Esto permite que distintas organizaciones o equipos usen la misma instancia con su propia estructura, sin hardcodear valores en el código.

### Sistema de Reportes
- **Reportes Versionados**: Nueva versión por cada generación (sin sobrescribir)
- **Almacenamiento en BD**: Persistencia segura de versiones
- **Tabla de Tareas**: Layout completo con notas y devoluciones
- **Nota Final del Squad**: Promedio de tareas válidas
- **Comentarios de IA**: Desempeño y comunicación generados automáticamente
- **Exportación**: Markdown y CSV (compatibles con Notion)
- **Copiar Contenido**: Posibilidad de copiar manualmente para Notion

### Inteligencia Artificial
- Comentarios automáticos generados por OpenAI (GPT)
- Basados en tareas, devoluciones y notas adicionales del usuario
- Dos comentarios por reporte: **desempeño** y **comunicación**
- Profesionales, claros, contextuales — evita textos genéricos
- Generación batch para múltiples comentarios

### Búsqueda y Filtros
- Filtrar por: Mes, Año, Tipo de sistema, Equipo, Estado
- Búsqueda integrada por nombre de tarea
- Todos los dropdowns de filtros actualizan el estado local de forma síncrona (`useState`) y reflejan la URL vía `router.replace` en baja prioridad (`startTransition`), evitando que el cambio de URL interrumpa el evento del select y cause que el dropdown "rebote" al valor anterior

### Auditoría y Trazabilidad
- Historial completo de todas las operaciones (crear, editar, eliminar)
- Tipos auditados: tareas, reportes, usuarios, feedback
- Información detallada: usuario, acción, timestamp, cambios específicos
- Página dedicada con filtros por tipo de entidad y acción
- Modal de detalle con vista de cambios

### Tour Interactivo
- Guía visual paso a paso por módulos
- Múltiples tours: Tareas, Reportes, Auditoría, Feedback
- Acceso restringido a administradores

### Experiencia de Usuario
- Interfaz intuitiva y responsiva
- Feedback visual claro (errores, éxito, carga)
- Skeletons y spinners durante operaciones
- Sistema de retroalimentación del usuario
- **Indicador de cola en Navbar**: muestra estado de sincronización en segundo plano, aviso de sin conexión y botón de reintento si hay mutaciones fallidas

---

## Stack Tecnológico

| Categoría | Tecnología |
|-----------|-----------|
| Framework | Next.js 16+ |
| Lenguaje | TypeScript 5+ |
| Base de Datos | PostgreSQL (Supabase) + RPCs atómicas PL/pgSQL |
| Autenticación | Supabase Auth |
| API | Next.js API Routes |
| Estilos | Tailwind CSS 4 + PostCSS |
| Tests Unitarios | Jest + React Testing Library |
| Tests E2E | Playwright (Chromium) |
| Datos de Test | Faker.js |
| Forms | React Hook Form + Zod |
| IA | OpenAI (GPT) |
| Estado | React Context + TanStack Query |
| UI | Lucide React Icons |
| Date Picker | Componente custom (date-fns + calendario propio) |
| Utilidades | date-fns, jose (JWT), dotenv |
| CI/CD | GitHub Actions + Vercel |

---

## Requisitos Previos

- Node.js 18.17 o superior
- npm 9+
- Cuenta Supabase configurada
- API Key de OpenAI (para funcionalidad de IA)

---

## Instalación y Configuración

### 1. Clonar el repositorio

```bash
git clone <repo-url>
cd generador-evaluaciones/app
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Configurar variables de entorno

Crea un archivo `.env.local` en la carpeta `app/`:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_anon_YOUR_KEY
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Aplicación
NEXT_PUBLIC_APP_URL=http://localhost:3000

# OpenAI
OPENAI_API_KEY=sk-proj-...

# E2E Test Credentials (solo para testing)
E2E_USER_EMAIL=admin@evaluaciones.test
E2E_USER_PASSWORD=YourSecurePassword
```

### 4. Instalar navegadores de Playwright (solo para E2E)

```bash
npx playwright install --with-deps chromium
```

---

## Ejecución

### Desarrollo

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000) en tu navegador.

### Build de producción

```bash
npm run build
npm start
```

### Linting

```bash
npm run lint
```

---

## Testing

### Tests Unitarios (Jest)

```bash
npm test                # Ejecución única
npm run test:watch      # Modo watch
```

**Cobertura de tests unitarios (~35-45%):**

| Archivo | Módulo cubierto |
|---------|----------------|
| `src/lib/scoreCalculator.test.ts` | Lógica de cálculo de notas |
| `src/lib/withTimeout.test.ts` | Clase TimeoutError, Promise.race con cancelación |
| `src/lib/withRetry.test.ts` | RetryError, backoff, callback `onRetry` |
| `src/lib/reportUtils.test.ts` | `getProductTypeFromSquad` |
| `src/lib/squadChangeUtils.test.ts` | `normalizeNumber`, `detectSquadChanges` |
| `src/contexts/authStorage.test.ts` | TTL en localStorage, expiración, malformados |
| `src/hooks/useFeedback.test.ts` | Hook de feedback |
| `src/hooks/useFilterParams.test.ts` | `getFiltersFromUrl`, `buildUrlParams` |
| `src/hooks/useDebounce.test.ts` | `useDebounce`, `useDebouncedCallback` |
| `src/hooks/useSessionTimeout.test.ts` | Inactividad, reset de timer, token inválido |
| `src/hooks/useCachedFetch.test.ts` | `buildFilterKey` (estabilidad, null, numéricos) |
| `src/hooks/useFetchWithRetry.test.ts` | Clasificación de errores (timeout/network/otro) |

### Tests E2E (Playwright)

```bash
npm run test:e2e           # Headless (CI)
npm run test:e2e:headed    # Con navegador visible
npm run test:e2e:ui        # UI interactiva de Playwright
```

**Arquitectura E2E:**

Los tests siguen el patrón **Page Object Model (POM)** con fixtures de Playwright, **storageState** para sesión compartida y helpers de API para datos independientes.

```
e2e/
├── setup/
│   ├── auth.setup.ts             # Login único → guarda sesión en .auth/user.json
│   └── global-teardown.ts        # Limpia tareas con prefijo "E2E " post-run
├── fixtures/
│   ├── app-fixtures.ts           # Fixtures con storageState (sin login manual)
│   └── index.ts
├── helpers/
│   ├── test-data.ts              # Generadores de datos random (Faker)
│   ├── api-helpers.ts            # createTaskViaAPI / deleteTaskViaAPI
│   └── index.ts
├── pages/
│   ├── LoginPage.ts              # POM: página de login
│   ├── TasksPage.ts              # POM: CRUD de tareas
│   ├── AuditPage.ts              # POM: trazabilidad de auditoría
│   ├── NavbarComponent.ts        # POM: navegación
│   └── index.ts
└── tests/
    ├── auth.spec.ts                      # Login, logout, rutas protegidas
    ├── task-crud.spec.ts                 # CREATE / UPDATE / DELETE independientes
    ├── duplicate-link-validation.spec.ts # Validación de link duplicado
    ├── tab-navigation.spec.ts            # Navegación entre pestañas
    └── browser-tab-stability.spec.ts     # Estabilidad al cambiar tabs
```

**Suites de test E2E:**

| Suite | Tests | Descripción |
|-------|-------|-------------|
| `auth.spec.ts` | 4 | Login exitoso, credenciales inválidas, logout, redirección de ruta protegida |
| `task-crud.spec.ts` | 3 | CREATE, UPDATE y DELETE **independientes** — cada uno arranges y limpia sus propios datos |
| `duplicate-link-validation.spec.ts` | 1 | Crea tarea fuente vía API, intenta duplicar link vía UI, verifica error |
| `tab-navigation.spec.ts` | 1 | Navegación secuencial por todas las pestañas de la app |
| `browser-tab-stability.spec.ts` | 1 | Estabilidad de sesión al cambiar de pestaña del navegador |

**Principios de independencia de los tests E2E:**
- **storageState**: El proyecto `setup` hace login una sola vez y persiste la sesión. Los demás tests reutilizan `.auth/user.json` sin re-autenticar.
- **Datos propios vía API**: `createTaskViaAPI` crea datos de prueba directamente contra `/api/tasks` (sin pasar por UI) para el arrange. `deleteTaskViaAPI` los elimina en `afterEach`.
- **Prefijo trazable**: Las tareas creadas por tests usan prefijo `E2E ` para facilitar identificación y limpieza.
- **Global teardown**: `global-teardown.ts` elimina cualquier tarea residual con prefijo `E2E ` al finalizar la suite completa.
- **`fullyParallel: true`**: Todos los tests corren en paralelo (3 workers local, 2 en CI) sin dependencias entre sí.
- **Datos aleatorios**: Usa `@faker-js/faker` — evita la paradoja del pesticida.
- **CI-ready**: `forbidOnly` activado en CI, reintentos automáticos, screenshots y videos en fallos.

---

## CI/CD — GitHub Actions + Vercel

El proyecto usa un pipeline de integración continua que **bloquea el deploy si los tests fallan**.

### Flujo del Pipeline

```
Push a main / PR → ┌─ Unit Tests (Jest) ─┐
                    │                     ├─→ CI Gate ─→ Deploy a Vercel
                    └─ E2E Tests (PW) ───┘     │
                                               ✗ Si alguno falla,
                                                 NO se despliega
```

### Jobs

| Job | Qué hace | Duración aprox. |
|-----|----------|-----------------|
| **Unit Tests** | `npm test --ci --coverage` | ~15s |
| **E2E Tests** | Instala Chromium, crea `.env.local`, ejecuta Playwright | ~60s |
| **CI Gate** | Verifica que ambos jobs pasen | ~2s |
| **Deploy** | Solo en push a `main` + tests verdes → `vercel deploy --prod` | ~60s |

### Configuración requerida

#### Secrets de GitHub (Settings → Secrets and variables → Actions)

| Secret | Propósito |
|--------|-----------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key de Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (E2E teardown + seed) |
| `OPENAI_API_KEY` | API key de OpenAI para comentarios IA |
| `E2E_USER_EMAIL` | Email del usuario de test E2E (y seed) |
| `E2E_USER_PASSWORD` | Password del usuario de test E2E |
| `VERCEL_TOKEN` | Token de la cuenta Vercel |
| `VERCEL_ORG_ID` | ID de la organización/team en Vercel |
| `VERCEL_PROJECT_ID` | ID del proyecto en Vercel |

#### Configurar Vercel

1. **Deshabilitar auto-deploy** en Vercel → Proyecto → Settings → Git (el deploy lo maneja GitHub Actions)
2. Los secrets `VERCEL_ORG_ID` y `VERCEL_PROJECT_ID` se obtienen desde Vercel → Settings → General

### Artefactos

Cada ejecución del pipeline genera artefactos descargables:
- **jest-coverage**: Reporte de cobertura de tests unitarios (7 días)
- **playwright-report**: Reporte HTML interactivo de Playwright (14 días)
- **playwright-results**: Screenshots, videos y traces de fallos (7 días)

---

## Base de Datos

### RPCs Atómicas (PL/pgSQL)

Para eliminar roundtrips y garantizar consistencia transaccional, las operaciones de creación y actualización de tareas tienen RPCs disponibles en Supabase:

| Función | Descripción |
|---------|-------------|
| `create_task_with_squads(jsonb)` | Inserta tarea + todos sus squads en una sola transacción; devuelve `{ task, squads }` |
| `update_task_with_squads(uuid, jsonb)` | Actualiza tarea y reemplaza squads atómicamente; devuelve `{ old_task, new_task, old_squads, new_squads }` para audit |

Ambas funciones usan `SECURITY INVOKER` y `set search_path = public`, respetando las políticas RLS del usuario autenticado.

### Tuning de Rendimiento

| Ajuste | Valor | Propósito |
|--------|-------|-----------|
| `statement_timeout` (rol `authenticated`) | 10 s | Corta queries largas antes de agotar el `maxDuration` de Vercel |
| `idle_in_transaction_session_timeout` (rol `authenticated`) | 5 s | Libera conexiones estancadas en transacciones abiertas |
| Índice `user_profiles_id_role_idx` | `(id) INCLUDE (role_id)` | Index-only scan en el lookup de rol por cada request autenticado |

---

## Estructura del Proyecto

```
.github/
└── workflows/
    ├── ci.yml                         # Pipeline CI/CD
    └── seed-data.yml                  # Cron semanal: seed de datos aleatorios

app/
├── e2e/                               # Tests End-to-End (Playwright)
│   ├── fixtures/                      # Fixtures con auto-login
│   ├── helpers/                       # Generadores de datos (Faker)
│   ├── pages/                         # Page Object Models
│   └── tests/                         # Suites de test
│
├── src/
│   ├── app/                           # App Router de Next.js
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── middleware.ts
│   │   │
│   │   ├── api/
│   │   │   ├── tasks/                 # API CRUD de tareas
│   │   │   │   ├── route.ts           # GET (visibilidad por RLS), POST
│   │   │   │   ├── check-link/route.ts # GET pre-flight: verifica link duplicado
│   │   │   │   └── [id]/route.ts      # GET, PATCH, DELETE
│   │   │   ├── settings/              # Catálogos configurables
│   │   │   │   ├── products/          # Tipos de sistema
│   │   │   │   ├── project-types/     # Tipos de proyecto (tabla: project_types)
│   │   │   │   ├── squads/            # Equipos
│   │   │   │   ├── complexities/      # Complejidades
│   │   │   │   ├── qa-members/        # Miembros QA
│   │   │   │   └── timing-categories/ # Categorías de tiempo para timings
│   │   │   ├── reports/               # API de reportes
│   │   │   │   ├── route.ts           # GET, POST
│   │   │   │   └── [id]/route.ts      # GET
│   │   │   ├── generate-ai-comment/   # Comentarios IA individuales
│   │   │   ├── generate-ai-comments-batch/ # Comentarios IA batch
│   │   │   ├── audit-logs/            # API de auditoría
│   │   │   │   ├── route.ts           # GET
│   │   │   │   └── [type]/[id]/route.ts
│   │   │   └── feedback/              # API de feedback
│   │   │
│   │   ├── auth/
│   │   │   ├── login/page.tsx
│   │   │   └── signup/page.tsx
│   │   │
│   │   ├── tasks/page.tsx             # Gestión de tareas
│   │   ├── timings/page.tsx           # Registro de tiempos por tarea
│   │   ├── reports/                   # Reportes
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx
│   │   ├── settings/page.tsx          # Catálogos (solo admin)
│   │   └── audit-trail/page.tsx       # Trazabilidad
│   │
│   ├── components/                    # Componentes React
│   │   ├── Navbar.tsx
│   │   ├── TaskForm.tsx
│   │   ├── ReportDetailModal.tsx
│   │   ├── Modal.tsx
│   │   ├── ProtectedRoute.tsx
│   │   ├── SessionManager.tsx
│   │   ├── SessionChecker.tsx
│   │   ├── SessionExpirationModal.tsx
│   │   ├── NetworkErrorModal.tsx
│   │   ├── AuditHistory.tsx
│   │   ├── TourOverlay.tsx
│   │   ├── FeedbackButton.tsx
│   │   ├── QueueStatusIndicator.tsx   # Indicador de cola de mutaciones en Navbar
│   │   ├── Skeleton.tsx
│   │   └── ui/button.tsx
│   │
│   ├── contexts/
│   │   ├── AuthContext.tsx
│   │   ├── MutationQueueContext.tsx   # Provider + hook useMutationQueue()
│   │   ├── authStorage.ts
│   │   └── TourContext.tsx
│   │
│   ├── hooks/
│   │   ├── useAuthUser.ts
│   │   ├── useAuthError.ts
│   │   ├── useSessionTimeout.ts
│   │   ├── useFeedback.ts
│   │   ├── useFilterParams.ts
│   │   ├── useDebounce.ts
│   │   ├── useCachedFetch.ts
│   │   ├── useCatalogData.ts
│   │   └── useSafeAuthFetch.ts
│   │
│   └── lib/
│       ├── types.ts                   # Tipos TypeScript
│       ├── utils.ts
│       ├── supabase.ts                # Cliente Supabase
│       ├── auth.ts
│       ├── fetchAuth.ts               # SessionManager Singleton (Promise Coalescing) + warmSession() + BroadcastChannel
│       ├── scoreCalculator.ts         # Lógica de cálculo de notas
│       ├── reportUtils.ts
│       ├── mutationQueue.ts           # Cola de mutaciones offline-resiliente
│       ├── validateJWT.ts
│       ├── tourConfig.ts
│       ├── cache/rolesCache.ts
│       └── services/
│           ├── authService.ts
│           ├── taskService.ts
│           ├── reportService.ts
│           ├── timingService.ts
│           ├── auditService.ts
│           ├── feedbackService.ts
│           └── userProfileService.ts
│
├── supabase/
│   └── migrations/                    # Migraciones SQL versionadas
│           ├── 20260508000000_baseline_indexes.sql               # Índices de rendimiento
│           ├── 20260509000000_rename_category_to_project_type.sql # categories → project_types
│           ├── 20260510000000_create_timing_categories.sql       # Tabla timing_categories + tabla puente
│           ├── 20260510000001_migrate_timing_data.sql            # Backfill de horas históricas
│           ├── 20260510000002_drop_legacy_columns_and_recreate_view.sql # Drop columnas legacy + recrear VIEW
│           ├── 20260511000000_fix_timing_qa_category_hours_rls.sql # Ajuste RLS ownership para timing_qa_category_hours
│           ├── 20260511060000_normalize_timing_category_slugs.sql # Normalización de slugs semánticos en timing_categories
│           └── 20260511120000_protect_system_timing_categories.sql # RLS: bloquear UPDATE/DELETE de categorías del sistema
│
├── vercel.json                        # maxDuration por route de API
├── playwright.config.ts               # Configuración Playwright
├── jest.config.js                     # Configuración Jest
├── next.config.ts
├── tsconfig.json
├── package.json
└── .env.local                         # Variables de entorno (no versionado)
```

---

## Flujos Principales

### Flujo de Autenticación
1. Usuario accede a `/auth/login`
2. Credenciales se envían a Supabase Auth
3. Se recibe y almacena JWT token
4. Middleware protege rutas autenticadas
5. Timeout automático tras inactividad

### Flujo de Creación de Tarea
1. Usuario navega a `/tasks` → "+ Nueva Tarea"
2. Completa formulario con validaciones en tiempo real (incluye validación de URL)
3. Nota se calcula automáticamente según devoluciones
4. Pre-flight check: `GET /api/tasks/check-link` verifica que el link no esté duplicado antes de enviar
5. POST a `/api/tasks` → validación backend + almacenamiento
6. Auditoría se registra de forma asíncrona (no bloquea la respuesta)

### Flujo de Generación de Reportes
1. Usuario navega a `/reports`
2. Selecciona squad, mes y año
3. Sistema recopila tareas completadas del período
4. Calcula nota final del squad (promedio)
5. Solicita comentarios IA (desempeño + comunicación)
6. Genera reporte versionado en BD
7. Usuario puede descargar en Markdown o CSV

---

## Uso de la Aplicación

### 1. Crear Cuenta

1. Ir a `/auth/signup`
2. Ingresar email y contraseña
3. Confirmar cuenta

### 2. Crear Tareas

1. Ir a "Tareas" → "+ Nueva Tarea"
2. Completar: nombre, link, producto, squad, estado, devoluciones, notas
3. La nota se calcula automáticamente
4. Guardar

### 3. Ver y Filtrar Tareas

- Filtrar por mes, año, squad, estado
- Editar o eliminar desde la tabla

### 4. Generar Reportes

1. Ir a "Reportes"
2. Seleccionar squad, mes, año
3. "Generar Reporte" — crea nueva versión
4. Descargar en Markdown o CSV

### 5. Revisar Auditoría

1. Ir a "Auditoría"
2. Filtrar por tipo de entidad o acción
3. Clic en un registro para ver el detalle de cambios

---

## Seguridad

- **Supabase Auth + JWT**: Autenticación robusta
- **RLS Policies**: Acceso restringido por usuario a nivel de BD
- **Validación dual**: Frontend + Backend
- **HTTPS requerido** en producción
- **Secrets en GitHub**: Credenciales nunca expuestas en código
- **`.env.local` en `.gitignore`**: Variables de entorno no versionadas

---

## Troubleshooting

### "Error de autenticación"
- Verifica estar en `http://localhost:3000`
- Limpia cookies y vuelve a ingresar

### "Las tareas no aparecen"
- Verifica que hay tareas creadas para el mes/año seleccionado
- Revisa los filtros activos

### "Tests E2E fallan en local"
- Verifica que `.env.local` tenga `E2E_USER_EMAIL` y `E2E_USER_PASSWORD`
- Asegúrate de que el usuario de test exista en Supabase Auth
- Ejecuta `npx playwright install --with-deps chromium`

### "Error al compilar"
```bash
npm run build
```

---

## Licencia

Proprietary — Francisco Cabezas

## Soporte

Para problemas, contacta al equipo de desarrollo.
