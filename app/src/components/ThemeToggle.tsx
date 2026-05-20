"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
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

  // Anti-flash: no renderizar hasta que el componente esté montado en cliente
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="w-8 h-8" aria-hidden />;
  }

  const handleSelect = (value: ThemeOption) => {
    setTheme(value);
    setOpen(false);
    // Persistir en BD en background si hay usuario autenticado
    if (user) {
      userProfileService.updateThemePreference(value).catch(() => {
        // Error silencioso — localStorage ya quedó guardado por next-themes
      });
    }
  };

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen((prev) => !prev)}
        title="Cambiar tema"
        aria-label="Selector de tema"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <ThemeIcon theme={theme} />
      </Button>

      {open && (
        <>
          {/* Overlay para cerrar al hacer click fuera */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <ul
            role="listbox"
            aria-label="Seleccionar tema"
            className="absolute right-0 top-full mt-1 z-50 w-36 rounded-md border border-gray-200 bg-gray-50 py-1 shadow-lg shadow-black/20"
          >
            {OPTIONS.map(({ value, label, Icon }) => (
              <li key={value} role="option" aria-selected={theme === value}>
                <button
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
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
