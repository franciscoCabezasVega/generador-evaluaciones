import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { SessionUnavailableError } from "@/lib/fetchAuth";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Detecta si un error es debido a sesión expirada
 */
export function isSessionExpiredError(error: unknown): boolean {
  if (error instanceof Error) {
    // Errores transitorios de lock/timeout NO son sesión expirada
    if (error.name === "SessionLockError") return false;
    if (error instanceof SessionUnavailableError) return false;
    if (error.message.includes("getSession timeout")) return false;

    const message = error.message.toLowerCase();
    return (
      message.includes("session expired") ||
      message.includes("no hay sesión") ||
      message.includes("unauthorized") ||
      message.includes("refresh token")
    );
  }
  return false;
}

/**
 * Obtiene un mensaje de error amigable
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Ha ocurrido un error inesperado";
}
