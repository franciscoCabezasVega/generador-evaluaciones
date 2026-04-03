export type ProductType = 'Core' | 'Platform' | 'Commerce';
export type TaskStatus = 'Completada' | 'Deprecada' | 'Pendiente';
export type TshirtSize = 'Mínima' | 'Menor' | 'Estándar' | 'Mayor' | 'Máxima';
export type TaskCategory = 'Integración' | 'Bug fix' | 'Migración' | 'Infraestructura' | 'Nueva funcionalidad' | 'Refactorización' | 'Seguridad';
export type UserRole = 'admin' | 'gestor' | 'reportero' | 'invitado';

export const TSHIRT_SIZES: TshirtSize[] = ['Mínima', 'Menor', 'Estándar', 'Mayor', 'Máxima'];

export const TASK_CATEGORIES: TaskCategory[] = [
  'Integración',
  'Bug fix',
  'Migración',
  'Infraestructura',
  'Nueva funcionalidad',
  'Refactorización',
  'Seguridad',
];

// Referencia de horas esperadas por complejidad
export const TSHIRT_SIZE_HOURS: Record<TshirtSize, { min: number; max: number; label: string }> = {
  'Mínima': { min: 0, max: 8, label: 'Hasta 1 día (≤8h)' },
  'Menor': { min: 8, max: 16, label: '1 a 2 días (8-16h)' },
  'Estándar': { min: 16, max: 24, label: '2 a 3 días (16-24h)' },
  'Mayor': { min: 32, max: 48, label: '4 a 6 días (32-48h)' },
  'Máxima': { min: 80, max: 80, label: '~2 semanas (≥80h)' },
};

export const SQUADS_BY_TYPE: Record<ProductType, string[]> = {
  Platform: ['Squad 1 - Alpha', 'Squad 2 - Beta', 'Squad 3 - Gamma'],
  Core: ['Squad 1 - Delta', 'Squad 2 - Epsilon', 'Squad 3 - Zeta'],
  Commerce: ['Identity & Auth', 'Payments', 'Search & Commerce - Nova'],
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  admin: 'Administrador - Acceso completo',
  gestor: 'Gestor - Gestiona tareas',
  reportero: 'Reportero - Genera reportes',
  invitado: 'Invitado - Solo lectura',
};

// TaskSquad: relación many-to-many entre tareas y squads
export interface TaskSquad {
  id: string;
  task_id: string;
  squad: string;
  low_returns: number;
  medium_returns: number;
  high_returns: number;
  calculated_score: number;
  additional_notes?: string;
  created_at: string;
  updated_at: string;
}

// Squad data for task creation/update
export interface SquadData {
  squad: string;
  low_returns: number;
  medium_returns: number;
  high_returns: number;
  additional_notes?: string;
}

export interface Task {
  id: string;
  user_id: string;
  name: string;
  task_link: string;
  product_type: ProductType;
  status: TaskStatus;
  month: number;
  year: number;
  assigned_qa: string[];
  effort_score_date: string;
  tshirt_size: TshirtSize;
  category: TaskCategory;
  created_at: string;
  updated_at: string;
}

export interface CreateTaskInput {
  name: string;
  task_link: string;
  product_type: ProductType;
  squads: SquadData[]; // Array de squads con sus respectivas devoluciones
  status: TaskStatus;
  month: number;
  year: number;
  assigned_qa: string[];
  effort_score_date: string;
  tshirt_size: TshirtSize;
  category: TaskCategory;
}

export interface TaskSquadReportEntry {
  name: string;
  task_link?: string;
  squad: string;
  low_returns: number;
  medium_returns: number;
  high_returns: number;
  calculated_score: number;
  additional_notes?: string;
  status?: string;
}

export interface ReportData {
  productType: string;
  squads: string[];
  tasksBySquad: Record<string, TaskSquadReportEntry[]>;
  deprecatedPendingBySquad?: Record<string, TaskSquadReportEntry[]>;
  squadsScores: Record<string, number>;
}

export interface Report {
  id: string;
  squad: string;
  month: number;
  year: number;
  version: number;
  performance_comment?: string;
  communication_comment?: string;
  report_data: ReportData;
  created_at: string;
  created_by: string;
}

export interface CreateReportInput {
  squad: string;
  month: number;
  year: number;
  performance_comment?: string;
  communication_comment?: string;
  report_data: ReportData;
}

export interface AuthUser {
  id: string;
  email?: string;
  user_metadata?: Record<string, string | number | boolean>;
}

export interface UserProfile {
  id: string;
  email: string;
  role: UserRole;
  role_id: number;
  created_at: string;
  updated_at: string;
}

export interface Role {
  id: number;
  name: UserRole;
  description: string;
}

// Audit Trail Types
export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE';
export type AuditEntityType = 'TASK' | 'REPORT';

// Audit log values with known fields typed
export interface AuditLogValues {
  squads?: Partial<TaskSquad>[];
  [key: string]: unknown;
}

export interface AuditLog {
  id: string;
  user_id: string;
  user_email: string;
  action: AuditAction;
  entity_type: AuditEntityType;
  entity_id: string;
  entity_name: string;
  changes?: Record<string, { old: unknown; new: unknown }>;
  old_values?: AuditLogValues;
  new_values?: AuditLogValues;
  timestamp: string;
}

