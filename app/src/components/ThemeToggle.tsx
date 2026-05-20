"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon, Monitor } from "lucide-react";
import { userProfileService } from "@/lib/services/userProfileService";
import { useAuth } from "@/contexts/AuthContext";

type ThemeOption = "light" | "dark" | "system";

const OPTIONS: {
  value: ThemeOption;
  label: string;
  Icon: React.ElementType;
}[] = [
  { value: "light", label: "Claro", Icon: Sun },
  { value: "dark", label: "Oscuro", Icon: Moon },
  { value: "system", label: "Sistema", Icon: Monitor },
];

function ThemeIcon({ theme }: { theme: string | undefined }) {
  if (theme === "light") return <Sun className="w-4 h-4" />;
  if (theme === "dark") return <Moon className="w-4 h-4" />;
  return <Monitor className="w-4 h-4" />;
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const { user } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Anti-flash: no renderizar hasta que el componente esté montado en cliente
  useEffect(() => {
    setMounted(true);
  }, []);

  // Cerrar con Escape y devolver foco al trigger
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  if (!mounted) {
    return <div className="w-8 h-8" aria-hidden />;
  }

  const handleSelect = (value: ThemeOption) => {
    // Habilitar transición solo para cambios iniciados por el usuario (no en hydration)
    document.documentElement.classList.add("theme-transition");
    window.setTimeout(() => {
      document.documentElement.classList.remove("theme-transition");
    }, 300);

    setTheme(value);
    setOpen(false);
    triggerRef.current?.focus();
    // Persistir en BD en background; el servicio maneja los errores internamente
    if (user) {
      void userProfileService.updateThemePreference(value);
    }
  };

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        title="Cambiar tema"
        aria-label="Selector de tema"
        aria-expanded={open}
        aria-haspopup="menu"
        className="font-medium rounded-lg transition-all inline-flex items-center justify-center cursor-pointer select-none text-slate-400 hover:bg-slate-800 hover:text-slate-200 active:bg-slate-700 px-3 py-1.5 text-sm gap-1.5"
      >
        <ThemeIcon theme={theme} />
      </button>

      {open && (
        <>
          {/* Overlay para cerrar al hacer click fuera */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => {
              setOpen(false);
              triggerRef.current?.focus();
            }}
            aria-hidden
          />
          <div
            role="menu"
            aria-label="Seleccionar tema"
            className="absolute right-0 top-full mt-1 z-50 w-36 rounded-md border border-gray-200 bg-gray-50 py-1 shadow-lg shadow-black/20"
          >
            {OPTIONS.map(({ value, label, Icon }) => (
              <button
                key={value}
                role="menuitemradio"
                aria-checked={theme === value}
                type="button"
                onClick={() => handleSelect(value)}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-sm transition-colors ${
                  theme === value
                    ? "text-blue-600 bg-blue-50"
                    : "text-gray-700 hover:bg-gray-200 hover:text-gray-900"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
