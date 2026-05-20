"use client";

import React, { useEffect, useState } from "react";
import { useTour } from "@/contexts/TourContext";
import { X, ChevronLeft, ChevronRight, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function TourOverlay() {
  const {
    currentStep,
    isRunning,
    nextStep,
    previousStep,
    skipTour,
    endTour,
    getCurrentStepData,
    getTotalSteps,
  } = useTour();
  const [, setTargetElement] = useState<HTMLElement | null>(null);
  const [position, setPosition] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);

  const stepData = getCurrentStepData();
  const totalSteps = getTotalSteps();
  const [waitingForExpand, setWaitingForExpand] = useState(false);

  useEffect(() => {
    // Detectar cuando el usuario hace clic en el botón de expansión en paso 8
    if (
      isRunning &&
      stepData &&
      stepData.target.includes("task-row-expand-btn") &&
      currentStep === 7
    ) {
      const expandBtn = document.querySelector(
        '[data-tour="task-row-expand-btn"]',
      ) as HTMLElement;

      if (expandBtn && !waitingForExpand) {
        const handleClick = () => {
          setWaitingForExpand(true);
          // Esperar a que la fila se expanda y luego avanzar al siguiente paso
          setTimeout(() => {
            nextStep();
            setWaitingForExpand(false);
          }, 400);
        };

        expandBtn.addEventListener("click", handleClick);
        return () => expandBtn.removeEventListener("click", handleClick);
      }
    }
  }, [isRunning, stepData, currentStep, waitingForExpand, nextStep]);
  useEffect(() => {
    if (!isRunning || !stepData) {
      return;
    }

    let timeoutId: NodeJS.Timeout;

    // Buscar el elemento objetivo
    const element =
      stepData.target === "body"
        ? (document.body as HTMLElement)
        : (document.querySelector(stepData.target) as HTMLElement);

    if (element) {
      setTargetElement(element);
      const rect = element.getBoundingClientRect();
      setPosition({
        top: rect.top + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width,
        height: rect.height,
      });
    } else {
      // Si el elemento no existe pero estamos buscando task-filters,
      // automáticamente expandir los filtros
      if (stepData.target.includes("task-filters")) {
        const filterButton = document.querySelector(
          '[data-tour="task-filter-button"]',
        ) as HTMLElement;
        if (filterButton) {
          filterButton.click();
          // Esperar a que el DOM se actualice
          timeoutId = setTimeout(() => {
            const newElement = document.querySelector(
              stepData.target,
            ) as HTMLElement;
            if (newElement) {
              setTargetElement(newElement);
              const rect = newElement.getBoundingClientRect();
              setPosition({
                top: rect.top + window.scrollY,
                left: rect.left + window.scrollX,
                width: rect.width,
                height: rect.height,
              });
            }
          }, 300);
        }
      } else if (
        stepData.target.includes("task-row-details") ||
        stepData.target.includes("task-actions")
      ) {
        // Si el elemento no existe pero estamos buscando task-row-details o task-actions,
        // automáticamente expandir la primera fila
        const expandButton = document.querySelector(
          '[data-tour="task-row-expand-btn"]',
        ) as HTMLElement;
        if (expandButton) {
          expandButton.click();
          // Esperar a que el DOM se actualice
          timeoutId = setTimeout(() => {
            const newElement = document.querySelector(
              stepData.target,
            ) as HTMLElement;
            if (newElement) {
              setTargetElement(newElement);
              const rect = newElement.getBoundingClientRect();
              setPosition({
                top: rect.top + window.scrollY,
                left: rect.left + window.scrollX,
                width: rect.width,
                height: rect.height,
              });
            }
          }, 300);
        }
      }
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [stepData, isRunning]);

  // Cleanup when tour ends
  useEffect(() => {
    if (!isRunning) {
      setTargetElement(null);
      setPosition(null);
    }
  }, [isRunning]);

  if (!isRunning || !stepData || !position) {
    return null;
  }

  // Estilos para el tooltip basados en placement
  const getTooltipPosition = () => {
    const padding = 15;
    const tooltipWidth = 450;
    const tooltipHeight = 450;

    const placement = stepData.placement || "bottom";

    switch (placement) {
      case "top":
        return {
          top: position.top - tooltipHeight - padding,
          left: Math.min(
            position.left + position.width / 2 - tooltipWidth / 2,
            window.innerWidth - tooltipWidth - 20,
          ),
        };
      case "bottom":
        return {
          top: position.top + position.height + padding,
          left: Math.min(
            position.left + position.width / 2 - tooltipWidth / 2,
            window.innerWidth - tooltipWidth - 20,
          ),
        };
      case "left":
        return {
          top: position.top + position.height / 2 - tooltipHeight / 2,
          left: position.left - tooltipWidth - padding,
        };
      case "right":
        return {
          top: position.top + position.height / 2 - tooltipHeight / 2,
          left: position.left + position.width + padding,
        };
      case "center":
        return {
          top: window.innerHeight / 2 - tooltipHeight / 2,
          left: window.innerWidth / 2 - tooltipWidth / 2,
        };
      default:
        return {
          top: position.top + position.height + padding,
          left: Math.min(
            position.left + position.width / 2 - tooltipWidth / 2,
            window.innerWidth - tooltipWidth - 20,
          ),
        };
    }
  };

  const tooltipPos = getTooltipPosition();

  return (
    <>
      {/* Backdrop background */}
      <div
        className="fixed inset-0 bg-black/50 z-40 pointer-events-none"
        style={{
          clipPath:
            stepData.target === "body"
              ? "none"
              : `polygon(
            0% 0%,
            0% 100%,
            100% 100%,
            100% 0%,
            0% 0%,
            ${position.left}px ${position.top}px,
            ${position.left}px ${position.top + position.height}px,
            ${position.left + position.width}px ${position.top + position.height}px,
            ${position.left + position.width}px ${position.top}px,
            ${position.left}px ${position.top}px
          )`,
        }}
      />

      {/* Highlight box */}
      {stepData.target !== "body" && (
        <div
          className="fixed border-2 border-blue-500 pointer-events-none bg-blue-50/10 z-40 rounded-lg shadow-lg shadow-blue-500/50 transition-all duration-300"
          style={{
            top: position.top - 4,
            left: position.left - 4,
            width: position.width + 8,
            height: position.height + 8,
          }}
        />
      )}

      {/* Content card */}
      <div
        className="fixed bg-white rounded-lg shadow-2xl z-50 p-6 border border-gray-200 max-h-[500px] overflow-y-auto"
        style={{
          width: "450px",
          top: Math.max(10, Math.min(tooltipPos.top, window.innerHeight - 500)),
          left: Math.max(
            10,
            Math.min(tooltipPos.left, window.innerWidth - 470),
          ),
          animation: "slideIn 0.3s ease-out",
        }}
      >
        {/* Header */}
        <div className="flex justify-between items-start mb-3">
          <h3 className="text-lg font-bold text-gray-800 flex-1">
            {stepData.title}
          </h3>
          <button
            onClick={endTour}
            className="text-gray-400 hover:text-gray-600 ml-2 flex-shrink-0"
            aria-label="Close tour"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <p className="text-gray-600 text-sm mb-4 whitespace-pre-line">
          {stepData.content}
        </p>

        {/* Progress */}
        <div className="mb-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs text-gray-500">
              Paso {currentStep + 1} de {totalSteps}
            </span>
            <div className="text-xs text-gray-400">
              {Math.round(((currentStep + 1) / totalSteps) * 100)}%
            </div>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${((currentStep + 1) / totalSteps) * 100}%` }}
            />
          </div>
        </div>

        {/* Buttons */}
        <div className="flex gap-2 justify-end flex-wrap">
          {currentStep > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={previousStep}
              className="gap-1"
            >
              <ChevronLeft className="w-4 h-4" />
              Anterior
            </Button>
          )}

          {stepData.showSkip && (
            <Button
              variant="ghost"
              size="sm"
              onClick={skipTour}
              className="gap-1 text-gray-500 hover:text-gray-700"
            >
              <SkipForward className="w-4 h-4" />
              Saltar
            </Button>
          )}

          <Button
            onClick={nextStep}
            size="sm"
            className="gap-1 bg-blue-600 hover:bg-blue-700 text-white whitespace-nowrap"
          >
            {currentStep === totalSteps - 1 ? "Finalizar" : "Siguiente"}
            {currentStep < totalSteps - 1 && (
              <ChevronRight className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>

      <style jsx>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </>
  );
}