export interface CreateAuditLogInput {
  user_id: string;
  user_email: string;
  action: AuditAction;
  entity_type: AuditEntityType;
  entity_id: string;
  entity_name: string;
  changes?: Record<string, { old: unknown; new: unknown }>;
  old_values?: AuditLogValues;
  new_values?: AuditLogValues;
}

// Evidence Types
export type EvidenceType = 'image' | 'video' | 'link';

export interface EvidenceItem {
  type: EvidenceType;
  value: string | File;
  description?: string;
}

// Feedback Types
export type FeedbackType = 'suggestion' | 'incident';
export type FeedbackStatus = 'new' | 'reviewed' | 'in_progress' | 'resolved';

export interface FeedbackReport {
  id: string;
  type: FeedbackType;
  description: string;
  evidence_url?: string;
  status: FeedbackStatus;
  created_at: string;
  updated_at: string;
}

export interface CreateFeedbackInput {
  type: FeedbackType;
  description: string;
  evidence_url?: string;
}

export interface FeedbackFormData {
  type: FeedbackType;
  description: string;
  evidence_url?: string;
}

// Lista de QA members
export const QA_MEMBERS = [
  'Alex Torres',
  'Carlos Mendez',
  'Diana Lopez',
  'Elena Ruiz',
  'Felipe Vargas',
  'Gabriela Soto',
  'Hugo Paredes',
] as const;

export type QAMemberName = (typeof QA_MEMBERS)[number] | 'No asignado';

// Task QA - Relación many-to-many entre tareas y QAs asignados (similar a task_squad)
export interface TaskQA {
  id: string;
  task_id: string;
  qa_name: string;
  created_at: string;
  updated_at: string;
}

// Timing QA Entry - Tiempos individuales por QA
export interface TimingQAEntry {
  id: string;
  timing_id: string;
  task_qa_id: string; // FK a task_qa
  qa_name: string; // Populated via join para convenience (no está en la tabla)
  effective_testing_hours: number;
  waiting_environment_hours: number;
  waiting_development_fixes_hours: number;
  retest_hours: number;
  clarification_hours: number;
  total_hours: number; // Calculado automáticamente (generated column)
  created_at: string;
  updated_at: string;
}

export interface CreateTimingQAEntryInput {
  qa_name: string; // Se usa para buscar/crear task_qa_id
  effective_testing_hours: number;
  waiting_environment_hours: number;
  waiting_development_fixes_hours: number;
  retest_hours: number;
  clarification_hours: number;
}

export interface UpdateTimingQAEntryInput {
  qa_name?: string; // Se usa para buscar/crear task_qa_id
  effective_testing_hours?: number;
  waiting_environment_hours?: number;
  waiting_development_fixes_hours?: number;
  retest_hours?: number;
  clarification_hours?: number;
}

// Timing Types - Tiempos por fase de la tarea
export interface TaskTiming {
  id: string;
  task_id: string;
  month: number;
  year: number;
  effective_testing_hours: number;
  waiting_environment_hours: number;
  waiting_development_fixes_hours: number;
  retest_hours: number;
  clarification_hours: number;
  total_hours: number; // Calculado automáticamente
  user_id: string;
  created_at: string;
  updated_at: string;
  // QA entries (populated via join or separate fetch)
  qa_entries?: TimingQAEntry[];
}

export interface CreateTaskTimingInput {
  task_id: string;
  month: number;
  year: number;
  user_id?: string; // Opcional en el cliente, requerido en el servidor
  qa_entries: CreateTimingQAEntryInput[]; // Obligatorio: al menos 1 QA
}

export interface UpdateTaskTimingInput {
  qa_entries: CreateTimingQAEntryInput[]; // Reemplaza todas las entradas QA
}

// Tiempo formateado para visualización
export interface FormattedTime {
  hours: number;
  days: number;
  months: number;
  remaining_hours: number;
}

// Métricas de tiempos por product_type
export interface SquadTimingMetrics {
  product_type: string;
  total_effective_testing_hours: number;
  total_waiting_environment_hours: number;
  total_waiting_development_fixes_hours: number;
  total_retest_hours: number;
  total_clarification_hours: number;
  total_hours: number;
  avg_effective_testing_hours: number;
  avg_waiting_environment_hours: number;
  avg_waiting_development_fixes_hours: number;
  avg_retest_hours: number;
  avg_clarification_hours: number;
  avg_total_hours: number;
  task_count: number;
}

// Métricas de tiempos por QA
export interface QATimingMetrics {
  qa_name: string;
  total_effective_testing_hours: number;
  total_waiting_environment_hours: number;
  total_waiting_development_fixes_hours: number;
  total_retest_hours: number;
  total_clarification_hours: number;
  total_hours: number;
  avg_effective_testing_hours: number;
  avg_waiting_environment_hours: number;
  avg_waiting_development_fixes_hours: number;
  avg_retest_hours: number;
  avg_clarification_hours: number;
  avg_total_hours: number;
  task_count: number;
  efficiency_rate: number; // % testing efectivo vs total
  retest_rate: number; // % retest vs testing efectivo
}
