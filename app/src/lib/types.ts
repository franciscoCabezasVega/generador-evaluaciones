export type ProductType = string;
export type TaskStatus = "Completada" | "Deprecada" | "Pendiente";
export type TshirtSize = string;
export type TaskProjectType = string;
export type UserRole = "admin" | "gestor" | "reportero" | "invitado";

// ─── Interfaces de catálogos dinámicos ───────────────────────────────────────
export interface CatalogProduct {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CatalogProjectType {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CatalogComplexity {
  id: string;
  name: string;
  min_hours: number;
  max_hours: number;
  label: string;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CatalogSquad {
  id: string;
  name: string;
  product_id: string;
  product?: { id: string; name: string };
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CatalogQAMember {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CatalogTimingCategory {
  id: string;
  slug: string;
  name: string;
  hex_color: string;
  display_order: number;
  is_system: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  admin: "Administrador - Acceso completo",
  gestor: "Gestor - Gestiona tareas",
  reportero: "Reportero - Genera reportes",
  invitado: "Invitado - Solo lectura",
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
  project_type: TaskProjectType;
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
  project_type: TaskProjectType;
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
  name: string | null;
  lastname: string | null;
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
export type AuditAction = "CREATE" | "UPDATE" | "DELETE";
export type AuditEntityType = "TASK" | "REPORT";

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
export type EvidenceType = "image" | "video" | "link";

export interface EvidenceItem {
  type: EvidenceType;
  value: string | File;
  description?: string;
}

// Feedback Types
export type FeedbackType = "suggestion" | "incident";
export type FeedbackStatus = "new" | "reviewed" | "in_progress" | "resolved";

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

// Task QA - Relación many-to-many entre tareas y QAs asignados (similar a task_squad)
export interface TaskQA {
  id: string;
  task_id: string;
  qa_name: string;
  created_at: string;
  updated_at: string;
}

// Timing QA Entry - Tiempos individuales por QA (nueva estructura dinámica)
export interface TimingQAEntry {
  id: string;
  timing_id: string;
  task_qa_id: string; // FK a task_qa
  qa_name: string; // Populated via join para convenience
  hours_by_category: Record<string, number>; // categoryId → hours
  total_hours: number; // calculado cliente-side como sum(hours_by_category)
  created_at: string;
  updated_at: string;
}

export interface CreateTimingQAEntryInput {
  qa_name: string; // Se usa para buscar/crear task_qa_id
  hours_by_category: Record<string, number>; // categoryId → hours (solo entradas > 0)
}

// Timing Types - Tiempos por tarea
export interface TaskTiming {
  id: string;
  task_id: string;
  month: number;
  year: number;
  total_hours: number; // calculado
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

// Vista virtual: tarea con su timing opcional (para la lista de Tiempos)
export type TaskWithTiming = Task & { timing?: TaskTiming };

// Tiempo formateado para visualización
export interface FormattedTime {
  hours: number;
  days: number;
  months: number;
  remaining_hours: number;
}

// Métricas de tiempos por product_type (estructura dinámica)
export interface SquadTimingMetrics {
  product_type: string;
  totals_by_category: Record<string, number>; // categoryId → total hours
  averages_by_category: Record<string, number>; // categoryId → avg hours
  total_hours: number;
  avg_total_hours: number;
  task_count: number;
}

// Métricas de tiempos por QA (estructura dinámica)
export interface QATimingMetrics {
  qa_name: string;
  totals_by_category: Record<string, number>; // categoryId → total hours
  averages_by_category: Record<string, number>; // categoryId → avg hours
  total_hours: number;
  avg_total_hours: number;
  task_count: number;
  efficiency_rate: number; // % testing efectivo vs total (calculado por slug)
  retest_rate: number; // % retest vs testing efectivo (calculado por slug)
}
