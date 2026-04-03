/**
 * Configuración de tours para la aplicación
 * Define los pasos de cada tour por sección
 */

export type TourType = 'tasks' | 'reports' | 'audit' | 'feedback' | null;

export interface TourStep {
  target: string;
  title: string;
  content: string;
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  showButtons?: boolean;
  showSkip?: boolean;
  requiresAction?: boolean; // Si true, hace click automático y avanza al siguiente paso
}

export const TOURS_CONFIG: Record<Exclude<TourType, null>, TourStep[]> = {
  tasks: [
    {
      target: 'body',
      title: '🎯 Bienvenido a la Gestión de Tareas',
      content:
        'Esta sección te permite crear, editar y gestionar todas las tareas que serán evaluadas mensualmente por squad. Vamos a recorrer todos los elementos.',
      placement: 'center',
      showButtons: true,
      showSkip: true,
    },
    {
      target: '[data-tour="task-create-btn"]',
      title: '➕ Crear Nueva Tarea',
      content:
        'Haz clic aquí para abrir el formulario y registrar una nueva tarea con todos sus detalles: nombre, link, producto, squad, estado y devoluciones.',
      placement: 'bottom',
      showButtons: true,
      showSkip: true,
    },
    {
      target: '[data-tour="task-search"]',
      title: '🔎 Buscar Tareas',
      content:
        'En esta sección puedes escribir el nombre de la tarea para filtrar rápidamente. Tipo el nombre que buscas y la tabla se actualiza automáticamente.',
      placement: 'bottom',
      showButtons: true,
      showSkip: true,
    },
    {
      target: '[data-tour="task-filter-button"]',
      title: '🔽 Mostrar/Ocultar Filtros',
      content:
        'Haz clic aquí para expandir los filtros avanzados. Podrás filtrar por mes, año, producto, squad y estado.',
      placement: 'bottom',
      showButtons: true,
      showSkip: true,
    },
    {
      target: '[data-tour="task-filters"]',
      title: '🔍 Filtros Avanzados',
      content:
        'Usa estos filtros para buscar tareas específicas por mes, año, producto (Core, Platform, Commerce), squad y estado (Completada, Deprecada, Pendiente). Solo las Completadas se incluyen en reportes.',
      placement: 'bottom',
      showButtons: true,
      showSkip: true,
    },
    {
      target: '[data-tour="task-table"]',
      title: '📋 Tabla de Tareas',
      content:
        'Aquí aparecen todas las tareas cargadas. Cada fila muestra: nombre, producto, estado, equipo(s), nota promedio y acciones.',
      placement: 'top',
      showButtons: true,
      showSkip: true,
    },
    {
      target: '[data-tour="task-table-row"]',
      title: '📌 Fila de Tarea',
      content:
        'Cada fila representa una tarea. Haz clic para expandirla y ver detalles específicos de cada equipo asignado, incluyendo devoluciones (bajas, medias, graves) y la nota calculada.',
      placement: 'right',
      showButtons: true,
      showSkip: true,
    },
    {
      target: '[data-tour="task-row-expand-btn"]',
      title: '📊 Detalles Expandidos',
      content:
        'Aquí ves el desglose por equipo:\n• Equipo asignado (e.g., "Squad 2 - Alex")\n• Devoluciones bajas, medias y graves\n• Nota calculada automáticamente (máximo 10)\n• Notas adicionales del evaluador',
      placement: 'right',
      showButtons: true,
      showSkip: true,
    },
    {
      target: '[data-tour="task-actions"]',
      title: '⚙️ Acciones de Tarea',
      content:
        'En cada fila puedes:\n• Editar (icono de lápiz): modifica los detalles de la tarea\n• Eliminar (icono de papelera): borra la tarea de forma permanente\nSolo usuarios Admin y Gestores pueden realizar estas acciones.',
      placement: 'left',
      showButtons: true,
      showSkip: true,
    },
  ],

  reports: [
    {
      target: 'body',
      title: '📊 Bienvenido a Reportes',
      content:
        'Los reportes consolidan la información de todas las tareas completadas para un squad, mes y año específicos. Se generan automáticamente y son versionados.',
      placement: 'center',
      showButtons: true,
      showSkip: true,
    },
    {
      target: '[data-tour="report-filters"]',
      title: '🔍 Filtrar Reportes',
      content:
        'Filtra por mes, año, producto y squad para encontrar el reporte que necesitas visualizar o descargar.',
      placement: 'bottom',
      showButtons: true,
      showSkip: true,
    },
    {
      target: '[data-tour="report-generate-btn"]',
      title: '🔄 Generar Reporte',
      content:
        'Haz clic aquí para generar un nuevo reporte. Se creará una nueva versión sin sobrescribir reportes anteriores. La aplicación generará comentarios de IA sobre desempeño y comunicación.',
      placement: 'bottom',
      showButtons: true,
      showSkip: true,
    },
    {
      target: '[data-tour="report-list"]',
      title: '📜 Lista de Reportes',
      content:
        'Aquí aparecen todos los reportes generados. Cada reporte muestra el squad, mes, año, versión y fecha de creación. Los reportes más recientes aparecen primero.',
      placement: 'top',
      showButtons: true,
      showSkip: true,
    },
    {
      target: '[data-tour="report-view"]',
      title: '👁️ Visualizar Reporte',
      content:
        'Haz clic en el botón "Ver" para abrir el reporte y ver:\n• Tabla detallada de tareas con notas\n• Nota final del squad\n• Comentarios de IA sobre desempeño\n• Comentarios de IA sobre comunicación',
      placement: 'left',
      showButtons: true,
      showSkip: true,
    },
    {
      target: '[data-tour="report-download"]',
      title: '⬇️ Descargar Reporte',
      content:
        'Descarga el reporte en formato PDF. También puedes copiar el contenido manualmente desde la vista previa.',
      placement: 'left',
      showButtons: true,
      showSkip: true,
    },
    {
      target: '[data-tour="report-delete"]',
      title: '🗑️ Eliminar Reporte',
      content:
        'Aquí puedes eliminar un reporte si es necesario. Esta acción es irreversible.',
      placement: 'left',
      showButtons: true,
      showSkip: true,
    },
    {
      target: '[data-tour="report-versioning"]',
      title: '📌 Versionado de Reportes',
      content:
        'Cada vez que generas un reporte para el mismo squad, mes y año, se crea una nueva versión. Esto permite mantener un histórico de todos los reportes generados sin pérdida de datos.',
      placement: 'bottom',
      showButtons: true,
      showSkip: true,
    },
  ],

  audit: [
    {
      target: 'body',
      title: '🔐 Bienvenido a Auditoría',
      content:
        'La sección de auditoría te permite revisar un registro completo de todos los cambios realizados en tareas y reportes. Solo admins pueden verla.',
      placement: 'center',
      showButtons: true,
      showSkip: true,
    },
    {
      target: '[data-tour="audit-filters"]',
      title: '🔍 Filtrar Registros',
      content:
        'Filtra por tipo de entidad (TASK, REPORT), acción (CREATE, UPDATE, DELETE), usuario y rango de resultados para analizar cambios específicos.',
      placement: 'bottom',
      showButtons: true,
      showSkip: true,
    },
    {
      target: '[data-tour="audit-table"]',
      title: '📋 Registro de Cambios',
      content:
        'Aquí ves todos los cambios registrados:\n• Tipo de entidad y acción\n• Usuario que realizó el cambio\n• Fecha y hora del cambio\n• Cambios antes y después (en JSON)',
      placement: 'top',
      showButtons: true,
      showSkip: true,
    },
    {
      target: '[data-tour="audit-expand"]',
      title: '🔎 Ver Detalles',
      content:
        'Haz clic en cualquier fila para expandirla y ver los detalles completos del cambio, incluyendo qué exactamente fue modificado.',
      placement: 'right',
      showButtons: true,
      showSkip: true,
    },
    {
      target: '[data-tour="audit-pagination"]',
      title: '📄 Paginación',
      content:
        'Navega entre páginas para ver más registros. Puedes cambiar la cantidad de registros mostrados por página.',
      placement: 'top',
      showButtons: true,
      showSkip: true,
    },
  ],

  feedback: [
    {
      target: 'body',
      title: '💬 Reportar Problemas y Sugerencias',
      content:
        'Esta función te permite reportar problemas, sugerencias o incidencias. Tu feedback nos ayuda a mejorar continuamente la aplicación.',
      placement: 'center',
      showButtons: true,
      showSkip: true,
    },
    {
      target: '[data-tour="feedback-button"]',
      title: '💬 Botón Flotante de Feedback',
      content:
        'Haz clic en este botón para abrir el formulario de reportes. Está disponible en cualquier página de la aplicación.',
      placement: 'left',
      showButtons: true,
      showSkip: true,
    },
  ],
};

/**
 * Metadata sobre los tours disponibles
 */
export const TOURS_METADATA: Record<Exclude<TourType, null>, { title: string; description: string; icon: string }> = {
  tasks: {
    title: 'Gestión de Tareas',
    description: 'Aprende a crear, editar y gestionar tareas. Incluye explicación de productos, squads dinámicos y cálculo de notas.',
    icon: '📋',
  },
  reports: {
    title: 'Generación de Reportes',
    description: 'Descubre cómo generar, visualizar y descargar reportes con comentarios de IA.',
    icon: '📊',
  },
  audit: {
    title: 'Auditoría y Logs',
    description: 'Revisa el registro completo de cambios realizados en tareas y reportes.',
    icon: '🔐',
  },
  feedback: {
    title: 'Reportar Problemas',
    description: 'Aprende cómo reportar problemas, sugerencias e incidencias para ayudarnos a mejorar.',
    icon: '💬',
  },
};
