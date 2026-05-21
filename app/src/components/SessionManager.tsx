"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useMutationQueue } from "@/contexts/MutationQueueContext";
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
  const { queueStatus } = useMutationQueue();
  const { isWarningVisible, timeRemaining, handleContinue, handleExpire } =
    useSessionTimeoutManager({
      enabled: !!user?.id,
      hasPendingMutations: () =>
        queueStatus.pending > 0 || queueStatus.processing,
    });

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
