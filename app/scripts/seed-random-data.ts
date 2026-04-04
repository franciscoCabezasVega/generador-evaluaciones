/**
 * Seed Random Data Script
 *
 * Generates 1-10 random tasks (and optionally 0-2 reports) to keep the
 * Supabase project active. Runs as a GitHub Actions cron every Saturday
 * at 15:00 UTC (10:00 AM COT / Colombia time).
 *
 * Usage:
 *   npx tsx scripts/seed-random-data.ts
 *
 * Required env vars:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   E2E_USER_EMAIL
 */

import { createClient } from '@supabase/supabase-js';
import { faker } from '@faker-js/faker';

// ── Env validation ────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const E2E_USER_EMAIL = process.env.E2E_USER_EMAIL;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !E2E_USER_EMAIL) {
  console.error(
    '❌  Missing required env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, E2E_USER_EMAIL'
  );
  process.exit(1);
}

// ── Supabase client (service role bypasses RLS) ───────────────────────────────

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ── Score calculator (mirrors src/lib/scoreCalculator.ts) ─────────────────────

function calculateTaskScore(low: number, medium: number, high: number): number {
  const BASE = 10;
  const lowPenalty = Math.floor(low / 5) * 0.5;
  const mediumPenalty = medium * 0.75;
  const highPenalty = high * 1.5;
  const score = BASE - lowPenalty - mediumPenalty - highPenalty;
  return Math.max(0, Math.round(score * 100) / 100);
}

// ── Statuses ──────────────────────────────────────────────────────────────────

const STATUSES = ['Completada', 'Deprecada', 'Pendiente'] as const;

// ── Catalog fetchers ──────────────────────────────────────────────────────────

interface ProductRow { id: string; name: string }
interface SquadRow { id: string; name: string; product_id: string }
interface ComplexityRow { id: string; name: string }
interface CategoryRow { id: string; name: string }

async function fetchCatalog() {
  const [products, squads, complexities, categories] = await Promise.all([
    supabase
      .from('products')
      .select('id, name')
      .eq('is_active', true)
      .returns<ProductRow[]>(),
    supabase
      .from('squads')
      .select('id, name, product_id')
      .eq('is_active', true)
      .returns<SquadRow[]>(),
    supabase
      .from('complexities')
      .select('id, name')
      .eq('is_active', true)
      .returns<ComplexityRow[]>(),
    supabase
      .from('categories')
      .select('id, name')
      .eq('is_active', true)
      .returns<CategoryRow[]>(),
  ]);

  if (products.error) throw new Error(`Products fetch failed: ${products.error.message}`);
  if (squads.error) throw new Error(`Squads fetch failed: ${squads.error.message}`);
  if (complexities.error) throw new Error(`Complexities fetch failed: ${complexities.error.message}`);
  if (categories.error) throw new Error(`Categories fetch failed: ${categories.error.message}`);

  if (!products.data?.length) throw new Error('No active products found — cannot seed tasks');
  if (!squads.data?.length) throw new Error('No active squads found — cannot seed tasks');
  if (!complexities.data?.length) throw new Error('No active complexities found — cannot seed tasks');
  if (!categories.data?.length) throw new Error('No active categories found — cannot seed tasks');

  return {
    products: products.data,
    squads: squads.data,
    complexities: complexities.data,
    categories: categories.data,
  };
}

// ── Random helpers ────────────────────────────────────────────────────────────

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickMany<T>(arr: T[], min: number, max: number): T[] {
  const count = faker.number.int({ min, max: Math.min(max, arr.length) });
  return faker.helpers.arrayElements(arr, count);
}

function randomTaskName(): string {
  const word = faker.commerce.productName();
  const suffix = Date.now().toString(36);
  return `Seed ${word} ${suffix}`;
}

function randomTaskLink(): string {
  return `https://${faker.internet.domainName()}/task-${faker.string.alphanumeric(8)}`;
}

function randomEffortScoreDate(): string {
  const now = new Date();
  const day = faker.number.int({ min: 1, max: 28 });
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  return `${year}-${month}-${String(day).padStart(2, '0')}`;
}

// Fixed QA members list (stored as plain strings in the tasks table)
const QA_MEMBERS = [
  'Alex Torres',
  'Carlos Mendez',
  'Diana Lopez',
  'Elena Ruiz',
  'Felipe Vargas',
  'Gabriela Soto',
  'Hugo Paredes',
];

// ── Seed tasks ────────────────────────────────────────────────────────────────

