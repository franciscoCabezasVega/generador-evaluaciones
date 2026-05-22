/**
 * Sanitizar texto antes de inyectarlo en prompts de IA.
 * Previene prompt injection removiendo patrones peligrosos.
 */
export function sanitizeForPrompt(text: string, maxLength = 500): string {
  if (!text) return "";
  // Pre-truncar antes de aplicar regex para limitar superficie de procesamiento
  const safeInput = text.slice(0, maxLength * 4);
  return safeInput
    .replace(/```/g, "") // Remover bloques de código
    .replace(/\bignore\b[\s\S]*?\binstructions\b/gi, "[filtered]")
    .replace(/\bforget\b[\s\S]*?\babove\b/gi, "[filtered]")
    .replace(/\bsystem\b[\s\S]*?\bprompt\b/gi, "[filtered]")
    .replace(/\brole\b[\s\S]*?\bassistant\b/gi, "[filtered]")
    .slice(0, maxLength);
}
