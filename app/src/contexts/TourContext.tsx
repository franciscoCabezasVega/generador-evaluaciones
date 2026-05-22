"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
} from "react";
import { TourType, TourStep, TOURS_CONFIG } from "@/lib/tourConfig";

interface TourContextType {
  currentTour: TourType;
  currentStep: number;
  isRunning: boolean;
  startTour: (tourType: Exclude<TourType, null>) => void;
  nextStep: () => void;
  previousStep: () => void;
  skipTour: () => void;
  endTour: () => void;
  getCurrentStepData: () => TourStep | null;
  getTotalSteps: () => number;
}

const TourContext = createContext<TourContextType | undefined>(undefined);

export function TourProvider({ children }: { children: ReactNode }) {
  const [currentTour, setCurrentTour] = useState<TourType>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [isRunning, setIsRunning] = useState(false);

  const endTour = useCallback(() => {
    setCurrentTour(null);
    setCurrentStep(0);
    setIsRunning(false);
  }, []);

  const startTour = useCallback((tourType: Exclude<TourType, null>) => {
    setCurrentTour(tourType);
    setCurrentStep(0);
    setIsRunning(true);
    // Scroll to top
    window.scrollTo(0, 0);
  }, []);

  const nextStep = useCallback(() => {
    if (currentTour && currentStep < TOURS_CONFIG[currentTour].length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      // Si es el último paso, terminar el tour
      endTour();
    }
  }, [currentTour, currentStep, endTour]);

  const previousStep = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  }, [currentStep]);

  const skipTour = useCallback(() => {
    endTour();
  }, [endTour]);

  const getCurrentStepData = useCallback(() => {
    if (!currentTour || !isRunning) return null;
    return TOURS_CONFIG[currentTour][currentStep] || null;
  }, [currentTour, currentStep, isRunning]);

  const getTotalSteps = useCallback(() => {
    if (!currentTour) return 0;
    return TOURS_CONFIG[currentTour].length;
  }, [currentTour]);

  return (
    <TourContext.Provider
      value={{
        currentTour,
        currentStep,
        isRunning,
        startTour,
        nextStep,
        previousStep,
        skipTour,
        endTour,
        getCurrentStepData,
        getTotalSteps,
      }}
    >
      {children}
    </TourContext.Provider>
  );
}

export function useTour() {
  const context = useContext(TourContext);
  if (context === undefined) {
    throw new Error("useTour debe usarse dentro de un TourProvider");
  }
  return context;
}