async function seedTasks(
  userId: string,
  catalog: Awaited<ReturnType<typeof fetchCatalog>>,
  count: number
): Promise<number> {
  let created = 0;

  for (let i = 0; i < count; i++) {
    const product = pick(catalog.products);
    const productSquads = catalog.squads.filter((s) => s.product_id === product.id);

    if (!productSquads.length) {
      console.warn(`⚠️  Product "${product.name}" has no active squads — skipping task ${i + 1}`);
      continue;
    }

    const selectedSquads = pickMany(productSquads, 1, Math.min(3, productSquads.length));
    const complexity = pick(catalog.complexities);
    const category = pick(catalog.categories);
    const status = pick([...STATUSES]);
    const now = new Date();

    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .insert({
        name: randomTaskName(),
        task_link: randomTaskLink(),
        product_type: product.name,
        status,
        month: now.getMonth() + 1,
        year: now.getFullYear(),
        user_id: userId,
        assigned_qa: pickMany(QA_MEMBERS, 1, 3),
        effort_score_date: randomEffortScoreDate(),
        tshirt_size: complexity.name,
        category: category.name,
      })
      .select('id, name')
      .single();

    if (taskError) {
      console.error(`  ✗ Task ${i + 1} insert failed: ${taskError.message}`);
      continue;
    }

    // Insert task_squad records
    const squadRecords = selectedSquads.map((sq) => {
      const low = faker.number.int({ min: 0, max: 15 });
      const medium = faker.number.int({ min: 0, max: 5 });
      const high = faker.number.int({ min: 0, max: 3 });
      return {
        task_id: task.id,
        squad: sq.name,
        low_returns: low,
        medium_returns: medium,
        high_returns: high,
        calculated_score: calculateTaskScore(low, medium, high),
        additional_notes: faker.datatype.boolean()
          ? faker.lorem.sentence({ min: 3, max: 8 })
          : '',
      };
    });

    const { error: squadError } = await supabase.from('task_squad').insert(squadRecords);

    if (squadError) {
      console.error(`  ✗ Task "${task.name}" squad records failed: ${squadError.message}`);
      // Roll back the task to keep data consistent
      await supabase.from('tasks').delete().eq('id', task.id);
      continue;
    }

    console.warn(`  ✓ Task "${task.name}" [${status}] (${selectedSquads.map((s) => s.name).join(', ')})`);
    created++;
  }

  return created;
}

// ── Seed reports ──────────────────────────────────────────────────────────────

async function seedReports(
  userId: string,
  catalog: Awaited<ReturnType<typeof fetchCatalog>>,
  count: number
): Promise<number> {
  let created = 0;
  const now = new Date();
  // Use previous month for reports (more realistic)
  const reportMonth = now.getMonth() === 0 ? 12 : now.getMonth();
  const reportYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();

  for (let i = 0; i < count; i++) {
    const product = pick(catalog.products);
    const productSquads = catalog.squads.filter((s) => s.product_id === product.id);
    if (!productSquads.length) continue;

    const squad = pick(productSquads);

    // Get latest version for this squad/month/year
    const { data: lastReport } = await supabase
      .from('reports')
      .select('version')
      .eq('squad', squad.name)
      .eq('month', reportMonth)
      .eq('year', reportYear)
      .order('version', { ascending: false })
      .limit(1)
      .single();

    const nextVersion = (lastReport?.version ?? 0) + 1;

    const { data: report, error: reportError } = await supabase
      .from('reports')
      .insert({
        squad: squad.name,
        month: reportMonth,
        year: reportYear,
        performance_comment: faker.lorem.paragraph({ min: 1, max: 3 }),
        communication_comment: faker.lorem.paragraph({ min: 1, max: 3 }),
        report_data: {
          productType: product.name,
          squads: [squad.name],
          tasksBySquad: { [squad.name]: [] },
          squadsScores: { [squad.name]: faker.number.float({ min: 6, max: 10, fractionDigits: 2 }) },
        },
        version: nextVersion,
        created_by: userId,
      })
      .select('id')
      .single();

    if (reportError) {
      console.error(`  ✗ Report ${i + 1} insert failed: ${reportError.message}`);
      continue;
    }

    console.warn(`  ✓ Report for "${squad.name}" ${reportMonth}/${reportYear} v${nextVersion} (id: ${report.id})`);
    created++;
  }

  return created;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.warn('🌱  Seed Random Data — starting');
  console.warn(`    Target: ${SUPABASE_URL}`);
  console.warn(`    User:   ${E2E_USER_EMAIL}`);

  // Resolve user UUID — listUsers + in-memory filter (getUserByEmail removed in v2)
  const { data: usersData, error: userError } =
    await supabase.auth.admin.listUsers({ perPage: 1000 });
  const foundUser = usersData?.users?.find((u) => u.email === E2E_USER_EMAIL);
  if (userError || !foundUser) {
    console.error(`❌  Could not resolve user UUID for "${E2E_USER_EMAIL}": ${userError?.message ?? 'not found'}`);
    process.exit(1);
  }
  const userId = foundUser.id;
  console.warn(`    User UUID resolved: ${userId}`);

  // Fetch catalog
  console.warn('\n📦  Fetching catalog data…');
  const catalog = await fetchCatalog();
  console.warn(
    `    Products: ${catalog.products.length}, Squads: ${catalog.squads.length}, ` +
    `Complexities: ${catalog.complexities.length}, Categories: ${catalog.categories.length}`
  );

  // Determine task count (1-10)
  const taskCount = faker.number.int({ min: 1, max: 10 });
  // Determine report count (0-2)
  const reportCount = faker.number.int({ min: 0, max: 2 });

  console.warn(`\n📝  Seeding ${taskCount} task(s) and ${reportCount} report(s)…`);

  // Seed tasks
  console.warn('\n  Tasks:');
  const tasksCreated = await seedTasks(userId, catalog, taskCount);

  // Seed reports
  let reportsCreated = 0;
  if (reportCount > 0) {
    console.warn('\n  Reports:');
    reportsCreated = await seedReports(userId, catalog, reportCount);
  }

  console.warn(
    `\n✅  Done — ${tasksCreated}/${taskCount} task(s) created, ${reportsCreated}/${reportCount} report(s) created`
  );
}

main().catch((err: unknown) => {
  console.error('❌  Unexpected error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
