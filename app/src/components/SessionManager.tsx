"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useSessionTimeoutManager } from "@/hooks/useSessionTimeoutManager";
import { SessionExpirationModal } from "./SessionExpirationModal";

/**
 * Componente que gestiona la expiración de sesión por inactividad
 * Integra el hook useSessionTimeoutManager con el modal de advertencia
 *
 * Solo se activa cuando hay un usuario autenticado (enabled: !!user?.id)
 */
export function SessionManager() {
  const { user } = useAuth();
  const { isWarningVisible, timeRemaining, handleContinue, handleExpire } =
    useSessionTimeoutManager({ enabled: !!user?.id });

  // No renderizar nada si no hay usuario
  if (!user?.id) {
    return null;
  }

  return (
    <SessionExpirationModal
      isOpen={isWarningVisible}
      timeRemaining={timeRemaining}
      onContinue={handleContinue}
      onExpire={handleExpire}
    />
  );
}
