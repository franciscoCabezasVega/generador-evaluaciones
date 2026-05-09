"use client";

import React, {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
} from "react";
import {
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  subDays,
  subWeeks,
  subMonths,
  format,
  isBefore,
  isAfter,
  isSameDay,
  getDaysInMonth,
  setMonth as dfSetMonth,
  getMonth,
  getYear,
  addMonths,
  subYears,
} from "date-fns";
import { es } from "date-fns/locale";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ── Types ───────────────────────────────────────────────────────────────
export interface DateRange {
  startDate: Date;
  endDate: Date;
}

export interface DateRangePreset {
  label: string;
  getRange: () => DateRange;
}

interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  className?: string;
  /** Disable dates after this date (defaults to today) */
  maxDate?: Date;
}

// ── Default Presets ─────────────────────────────────────────────────────
function getDefaultPresets(): DateRangePreset[] {
  return [
    {
      label: "Hoy",
      getRange: () => ({
        startDate: startOfDay(new Date()),
        endDate: endOfDay(new Date()),
      }),
    },
    {
      label: "Ayer",
      getRange: () => {
        const yesterday = subDays(new Date(), 1);
        return {
          startDate: startOfDay(yesterday),
          endDate: endOfDay(yesterday),
        };
      },
    },
    {
      label: "Últimos 7 días",
      getRange: () => ({
        startDate: startOfDay(subDays(new Date(), 6)),
        endDate: endOfDay(new Date()),
      }),
    },
    {
      label: "Últimos 30 días",
      getRange: () => ({
        startDate: startOfDay(subDays(new Date(), 29)),
        endDate: endOfDay(new Date()),
      }),
    },
    {
      label: "Esta semana",
      getRange: () => ({
        startDate: startOfWeek(new Date(), { weekStartsOn: 1 }),
        endDate: endOfWeek(new Date(), { weekStartsOn: 1 }),
      }),
    },
    {
      label: "Semana pasada",
      getRange: () => {
        const lastWeek = subWeeks(new Date(), 1);
        return {
          startDate: startOfWeek(lastWeek, { weekStartsOn: 1 }),
          endDate: endOfWeek(lastWeek, { weekStartsOn: 1 }),
        };
      },
    },
    {
      label: "Este mes",
      getRange: () => ({
        startDate: startOfMonth(new Date()),
        endDate: endOfMonth(new Date()),
      }),
    },
    {
      label: "Mes pasado",
      getRange: () => {
        const lastMonth = subMonths(new Date(), 1);
        return {
          startDate: startOfMonth(lastMonth),
          endDate: endOfMonth(lastMonth),
        };
      },
    },
    {
      label: "Últimos 3 meses",
      getRange: () => ({
        startDate: startOfMonth(subMonths(new Date(), 2)),
        endDate: endOfMonth(new Date()),
      }),
    },
    {
      label: "Este año",
      getRange: () => ({
        startDate: startOfYear(new Date()),
        endDate: endOfDay(new Date()),
      }),
    },
    {
      label: "Año pasado",
      getRange: () => {
        const lastYear = subYears(new Date(), 1);
        return {
          startDate: startOfYear(lastYear),
          endDate: endOfMonth(dfSetMonth(lastYear, 11)),
        };
      },
    },
  ];
}

// ── Helpers ─────────────────────────────────────────────────────────────
const DAY_NAMES = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"];

function getCalendarDays(year: number, month: number): (Date | null)[] {
  const firstDay = new Date(year, month, 1);
  // Monday=0 ... Sunday=6
  let dayOfWeek = firstDay.getDay() - 1;
  if (dayOfWeek < 0) dayOfWeek = 6;

  const daysInMonth = getDaysInMonth(firstDay);
  const cells: (Date | null)[] = [];

  // Fill blanks before first day
  for (let i = 0; i < dayOfWeek; i++) cells.push(null);

  // Fill days
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(new Date(year, month, d));
  }

  return cells;
}

function formatDisplayRange(range: DateRange): string {
  const start = format(range.startDate, "d MMM yyyy", { locale: es });
  const end = format(range.endDate, "d MMM yyyy", { locale: es });
  if (isSameDay(range.startDate, range.endDate)) return start;
  return `${start}  →  ${end}`;
}

function findMatchingPreset(
  range: DateRange,
  presets: DateRangePreset[],
): string | null {
  for (const preset of presets) {
    const p = preset.getRange();
    if (
      isSameDay(p.startDate, range.startDate) &&
      isSameDay(p.endDate, range.endDate)
    ) {
      return preset.label;
    }
  }
  return null;
}

// ── Mini Calendar Component ─────────────────────────────────────────────
interface MiniCalendarProps {
  viewDate: Date;
  onChangeViewDate: (d: Date) => void;
  rangeStart: Date | null;
  rangeEnd: Date | null;
  hoverDate: Date | null;
  onSelectDate: (d: Date) => void;
  onHoverDate: (d: Date | null) => void;
  maxDate?: Date;
}

