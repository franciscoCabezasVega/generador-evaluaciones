import { useState } from 'react';
import { FeedbackType, EvidenceItem } from '@/lib/types';
import { authenticatedFetch } from '@/lib/fetchAuth';

interface UseFeedbackOptions {
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

interface UseFeedbackReturn {
  isLoading: boolean;
  error: string | null;
  submitFeedback: (type: FeedbackType, description: string, evidence?: EvidenceItem[]) => Promise<void>;
  clearError: () => void;
}

const MIN_DESCRIPTION_LENGTH = 10;
const MAX_EVIDENCE_ITEMS = 3;
const JAM_DOMAIN = 'jam.dev';

export function useFeedback(options?: UseFeedbackOptions): UseFeedbackReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateInput = (
    type: FeedbackType,
    description: string,
    evidence?: EvidenceItem[]
  ): string | null => {
    // Validate type
    if (!['suggestion', 'incident'].includes(type)) {
      return 'Tipo de reporte inválido';
    }

    // Validate description
    if (!description || description.trim().length < MIN_DESCRIPTION_LENGTH) {
      return `La descripción debe tener al menos ${MIN_DESCRIPTION_LENGTH} caracteres`;
    }

    // Validate evidence items
    if (evidence && evidence.length > 0) {
      if (evidence.length > MAX_EVIDENCE_ITEMS) {
        return `Se permite un máximo de ${MAX_EVIDENCE_ITEMS} elementos de evidencia`;
      }

      // Validate each evidence item
      for (const item of evidence) {
        if (item.type === 'link') {
          const urlString = typeof item.value === 'string' ? item.value : '';
          if (urlString) {
            try {
              const url = new URL(urlString);
              if (!url.hostname.includes(JAM_DOMAIN)) {
                return `El enlace debe ser de ${JAM_DOMAIN}`;
              }
            } catch {
              return 'El enlace no es una URL válida';
            }
          }
        }
      }
    }

    return null;
  };

  const submitFeedback = async (
    type: FeedbackType,
    description: string,
    evidence?: EvidenceItem[]
  ) => {
    setError(null);
    setIsLoading(true);

    try {
      // Validate input
      const validationError = validateInput(type, description, evidence);
      if (validationError) {
        setError(validationError);
        setIsLoading(false);
        return;
      }

      // Build request body
      const requestBody: { type: string; description: string; evidence_url?: string } = {
        type,
        description: description.trim(),
      };

      // Add evidence URL if provided
      if (evidence && evidence.length > 0) {
        const linkEvidence = evidence.find(item => item.type === 'link');
        if (linkEvidence && typeof linkEvidence.value === 'string') {
          requestBody.evidence_url = linkEvidence.value;
        }
      }

      // Submit to API (con autenticación)
      const response = await authenticatedFetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Error al enviar el reporte');
      }

      // Success
      options?.onSuccess?.();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error desconocido';
      setError(errorMessage);
      options?.onError?.(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const clearError = () => {
    setError(null);
  };

  return {
    isLoading,
    error,
    submitFeedback,
    clearError,
  };
}
