'use client';

import { TaskTiming } from '@/lib/types';
import { Edit2, Trash2, AlertCircle, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatTime } from '@/lib/timingUtils';

interface TimingsListProps {
  timings: TaskTiming[];
  loading?: boolean;
  onEdit?: (timing: TaskTiming) => void;
  onDelete?: (id: string) => void;
  taskNames?: Record<string, string>;
  taskLinks?: Record<string, string>;
  taskTshirtSizes?: Record<string, string>;
  taskCategories?: Record<string, string>;
  taskEffortDates?: Record<string, string>;
}

export default function TimingsList({
  timings,
  loading = false,
  onEdit,
  onDelete,
  taskNames = {},
  taskLinks = {},
  taskTshirtSizes = {},
  taskCategories = {},
  taskEffortDates = {},
}: TimingsListProps) {
  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="animate-pulse rounded-lg border border-gray-200 bg-gray-100 h-16" />
        ))}
      </div>
    );
  }

  if (!timings || timings.length === 0) {
    return (
      <div className="rounded-lg border-2 border-dashed border-gray-300 p-8 text-center">
        <AlertCircle className="mx-auto mb-2 text-gray-400" size={32} />
        <p className="text-gray-500">No hay tiempos registrados</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {timings.map((timing) => {
        const taskName = taskNames[timing.task_id] || timing.task_id;
        const taskLink = taskLinks[timing.task_id];
        const tshirtSize = taskTshirtSizes[timing.task_id];
        const category = taskCategories[timing.task_id];
        const effortDate = taskEffortDates[timing.task_id];
        const qaEntries = timing.qa_entries || [];
        const qaNames = qaEntries.map(e => e.qa_name);
        
        return (
          <div
            key={timing.id}
            className="rounded-lg border border-gray-200 bg-white p-4"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="font-semibold text-gray-800">
                    {taskLink ? (
                      <a
                        href={taskLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        {taskName}
                      </a>
                    ) : (
                      taskName
                    )}
                  </h4>
                  {tshirtSize && (
                    <span className="inline-flex items-center rounded-full bg-indigo-50 border border-indigo-200 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                      {tshirtSize}
                    </span>
                  )}
                  {category && (
                    <span className="inline-flex items-center rounded-full bg-purple-50 border border-purple-200 px-2 py-0.5 text-xs font-medium text-purple-700">
                      {category}
                    </span>
                  )}
                  {effortDate && (
                    <span className="inline-flex items-center rounded-full bg-green-50 border border-green-200 px-2 py-0.5 text-xs text-green-700">
                      {effortDate}
                    </span>
                  )}
                </div>
                
                {/* QA Badges */}
                {qaNames.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <Users size={14} className="text-gray-400 mt-0.5" />
                    {qaNames.map((name) => (
                      <span
                        key={name}
                        className="inline-flex items-center rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-xs font-medium text-blue-700"
                      >
                        {name}
                      </span>
                    ))}
                  </div>
                )}

                {/* Mini cards de tiempos (total aggregated) */}
                <div className="mt-2 flex flex-wrap gap-2">
                  <div className="flex items-center gap-1 rounded border border-blue-200 bg-blue-50 px-2 py-1 text-xs text-blue-700">
                    <span className="font-semibold">Testing:</span>
                    {formatTime(timing.effective_testing_hours)}
                  </div>
                  <div className="flex items-center gap-1 rounded border border-purple-200 bg-purple-50 px-2 py-1 text-xs text-purple-700">
                    <span className="font-semibold">Espera Ambiente:</span>
                    {formatTime(timing.waiting_environment_hours)}
                  </div>
                  <div className="flex items-center gap-1 rounded border border-orange-200 bg-orange-50 px-2 py-1 text-xs text-orange-700">
                    <span className="font-semibold">Espera Fix:</span>
                    {formatTime(timing.waiting_development_fixes_hours)}
                  </div>
                  <div className="flex items-center gap-1 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">
                    <span className="font-semibold">Retest:</span>
                    {formatTime(timing.retest_hours)}
                  </div>
                  <div className="flex items-center gap-1 rounded border border-yellow-200 bg-yellow-50 px-2 py-1 text-xs text-yellow-700">
                    <span className="font-semibold">Clarificaciones:</span>
                    {formatTime(timing.clarification_hours)}
                  </div>
                </div>

                {/* Per-QA breakdown (collapsed summary) */}
                {qaEntries.length > 1 && (
                  <div className="mt-2 space-y-1">
                    {qaEntries.map((entry) => {
                      const total = Number(entry.total_hours) || 0;
                      return (
                        <div key={entry.id} className="flex items-center gap-2 text-xs text-gray-500">
                          <span className="font-medium w-28 truncate">{entry.qa_name}</span>
                          <div className="flex-1 bg-gray-100 rounded-full h-1.5 border border-gray-300">
                            <div
                              className="h-1.5 rounded-full bg-blue-400"
                              style={{ width: `${timing.total_hours > 0 ? (total / timing.total_hours) * 100 : 0}%` }}
                            />
                          </div>
                          <span className="font-semibold">{formatTime(total)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Total */}
                <div className="mt-2 text-sm font-semibold text-gray-700">
                  Total: {formatTime(timing.total_hours)}
                </div>
              </div>

              {/* Acciones */}
              <div className="flex gap-2 ml-3">
                {onEdit && (
                  <Button
                    onClick={() => onEdit(timing)}
                    size="sm"
                    variant="outline"
                    className="flex items-center gap-1"
                  >
                    <Edit2 size={16} />
                  </Button>
                )}
                {onDelete && (
                  <Button
                    onClick={() => onDelete(timing.id)}
                    size="sm"
                    variant="outline"
                    className="text-red-600 hover:bg-red-50"
                  >
                    <Trash2 size={16} />
                  </Button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
