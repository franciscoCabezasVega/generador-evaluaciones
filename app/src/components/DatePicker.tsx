"use client";

import React, {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
} from "react";
import {
  format,
  isSameDay,
  getDaysInMonth,
  getMonth,
  getYear,
  addMonths,
  subMonths,
  parse,
  parseISO,
  isValid,
} from "date-fns";
import { es } from "date-fns/locale";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";

// ── Helpers ─────────────────────────────────────────────────────────────
const DAY_NAMES = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"];

function getCalendarDays(year: number, month: number): (Date | null)[] {
  const firstDay = new Date(year, month, 1);
  let dayOfWeek = firstDay.getDay() - 1;
  if (dayOfWeek < 0) dayOfWeek = 6;

  const daysInMonth = getDaysInMonth(firstDay);
  const cells: (Date | null)[] = [];

  for (let i = 0; i < dayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  return cells;
}

/** Intenta parsear texto escrito por el usuario en varios formatos comunes */
function tryParseText(text: string): Date | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const formats = [
    "dd/MM/yyyy",
    "d/M/yyyy",
    "dd-MM-yyyy",
    "d-M-yyyy",
    "yyyy-MM-dd",
  ];

  for (const fmt of formats) {
    const parsed = parse(trimmed, fmt, new Date());
    if (isValid(parsed)) return parsed;
  }
  return null;
}

// ── Props ────────────────────────────────────────────────────────────────
interface DatePickerProps {
  /** ISO date string (YYYY-MM-DD) or empty string */
  value: string;
  onChange: (isoDate: string) => void;
  className?: string;
  hasError?: boolean;
  id?: string;
}

// ── Component ────────────────────────────────────────────────────────────
export default function DatePicker({
  value,
  onChange,
  className = "",
  hasError = false,
  id,
}: DatePickerProps) {
  const selectedDate = useMemo(() => {
    if (!value) return null;
    const d = parseISO(value);
    return isValid(d) ? d : null;
  }, [value]);

  const [isOpen, setIsOpen] = useState(false);
  const [inputText, setInputText] = useState(
    selectedDate ? format(selectedDate, "dd/MM/yyyy") : "",
  );
  const [inputError, setInputError] = useState(false);
  const [viewDate, setViewDate] = useState<Date>(selectedDate ?? new Date());
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync inputText when value changes from outside (e.g. calendar pick)
  useEffect(() => {
    setInputText(selectedDate ? format(selectedDate, "dd/MM/yyyy") : "");
    if (selectedDate) setViewDate(selectedDate);
  }, [selectedDate]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [isOpen]);

  const handleSelectDate = useCallback(
    (day: Date) => {
      onChange(format(day, "yyyy-MM-dd"));
      setIsOpen(false);
      setInputError(false);
    },
    [onChange],
  );

  /** Aplica el texto ingresado manualmente */
  const commitInputText = useCallback(
    (text: string) => {
      if (!text.trim()) {
        onChange("");
        setInputError(false);
        return;
      }
      const parsed = tryParseText(text);
      if (parsed) {
        onChange(format(parsed, "yyyy-MM-dd"));
        setViewDate(parsed);
        setInputError(false);
      } else {
        setInputError(true);
      }
    },
    [onChange],
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    setInputText(text);
    // Auto-format: insert slashes while typing DD/MM/YYYY
    setInputError(false);
  };

  const handleInputBlur = () => {
    commitInputText(inputText);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      commitInputText(inputText);
      setIsOpen(false);
    }
    if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  const year = getYear(viewDate);
  const month = getMonth(viewDate);
  const days = useMemo(() => getCalendarDays(year, month), [year, month]);

  const borderClass = hasError || inputError
    ? "border-red-500"
    : isOpen
      ? "border-blue-400"
      : "border-gray-300";

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Input + calendar icon */}
      <div
        className={`flex items-center gap-2 w-full rounded-lg border px-3 py-2 text-sm transition-colors
          ${borderClass}
          ${hasError ? "bg-red-950/40" : "bg-transparent"}
        `}
      >
        <button
          type="button"
          onClick={() => {
            setIsOpen((o) => !o);
            if (!isOpen) setTimeout(() => inputRef.current?.focus(), 50);
          }}
          className="flex-shrink-0 text-gray-300 hover:text-blue-400 transition-colors"
          tabIndex={-1}
          aria-label="Abrir calendario"
        >
          <Calendar size={14} />
        </button>
        <input
          ref={inputRef}
          id={id}
          type="text"
          value={inputText}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          onKeyDown={handleInputKeyDown}
          onFocus={() => setIsOpen(true)}
          placeholder="DD/MM/AAAA"
          className={`flex-1 bg-transparent outline-none min-w-0 placeholder-gray-400
            ${hasError || inputError ? "text-red-300" : ""}
          `}
        />
        {inputError && (
          <span className="text-[10px] text-red-400 flex-shrink-0">
            Formato inválido
          </span>
        )}
      </div>

      {/* Dropdown calendar */}
      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1 rounded-xl border border-gray-200 bg-white shadow-xl">
          <div className="p-3 w-56 select-none">
            {/* Month/Year navigation */}
            <div className="flex items-center justify-between mb-2 px-1">
              <button
                type="button"
                onClick={() => setViewDate(subMonths(viewDate, 1))}
                className="p-1 rounded hover:bg-gray-100 text-gray-600"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm font-semibold text-gray-800 capitalize">
                {format(viewDate, "MMMM yyyy", { locale: es })}
              </span>
              <button
                type="button"
                onClick={() => setViewDate(addMonths(viewDate, 1))}
                className="p-1 rounded hover:bg-gray-100 text-gray-600"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            {/* Day names */}
            <div className="grid grid-cols-7 gap-0 mb-1">
              {DAY_NAMES.map((dn) => (
                <div
                  key={dn}
                  className="text-center text-[10px] font-medium text-gray-400 py-1"
                >
                  {dn}
                </div>
              ))}
            </div>

            {/* Days */}
            <div className="grid grid-cols-7 gap-0">
              {days.map((day, idx) => {
                if (!day) return <div key={`blank-${idx}`} className="h-8" />;

                const isSelected = selectedDate && isSameDay(day, selectedDate);
                const isToday = isSameDay(day, new Date());

                return (
                  <button
                    key={day.toISOString()}
                    type="button"
                    onClick={() => handleSelectDate(day)}
                    className={`
                      h-8 text-xs font-medium rounded-md transition-all
                      ${isSelected
                        ? "bg-blue-500 text-white shadow-sm"
                        : isToday
                          ? "ring-1 ring-blue-300 text-gray-700 hover:bg-gray-100"
                          : "text-gray-700 hover:bg-gray-100"
                      }
                    `}
                  >
                    {day.getDate()}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
