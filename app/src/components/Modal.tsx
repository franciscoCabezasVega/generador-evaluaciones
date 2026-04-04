'use client';

import { ReactNode, memo } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  onHeaderClose?: () => void;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  headerActions?: ReactNode;
}

function Modal({ isOpen, title, onClose, onHeaderClose, children, size = 'lg', headerActions }: ModalProps) {
  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-4xl',
    xl: 'max-w-5xl',
  };

  const handleHeaderClose = () => {
    // Si hay un manejador especial para cerrar desde el header (icono X), usarlo
    // De lo contrario, usar el onClose normal
    if (onHeaderClose) {
      onHeaderClose();
    } else {
      onClose();
    }
  };

  return (
    <>
      {/* Backdrop - solo blur sin color */}
      <div className="fixed inset-0 backdrop-blur-sm z-40" onClick={onClose} />
      
      {/* Modal - Contenedor fijo */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div role="dialog" aria-modal="true" aria-labelledby="modal-title" className={`bg-white rounded-2xl shadow-2xl ${sizeClasses[size]} w-full max-h-[calc(100vh-2rem)] flex flex-col pointer-events-auto`}>
          {/* Header */}
          <div className="flex justify-between items-center bg-white border-b p-6 flex-shrink-0">
            <h2 id="modal-title" className="text-xl font-semibold truncate whitespace-nowrap" title={title}>{title}</h2>
            <div className="flex items-center gap-2 flex-shrink-0">
              {headerActions}
              <button
                onClick={handleHeaderClose}
                className="text-gray-500 hover:text-gray-700 transition-colors"
                aria-label="Cerrar modal"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>

          {/* Content - Solo este tiene scroll */}
          <div className="overflow-y-auto flex-1 p-6 min-h-0">
            {children}
          </div>
        </div>
      </div>
    </>
  );
}

export default memo(Modal);
