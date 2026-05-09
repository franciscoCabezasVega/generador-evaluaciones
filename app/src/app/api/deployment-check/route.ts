import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

interface CheckResult {
  name: string;
  status: "success" | "error" | "warning";
  output?: string;
  duration?: number;
}

/**
 * Vercel Deployment Check API
 * Este endpoint ejecuta validaciones antes de promover a producción
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const secretToken = process.env.DEPLOYMENT_CHECK_SECRET;

  // Verificar autenticación si está configurada
  if (secretToken && authHeader !== `Bearer ${secretToken}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const checks: CheckResult[] = [];
  let allPassed = true;

  // 1. Check de Linting
  try {
    const startTime = Date.now();
    await execAsync("npm run lint", { cwd: process.cwd() });
    checks.push({
      name: "Linting",
      status: "success",
      duration: Date.now() - startTime,
    });
  } catch (error: unknown) {
    allPassed = false;
    const errorMessage =
      error instanceof Error ? error.message : "Linting failed";
    checks.push({
      name: "Linting",
      status: "error",
      output: errorMessage,
    });
  }

  // 2. Check de Tests unitarios
  try {
    const startTime = Date.now();
    await execAsync("npm run test -- --passWithNoTests", {
      cwd: process.cwd(),
    });
    checks.push({
      name: "Unit Tests",
      status: "success",
      duration: Date.now() - startTime,
    });
  } catch (error: unknown) {
    allPassed = false;
    const errorMessage =
      error instanceof Error ? error.message : "Tests failed";
    checks.push({
      name: "Unit Tests",
      status: "error",
      output: errorMessage,
    });
  }

  // 3. Build Check
  try {
    const startTime = Date.now();
    await execAsync("npm run build", { cwd: process.cwd() });
    checks.push({
      name: "Build",
      status: "success",
      duration: Date.now() - startTime,
    });
  } catch (error: unknown) {
    allPassed = false;
    const errorMessage =
      error instanceof Error ? error.message : "Build failed";
    checks.push({
      name: "Build",
      status: "error",
      output: errorMessage,
    });
  }

  return NextResponse.json(
    {
      status: allPassed ? "passed" : "failed",
      checks,
      timestamp: new Date().toISOString(),
    },
    {
      status: allPassed ? 200 : 400,
    },
  );
}