function MiniCalendar({
  viewDate,
  onChangeViewDate,
  rangeStart,
  rangeEnd,
  hoverDate,
  onSelectDate,
  onHoverDate,
  maxDate,
}: MiniCalendarProps) {
  const year = getYear(viewDate);
  const month = getMonth(viewDate);
  const days = useMemo(() => getCalendarDays(year, month), [year, month]);

  const goToPrevMonth = () => onChangeViewDate(subMonths(viewDate, 1));
  const goToNextMonth = () => onChangeViewDate(addMonths(viewDate, 1));

  const isInRange = (day: Date) => {
    if (!rangeStart) return false;
    const end = rangeEnd || hoverDate;
    if (!end) return false;

    const actualStart = isBefore(rangeStart, end) ? rangeStart : end;
    const actualEnd = isAfter(rangeStart, end) ? rangeStart : end;

    return (
      (isAfter(day, actualStart) || isSameDay(day, actualStart)) &&
      (isBefore(day, actualEnd) || isSameDay(day, actualEnd))
    );
  };

  const isStart = (day: Date) => rangeStart && isSameDay(day, rangeStart);
  const isEnd = (day: Date) => {
    const end = rangeEnd || hoverDate;
    return end && isSameDay(day, end);
  };
  const isDisabled = (day: Date) => maxDate && isAfter(day, maxDate);

  return (
    <div className="select-none">
      {/* Month/Year header */}
      <div className="flex items-center justify-between mb-2 px-1">
        <button
          type="button"
          onClick={goToPrevMonth}
          className="p-1 rounded hover:bg-gray-100 text-gray-600"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="text-sm font-semibold text-gray-800 capitalize">
          {format(viewDate, "MMMM yyyy", { locale: es })}
        </span>
        <button
          type="button"
          onClick={goToNextMonth}
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

      {/* Dates */}
      <div className="grid grid-cols-7 gap-0">
        {days.map((day, idx) => {
          if (!day) {
            return <div key={`blank-${idx}`} className="h-8" />;
          }

          const disabled = isDisabled(day);
          const inRange = isInRange(day);
          const start = isStart(day);
          const end = isEnd(day);
          const today = isSameDay(day, new Date());

          return (
            <button
              key={day.toISOString()}
              type="button"
              disabled={!!disabled}
              onClick={() => onSelectDate(day)}
              onMouseEnter={() => onHoverDate(day)}
              onMouseLeave={() => onHoverDate(null)}
              className={`
                h-8 text-xs font-medium rounded-md transition-all relative
                ${disabled ? "text-gray-300 cursor-not-allowed" : "cursor-pointer"}
                ${inRange && !start && !end ? "bg-blue-50 text-blue-700" : ""}
                ${start || end ? "bg-blue-500 text-white shadow-sm" : ""}
                ${!inRange && !start && !end && !disabled ? "text-gray-700 hover:bg-gray-100" : ""}
                ${today && !start && !end ? "ring-1 ring-blue-300" : ""}
              `}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Main DateRangePicker Component ──────────────────────────────────────
export default function DateRangePicker({
  value,
  onChange,
  className = "",
  maxDate,
}: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectingStart, setSelectingStart] = useState(true);
  const [tempStart, setTempStart] = useState<Date | null>(value.startDate);
  const [tempEnd, setTempEnd] = useState<Date | null>(value.endDate);
  const [hoverDate, setHoverDate] = useState<Date | null>(null);
  const [leftViewDate, setLeftViewDate] = useState(
    startOfMonth(subMonths(value.startDate, 1)),
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const presets = useMemo(() => getDefaultPresets(), []);
  const matchingPreset = findMatchingPreset(value, presets);

  const rightViewDate = useMemo(
    () => addMonths(leftViewDate, 1),
    [leftViewDate],
  );

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

  // Sync temp state when value changes from outside
  useEffect(() => {
    setTempStart(value.startDate);
    setTempEnd(value.endDate);
  }, [value]);

  const handleOpen = useCallback(() => {
    setIsOpen(true);
    setSelectingStart(true);
    setTempStart(value.startDate);
    setTempEnd(value.endDate);
    setLeftViewDate(startOfMonth(subMonths(value.startDate, 1)));
  }, [value]);

  const handleSelectDate = useCallback(
    (day: Date) => {
      if (selectingStart) {
        setTempStart(day);
        setTempEnd(null);
        setSelectingStart(false);
      } else {
        if (tempStart && isBefore(day, tempStart)) {
          // Swap: clicked date becomes start
          setTempEnd(tempStart);
          setTempStart(day);
        } else {
          setTempEnd(day);
        }
        setSelectingStart(true);
      }
    },
    [selectingStart, tempStart],
  );

  const handleApply = useCallback(() => {
    if (tempStart && tempEnd) {
      const start = isBefore(tempStart, tempEnd) ? tempStart : tempEnd;
      const end = isAfter(tempStart, tempEnd) ? tempStart : tempEnd;
      onChange({ startDate: startOfDay(start), endDate: endOfDay(end) });
      setIsOpen(false);
    }
  }, [tempStart, tempEnd, onChange]);

  const handlePreset = useCallback(
    (preset: DateRangePreset) => {
      const range = preset.getRange();
      onChange(range);
      setTempStart(range.startDate);
      setTempEnd(range.endDate);
      setLeftViewDate(startOfMonth(subMonths(range.startDate, 1)));
      setIsOpen(false);
    },
    [onChange],
  );

  const handleClear = useCallback(() => {
    setTempStart(null);
    setTempEnd(null);
    setSelectingStart(true);
  }, []);

  const canApply = tempStart !== null && tempEnd !== null;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger button */}
      <button
        id="date-range-picker-trigger"
        type="button"
        onClick={handleOpen}
        aria-label="Selector de rango de fechas"
        className="flex items-center gap-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:border-blue-400 hover:bg-blue-50/30 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/30"
      >
        <Calendar size={16} className="text-gray-400 flex-shrink-0" />
        <span className="flex-1 text-left truncate">
          {matchingPreset ? (
            <span>
              <span className="font-medium text-blue-600">
                {matchingPreset}
              </span>
              <span className="text-gray-400 ml-1.5 text-xs">
                ({formatDisplayRange(value)})
              </span>
            </span>
          ) : (
            formatDisplayRange(value)
          )}
        </span>
        <ChevronDown
          size={16}
          className={`text-gray-400 flex-shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1 rounded-xl border border-gray-200 bg-white shadow-xl animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="flex">
            {/* Presets sidebar */}
            <div className="w-40 border-r border-gray-100 p-2 space-y-0.5 bg-gray-50/50 rounded-l-xl">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-2 py-1">
                Acceso rápido
              </p>
              {presets.map((preset) => {
                const active = findMatchingPreset(value, [preset]) !== null;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => handlePreset(preset)}
                    className={`
                      w-full text-left px-2.5 py-1.5 text-xs rounded-md transition-colors
                      ${
                        active
                          ? "bg-blue-100 text-blue-700 font-semibold"
                          : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                      }
                    `}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>

            {/* Calendars */}
            <div className="p-3">
              {/* Selection hint */}
              <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-3 text-xs">
                  <div
                    className={`px-2 py-1 rounded-md border transition-colors ${
                      selectingStart
                        ? "border-blue-400 bg-blue-50 text-blue-700 font-medium"
                        : "border-gray-200 text-gray-500"
                    }`}
                  >
                    {tempStart
                      ? format(tempStart, "d MMM yyyy", { locale: es })
                      : "Inicio"}
                  </div>
                  <span className="text-gray-300">→</span>
                  <div
                    className={`px-2 py-1 rounded-md border transition-colors ${
                      !selectingStart
                        ? "border-blue-400 bg-blue-50 text-blue-700 font-medium"
                        : "border-gray-200 text-gray-500"
                    }`}
                  >
                    {tempEnd
                      ? format(tempEnd, "d MMM yyyy", { locale: es })
                      : "Fin"}
                  </div>
                </div>
                {(tempStart || tempEnd) && (
                  <button
                    type="button"
                    onClick={handleClear}
                    className="p-1 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100"
                    title="Limpiar selección"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Two-month calendar */}
              <div className="flex gap-4">
                <div className="w-56">
                  <MiniCalendar
                    viewDate={leftViewDate}
                    onChangeViewDate={setLeftViewDate}
                    rangeStart={tempStart}
                    rangeEnd={tempEnd}
                    hoverDate={hoverDate}
                    onSelectDate={handleSelectDate}
                    onHoverDate={setHoverDate}
                    maxDate={maxDate}
                  />
                </div>
                <div className="w-56">
                  <MiniCalendar
                    viewDate={rightViewDate}
                    onChangeViewDate={(d) => setLeftViewDate(subMonths(d, 1))}
                    rangeStart={tempStart}
                    rangeEnd={tempEnd}
                    hoverDate={hoverDate}
                    onSelectDate={handleSelectDate}
                    onHoverDate={setHoverDate}
                    maxDate={maxDate}
                  />
                </div>
              </div>

              {/* Apply/Cancel */}
              <div className="flex justify-end gap-2 mt-3 pt-3 border-t border-gray-100">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsOpen(false)}
                  className="text-xs"
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={!canApply}
                  onClick={handleApply}
                  className="text-xs bg-blue-500 hover:bg-blue-600 disabled:opacity-50"
                >
                  Aplicar
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
