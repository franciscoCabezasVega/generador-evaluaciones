"use client";

import { useState } from "react";
import { MessageCircle, ChevronDown } from "lucide-react";
import { FeedbackForm } from "./FeedbackForm";

export function FeedbackButton() {
  const [isOpen, setIsOpen] = useState(false);

  const toggleForm = () => {
    setIsOpen(!isOpen);
  };

  const handleClose = () => {
    setIsOpen(false);
  };

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {/* Form Modal */}
      {isOpen && (
        <div className="mb-4">
          <FeedbackForm onClose={handleClose} onSubmitSuccess={handleClose} />
        </div>
      )}

      {/* Floating Button */}
      <button
        onClick={toggleForm}
        className={`flex items-center justify-center w-14 h-14 rounded-full shadow-lg transition-all duration-300 hover:shadow-xl ${
          isOpen
            ? "bg-red-500 hover:bg-red-600 text-white"
            : "bg-blue-600 hover:bg-blue-700 text-white"
        }`}
        aria-label="Reportar problema"
        title={isOpen ? "Cerrar formulario" : "Reportar problema"}
        data-tour="feedback-button"
      >
        {isOpen ? (
          <ChevronDown className="w-6 h-6" />
        ) : (
          <MessageCircle className="w-6 h-6" />
        )}
      </button>
    </div>
  );
}
