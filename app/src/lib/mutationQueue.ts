import { authenticatedFetch } from "./fetchAuth";

// ─── Tipos públicos ────────────────────────────────────────────────────────────

export type MutationMethod = "POST" | "PATCH" | "PUT" | "DELETE";

export type MutationStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "permanent_failure";

export interface MutationItem {
  id: string;
  url: string;
  method: MutationMethod;
  body?: unknown;
  status: MutationStatus;
  attempts: number;
  maxAttempts: number;
  createdAt: number;
  completedAt?: number;
  error?: string;
  /** Claves de caché a invalidar cuando el ítem se complete con éxito */
  cacheKeys?: string[];
  /** Clave de idempotencia enviada como header al servidor */
  idempotencyKey?: string;
}

export interface EnqueueParams {
  url: string;
  method: MutationMethod;
  body?: unknown;
  cacheKeys?: string[];
  maxAttempts?: number;
  /**
   * Callback ejecutado con la respuesta del servidor cuando la mutación
   * se completa exitosamente. Solo vive en memoria — no se persiste en
   * localStorage, por lo que no sobrevive recargas de página.
   */
  onSuccess?: (data: unknown) => void;
  /**
   * Callback ejecutado cuando la mutación agota todos sus reintentos.
   * Útil para hacer rollback del estado optimista en la UI.
   */
  onRollback?: () => void;
}

export type MutationSuccessCallback = (
  item: MutationItem,
  data: unknown,
) => void;
export type MutationFailureCallback = (item: MutationItem) => void;
export type MutationStatusChangeCallback = (queue: MutationItem[]) => void;

// ─── Constantes ───────────────────────────────────────────────────────────────

const STORAGE_KEY = "mutation_queue_v1";

/**
 * Delays de backoff por intento (índice = número de intentos completados).
 * Más paciente que los reintentos de safeFetch para dar tiempo a que la
 * red o Supabase se recuperen entre operaciones en cola.
 */
const BACKOFF_DELAYS_MS = [5_000, 15_000, 45_000, 120_000];

/** Tiempo máximo por intento individual antes de abortar */
const ATTEMPT_TIMEOUT_MS = 30_000;

/** Los ítems completados se limpian automáticamente tras 5 minutos */
const CLEANUP_AGE_MS = 5 * 60 * 1_000;

/**
 * Códigos HTTP que indican errores del cliente (no transitorios).
 * Para estos códigos no tiene sentido reintentar — falla inmediatamente.
 */
const CLIENT_ERROR_STATUSES = new Set([400, 409, 422, 404]);

// ─── Clase MutationQueue ──────────────────────────────────────────────────────

/**
 * Cola de mutaciones con persistencia en localStorage.
 *
 * Desacopla la UI de la red: las operaciones POST/PATCH/PUT/DELETE se
 * encolan y se ejecutan de forma asíncrona con backoff exponencial.
 * Si la página se recarga, los ítems pendientes se restauran y se
 * procesan al volver a montar el provider.
 *
 * No usar directamente — usar MutationQueueContext en su lugar.
 */
export class MutationQueue {
  private queue: MutationItem[] = [];
  private isProcessing = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Callbacks en memoria (no persistidos). Se pierden al recargar la página,
   * lo cual es correcto porque el estado optimista también se pierde en ese caso.
   */
  private inMemoryCallbacks = new Map<
    string,
    { onSuccess?: (data: unknown) => void; onRollback?: () => void }
  >();

  private onSuccessGlobal?: MutationSuccessCallback;
  private onPermanentFailureGlobal?: MutationFailureCallback;
  private onStatusChangeGlobal?: MutationStatusChangeCallback;

  constructor() {
    this.restore();
    if (typeof window !== "undefined") {
      window.addEventListener("online", this.handleOnline);
    }
  }

  // ─── API pública ────────────────────────────────────────────────────────────

  configure(callbacks: {
    onSuccess?: MutationSuccessCallback;
    onPermanentFailure?: MutationFailureCallback;
    onStatusChange?: MutationStatusChangeCallback;
  }) {
    this.onSuccessGlobal = callbacks.onSuccess;
    this.onPermanentFailureGlobal = callbacks.onPermanentFailure;
    this.onStatusChangeGlobal = callbacks.onStatusChange;
  }

