import { faker } from '@faker-js/faker';

/**
 * Dynamic test data factory using @faker-js/faker.
 *
 * Avoids the "Pesticide Paradox" by generating unique, randomized data
 * on each test run. Every execution exercises different product types,
 * squads, devoluciones, statuses, etc.
 *
 * Single Responsibility: data generation only — no page interactions.
 */

// ── Domain constants (mirrors src/lib/types.ts) ──────────────

export const PRODUCT_TYPES = ['Platform', 'Core', 'Commerce'] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

export const SQUADS_BY_TYPE: Record<ProductType, string[]> = {
  Platform: ['Squad 1 - Alpha', 'Squad 2 - Beta', 'Squad 3 - Gamma'],
  Core: ['Squad 1 - Delta', 'Squad 2 - Epsilon', 'Squad 3 - Zeta'],
  Commerce: ['Identity & Auth', 'Payments', 'Search & Commerce - Nova'],
};

export const STATUSES = ['Completada', 'Deprecada', 'Pendiente'] as const;

export const QA_MEMBERS = [
  'Alex Torres',
  'Carlos Mendez',
  'Diana Lopez',
  'Elena Ruiz',
  'Felipe Vargas',
  'Gabriela Soto',
  'Hugo Paredes',
] as const;

export const TSHIRT_SIZES = ['Mínima', 'Menor', 'Estándar', 'Mayor', 'Máxima'] as const;
export type TshirtSize = (typeof TSHIRT_SIZES)[number];

export const TASK_PROJECT_TYPES = [
  'Integración',
  'Bug fix',
  'Migración',
  'Infraestructura',
  'Nueva funcionalidad',
  'Refactorización',
  'Seguridad',
] as const;
export type TaskProjectType = (typeof TASK_PROJECT_TYPES)[number];

// ── Generators ────────────────────────────────────────────────

/** Generate a unique task name with a faker word + timestamp for traceability */
export function randomTaskName(): string {
  const word = faker.commerce.productName();
  const suffix = Date.now().toString(36);
  return `E2E ${word} ${suffix}`;
}

/** Generate a plausible task URL */
export function randomTaskLink(): string {
  return faker.internet.url({ protocol: 'https' }) + '/task-' + faker.string.alphanumeric(6);
}

/** Pick a random product type */
export function randomProductType(): ProductType {
  return faker.helpers.arrayElement([...PRODUCT_TYPES]);
}

/** Pick 1–N random squads for the given product type (at least 1) */
export function randomSquads(productType: ProductType, count?: number): string[] {
  const available = SQUADS_BY_TYPE[productType];
  const howMany = count ?? faker.number.int({ min: 1, max: available.length });
  return faker.helpers.arrayElements(available, howMany);
}

/** Pick a random status */
export function randomStatus(): (typeof STATUSES)[number] {
  return faker.helpers.arrayElement([...STATUSES]);
}

/** Generate random devoluciones (returns) — integers 0..15 */
export function randomReturns() {
  return {
    low: faker.number.int({ min: 0, max: 15 }),
    medium: faker.number.int({ min: 0, max: 5 }),
    high: faker.number.int({ min: 0, max: 3 }),
  };
}

/** Generate optional additional notes (50% chance of having notes) */
export function randomNotes(): string {
  return faker.datatype.boolean()
    ? faker.lorem.sentence({ min: 3, max: 10 })
    : '';
}

/** Pick a random T-shirt size */
export function randomTshirtSize(): TshirtSize {
  return faker.helpers.arrayElement([...TSHIRT_SIZES]);
}

/** Pick a random task project type */
export function randomProjectType(): TaskProjectType {
  return faker.helpers.arrayElement([...TASK_PROJECT_TYPES]);
}

/** Generate a random effort score date (within current month) */
export function randomEffortScoreDate(): string {
  const now = new Date();
  const day = faker.number.int({ min: 1, max: 28 });
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  return `${year}-${month}-${String(day).padStart(2, '0')}`;
}

// ── Composite generator ───────────────────────────────────────

export interface RandomTaskData {
  name: string;
  link: string;
  productType: ProductType;
  squads: string[];
  status: (typeof STATUSES)[number];
  returns: { low: number; medium: number; high: number };
  notes: string;
  qaMembers: string[];
  tshirtSize: TshirtSize;
  projectType: TaskProjectType;
  effortScoreDate: string;
}

/**
 * Generate a complete random task payload.
 * Each invocation produces different data to defeat the pesticide paradox.
 */
export function generateRandomTask(overrides?: Partial<RandomTaskData>): RandomTaskData {
  const productType = overrides?.productType ?? randomProductType();
  return {
    name: overrides?.name ?? randomTaskName(),
    link: overrides?.link ?? randomTaskLink(),
    productType,
    squads: overrides?.squads ?? randomSquads(productType),
    status: overrides?.status ?? 'Completada', // Default to Completada for score tests
    returns: overrides?.returns ?? randomReturns(),
    notes: overrides?.notes ?? randomNotes(),
    qaMembers: overrides?.qaMembers ?? faker.helpers.arrayElements([...QA_MEMBERS], faker.number.int({ min: 1, max: 3 })),
    tshirtSize: overrides?.tshirtSize ?? randomTshirtSize(),
    projectType: overrides?.projectType ?? randomProjectType(),
    effortScoreDate: overrides?.effortScoreDate ?? randomEffortScoreDate(),
  };
}

/**
 * Generate edited values (new name and link) to simulate an update.
 */
export function generateEditedTask(): { name: string; link: string } {
  return {
    name: `E2E Edited ${faker.commerce.productName()} ${Date.now().toString(36)}`,
    link: faker.internet.url({ protocol: 'https' }) + '/edited-' + faker.string.alphanumeric(6),
  };
}
