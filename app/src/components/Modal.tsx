'use client';

import { ReactNode, memo, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [isOpen]);

  if (!isOpen || !mounted) return null;

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

  return createPortal(
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-40" onClick={onClose} />
      
      {/* Modal container */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
          className={`bg-gray-100 border border-gray-200 rounded-2xl shadow-2xl shadow-black/50 ${sizeClasses[size]} w-full max-h-[calc(100vh-2rem)] flex flex-col pointer-events-auto`}
          style={{ boxShadow: '0 0 0 1px oklch(0.79 0.178 82 / 0.08), 0 25px 80px oklch(0 0 0 / 0.6)' }}
        >
          {/* Header */}
          <div className="flex justify-between items-center border-b border-gray-200 px-6 py-4 flex-shrink-0">
            <h2 id="modal-title" className="text-base font-semibold text-gray-900 truncate" title={title}>
              {title}
            </h2>
            <div className="flex items-center gap-2 flex-shrink-0">
              {headerActions}
              <button
                onClick={handleHeaderClose}
                className="w-7 h-7 flex items-center justify-center rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-200 transition-colors"
                aria-label="Cerrar modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Scrollable content */}
          <div className="overflow-y-auto flex-1 p-6 min-h-0">
            {children}
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}

export default memo(Modal);
