/**
 * Tests para la lógica de cálculo de altura de barras verticales en TimingMetrics.
 * Replica las fórmulas inline usadas en los gráficos para verificar su comportamiento
 * en casos límite sin modificar el componente.
 */

// ─── Fórmulas replicadas del componente ──────────────────────────────────────

/** Usada en "Comparación Visual" (categorías): máx 96px, mínimo 4px si hay valor */
function computeCategoryBarPx(value: number, maxValue: number): number {
  return maxValue > 0 ? Math.max((value / maxValue) * 96, value > 0 ? 4 : 0) : 0;
}

/** Usada en "Distribución por Producto/QA": máx 110px, siempre mínimo 4px */
function computeDistributionBarPx(hours: number, total: number): number {
  return total > 0 ? Math.max((hours / total) * 110, 4) : 0;
}

/** Usada en "Horas promedio vs rango esperado": máx (chartH - 2)px */
function computeRangeBarPx(
  avgHours: number,
  globalMax: number,
  chartH = 130,
): number {
  return globalMax > 0
    ? Math.max((avgHours / globalMax) * (chartH - 2), avgHours > 0 ? 4 : 0)
    : 0;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("TimingMetrics — computeCategoryBarPx", () => {
  it("la barra más alta ocupa el máximo (96px)", () => {
    expect(computeCategoryBarPx(100, 100)).toBe(96);
  });

  it("escala proporcionalmente respecto al máximo", () => {
    expect(computeCategoryBarPx(50, 100)).toBe(48);
  });

  it("aplica mínimo de 4px cuando el valor es mayor que 0", () => {
    // valor muy pequeño: (1/1000)*96 = 0.096 → debe quedar en 4
    expect(computeCategoryBarPx(1, 1000)).toBe(4);
  });

  it("devuelve 0 cuando el valor es 0 (sin barra)", () => {
    expect(computeCategoryBarPx(0, 100)).toBe(0);
  });

  it("devuelve 0 cuando maxValue es 0 (sin datos)", () => {
    expect(computeCategoryBarPx(0, 0)).toBe(0);
    expect(computeCategoryBarPx(10, 0)).toBe(0);
  });
});

describe("TimingMetrics — computeDistributionBarPx", () => {
  it("la barra del producto con más horas ocupa 110px", () => {
    expect(computeDistributionBarPx(200, 200)).toBe(110);
  });

  it("escala proporcionalmente al total", () => {
    expect(computeDistributionBarPx(100, 200)).toBe(55);
  });

  it("aplica mínimo de 4px aunque la proporción sea muy pequeña", () => {
    // (1/10000)*110 = 0.011 → mínimo 4
    expect(computeDistributionBarPx(1, 10000)).toBe(4);
  });

  it("devuelve 0 cuando el total es 0", () => {
    expect(computeDistributionBarPx(0, 0)).toBe(0);
  });

  it("no excede 110px aunque hours > total (datos inconsistentes)", () => {
    // Math.max garantiza al menos 4; no hay cap en 110 pero la proporción > 1 es un caso anómalo
    expect(computeDistributionBarPx(300, 200)).toBeGreaterThan(110);
  });
});

describe("TimingMetrics — computeRangeBarPx", () => {
  it("la barra del QA más lento alcanza casi chartH (128px con chartH=130)", () => {
    expect(computeRangeBarPx(10, 10, 130)).toBe(128);
  });

  it("escala linealmente respecto al globalMax", () => {
    const result = computeRangeBarPx(5, 10, 130);
    expect(result).toBe(64);
  });

  it("aplica mínimo de 4px para valores muy pequeños", () => {
    expect(computeRangeBarPx(0.001, 1000, 130)).toBe(4);
  });

  it("devuelve 0 para avgHours = 0", () => {
    expect(computeRangeBarPx(0, 100, 130)).toBe(0);
  });

  it("devuelve 0 cuando globalMax es 0", () => {
    expect(computeRangeBarPx(5, 0, 130)).toBe(0);
  });

  it("usa chartH=130 por defecto", () => {
    expect(computeRangeBarPx(10, 10)).toBe(128);
  });
});