  /**
   * Añade una operación a la cola y la procesa inmediatamente.
   * @returns El ID único del ítem encolado.
   */
  enqueue(params: EnqueueParams): string {
    const id = `mut_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const idempotencyKey =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : id;

    const item: MutationItem = {
      id,
      url: params.url,
      method: params.method,
      body: params.body,
      status: "pending",
      attempts: 0,
      maxAttempts: params.maxAttempts ?? 3,
      createdAt: Date.now(),
      cacheKeys: params.cacheKeys,
      idempotencyKey,
    };

    this.queue.push(item);
    this.persist();

    if (params.onSuccess || params.onRollback) {
      this.inMemoryCallbacks.set(id, {
        onSuccess: params.onSuccess,
        onRollback: params.onRollback,
      });
    }

    this.notifyStatusChange();
    void this.processQueue();
    return id;
  }

  /** Procesa todos los ítems en estado `pending`. */
  async processQueue(): Promise<void> {
    if (this.isProcessing) return;

    const pending = this.queue.filter((i) => i.status === "pending");
    if (pending.length === 0) return;

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      this.scheduleRetry(0);
      return;
    }

    this.isProcessing = true;

    for (const item of [...pending]) {
      const current = this.queue.find((i) => i.id === item.id);
      if (!current || current.status !== "pending") continue;
      await this.processItem(current);
    }

    this.isProcessing = false;
    this.notifyStatusChange();

    // Programar reintento si quedan ítems fallidos recuperables
    const retryable = this.queue.filter(
      (i) => i.status === "failed" && i.attempts < i.maxAttempts,
    );
    if (retryable.length > 0) {
      this.scheduleRetry(retryable[0].attempts);
    }
  }

  /** Reintenta todos los ítems fallidos (tanto `failed` como `permanent_failure`). */
  retryFailed(): void {
    let changed = false;
    this.queue.forEach((item) => {
      if (item.status === "failed" || item.status === "permanent_failure") {
        item.status = "pending";
        item.attempts = 0;
        item.error = undefined;
        changed = true;
      }
    });
    if (changed) {
      this.persist();
      this.notifyStatusChange();
      void this.processQueue();
    }
  }

  getQueue(): MutationItem[] {
    return [...this.queue];
  }

  getStatus(): {
    pending: number;
    processing: boolean;
    failed: number;
    retryingCount: number;
  } {
    const pending = this.queue.filter(
      (i) => i.status === "pending" || i.status === "processing",
    ).length;
    const processing =
      this.isProcessing || this.queue.some((i) => i.status === "processing");
    const failed = this.queue.filter(
      (i) => i.status === "failed" || i.status === "permanent_failure",
    ).length;
    const retryingCount = this.queue.filter(
      (i) =>
        (i.status === "processing" && i.attempts > 1) ||
        (i.status === "failed" &&
          i.attempts >= 1 &&
          i.attempts < i.maxAttempts),
    ).length;
    return { pending, processing, failed, retryingCount };
  }

  destroy(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (typeof window !== "undefined") {
      window.removeEventListener("online", this.handleOnline);
    }
  }

  // ─── Procesamiento interno ──────────────────────────────────────────────────

  private async processItem(item: MutationItem): Promise<void> {
    item.status = "processing";
    item.attempts += 1;
    this.persist();
    this.notifyStatusChange();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS);

    try {
      const response = await authenticatedFetch(item.url, {
        method: item.method,
        headers: {
          "Content-Type": "application/json",
          ...(item.idempotencyKey
            ? { "Idempotency-Key": item.idempotencyKey }
            : {}),
        },
        body: item.body !== undefined ? JSON.stringify(item.body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response
          .text()
          .catch(() => `HTTP ${response.status}`);

        // 409 en POST = recurso ya existe en el servidor (éxito idempotente).
        // Ocurre cuando el cliente no recibió la respuesta del primer intento
        // (p.ej. SessionLockError) y reintentó. El recurso SÍ fue creado.
        // Tratarlo como completed para que la UI invalide el caché y no haga rollback.
        if (response.status === 409 && item.method === "POST") {
          console.warn(
            "[MutationQueue] 409 en POST — recurso ya existe (éxito idempotente):",
            item.url,
          );
          item.status = "completed";
          item.completedAt = Date.now();
          item.error = undefined;
          this.persist();
          // Invalidar cachés para que la UI refresque y muestre el recurso existente
          this.onSuccessGlobal?.(item, {});
          this.inMemoryCallbacks.delete(item.id);
          this.notifyStatusChange();
          this.cleanup();
          return;
        }

        // 404 en DELETE en un RETRY = recurso ya no existe. Un intento previo en
        // otra instancia Lambda pudo haberlo borrado — tratar como éxito idempotente
        // para que el optimistic update no sea revertido innecesariamente.
        // Solo en retries (attempts > 1): un primer intento con 404 sí es un error real
        // (ID incorrecto, RLS denegando acceso) y debe surfacear al usuario.
        if (
          response.status === 404 &&
          item.method === "DELETE" &&
          item.attempts > 1
        ) {
          console.warn(
            "[MutationQueue] 404 en DELETE — recurso ya eliminado (éxito idempotente):",
            item.url,
          );
          item.status = "completed";
          item.completedAt = Date.now();
          item.error = undefined;
          this.persist();
          this.onSuccessGlobal?.(item, {});
          this.inMemoryCallbacks.delete(item.id);
          this.notifyStatusChange();
          this.cleanup();
          return;
        }

        const err = new Error(errorText || `HTTP ${response.status}`);

        // Errores del cliente son deterministas — no reintentar
        if (CLIENT_ERROR_STATUSES.has(response.status)) {
          item.attempts = item.maxAttempts;
        }
        throw err;
      }

      const data = await response.json().catch(() => ({}));
      item.status = "completed";
      item.completedAt = Date.now();
      item.error = undefined;
      this.persist();

      const cb = this.inMemoryCallbacks.get(item.id);
      cb?.onSuccess?.(data);
      this.inMemoryCallbacks.delete(item.id);

      this.onSuccessGlobal?.(item, data);
      this.notifyStatusChange();
      this.cleanup();
    } catch (error) {
      clearTimeout(timeoutId);
      item.error = error instanceof Error ? error.message : String(error);

      // SessionLockError: navigator.lock transitorio — no quemar un intento del budget
      // (es contención de lock, no un fallo real de red o del servidor)
      const isLockError =
        error instanceof Error && error.name === "SessionLockError";
      if (isLockError) {
        item.attempts -= 1;
        item.status = "failed";
        this.persist();
        this.notifyStatusChange();
        // Reintento rápido en 2s para dar tiempo a que el lock se libere
        this.scheduleRetryMs(2000);
        return;
      }

      if (item.attempts >= item.maxAttempts) {
        item.status = "permanent_failure";
        this.persist();

        const cb = this.inMemoryCallbacks.get(item.id);
        cb?.onRollback?.();
        this.inMemoryCallbacks.delete(item.id);

        this.onPermanentFailureGlobal?.(item);
      } else {
        item.status = "failed";
        this.persist();
      }
      this.notifyStatusChange();
    }
  }

  // ─── Helpers privados ───────────────────────────────────────────────────────

  private handleOnline = () => {
    this.queue.forEach((item) => {
      if (item.status === "failed" && item.attempts < item.maxAttempts) {
        item.status = "pending";
      }
    });
    this.persist();
    void this.processQueue();
  };

  /** Programa un reintento con un delay fijo en ms (para SessionLockError). */
  private scheduleRetryMs(delayMs: number): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.queue.forEach((item) => {
        if (item.status === "failed" && item.attempts < item.maxAttempts) {
          item.status = "pending";
        }
      });
      this.persist();
      void this.processQueue();
    }, delayMs);
  }

  private scheduleRetry(completedAttempts: number): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    const delay =
      BACKOFF_DELAYS_MS[
        Math.min(completedAttempts, BACKOFF_DELAYS_MS.length - 1)
      ];

    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.queue.forEach((item) => {
        if (item.status === "failed" && item.attempts < item.maxAttempts) {
          item.status = "pending";
        }
      });
      this.persist();
      void this.processQueue();
    }, delay);
  }

  private cleanup(): void {
    const now = Date.now();
    this.queue = this.queue.filter((item) => {
      if (item.status === "completed" && item.completedAt) {
        return now - item.completedAt < CLEANUP_AGE_MS;
      }
      return true;
    });
    this.persist();
  }

  private persist(): void {
    try {
      if (typeof localStorage === "undefined") return;
      const toStore = this.queue.filter(
        (i) =>
          i.status !== "completed" ||
          (i.completedAt && Date.now() - i.completedAt < CLEANUP_AGE_MS),
      );
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
    } catch {
      // localStorage puede no estar disponible (modo privado, SSR)
    }
  }

  private restore(): void {
    try {
      if (typeof localStorage === "undefined") return;
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return;

      const items: MutationItem[] = JSON.parse(stored);
      this.queue = items
        .filter((i) =>
          ["pending", "failed", "processing", "permanent_failure"].includes(
            i.status,
          ),
        )
        .map((i) => ({
          ...i,
          // Los ítems que estaban en proceso cuando se cerró la página se reintentarán
          status:
            i.status === "processing"
              ? ("pending" as MutationStatus)
              : i.status,
        }));
    } catch {
      // Datos inválidos en localStorage — ignorar
    }
  }

  private notifyStatusChange(): void {
    this.onStatusChangeGlobal?.(this.getQueue());
  }
}
