/**
 * workCalendarService.test.ts
 *
 * Cubre:
 * 1. Funciones puras: isWorkingDay, dailyHours
 * 2. getAdjustmentFactor con isOngoing=true:
 *    - En día no laboral (sábado) → factor congelado igual al del viernes EOD
 *    - Factor no decrece entre sábado y domingo (mismo valor)
 *    - Al retomar el lunes (en horario laboral) → factor crece respecto al sábado
 */

import {
  isWorkingDay,
  dailyHours,
  getAdjustmentFactor,
  getWorkingHoursForQA,
} from "@/lib/services/workCalendarService";
import type {
  QAWorkConfig,
  TaskQAWindow,
} from "@/lib/services/workCalendarService";
import type { HolidayEntry } from "@/lib/types";

// ── Mocks ─────────────────────────────────────────────────────────────────

jest.mock("@/lib/auth", () => ({
  getServiceClient: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getServiceClient } = require("@/lib/auth") as {
  getServiceClient: jest.Mock;
};

/**
 * Construye un mock mínimo de Supabase client para workCalendarService.
 * Devuelve datos vacíos para `holidays` y `qa_member_oo` por defecto.
 */
function buildMockSupabase(
  oooData: unknown[] = [],
  holidayData: unknown[] = [],
) {
  const oooChain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    lte: jest.fn().mockReturnThis(),
    gte: jest.fn().mockResolvedValue({ data: oooData, error: null }),
  };

  const holidayChain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    lte: jest.fn().mockResolvedValue({ data: holidayData, error: null }),
    upsert: jest.fn().mockResolvedValue({ error: null }),
  };

  return {
    from: jest.fn((table: string) => {
      if (table === "qa_member_oo") return oooChain;
      if (table === "holidays") return holidayChain;
      return oooChain; // fallback
    }),
  };
}

// ── Fixtures ──────────────────────────────────────────────────────────────

/**
 * QA colombiano estándar (UTC-5, sin DST).
 * Mayo 2026 tiene ~20 días laborables (1° cae en viernes).
 */
const COLOMBIA_QA: QAWorkConfig = {
  id: "qa-co-test",
  country_code: "CO",
  timezone: null, // usa COUNTRY_TIMEZONE_MAP → America/Bogota (UTC-5)
  work_start_time: "08:00",
  work_end_time: "17:00",
  lunch_hours: 1,
  work_days: [1, 2, 3, 4, 5], // Lun–Vie
};

const YEAR = 2026;
const MONTH = 5; // Mayo

// Inicio de mes: 1° mayo 2026 00:00 UTC
const MAY_1_UTC = new Date("2026-05-01T00:00:00.000Z");

// ── Pure function tests ───────────────────────────────────────────────────

describe("isWorkingDay", () => {
  const qa: QAWorkConfig = {
    id: "1",
    country_code: "CO",
    work_start_time: "08:00",
    work_end_time: "17:00",
    lunch_hours: 1,
    work_days: [1, 2, 3, 4, 5],
  };

  it("devuelve true para lunes (isoDay=1)", () => {
    // 25 mayo 2026 = lunes
    const monday = new Date(2026, 4, 25, 12, 0, 0);
    expect(isWorkingDay(monday, qa, [])).toBe(true);
  });

  it("devuelve true para viernes (isoDay=5)", () => {
    // 22 mayo 2026 = viernes
    const friday = new Date(2026, 4, 22, 12, 0, 0);
    expect(isWorkingDay(friday, qa, [])).toBe(true);
  });

  it("devuelve false para sábado (isoDay=6)", () => {
    // 23 mayo 2026 = sábado
    const saturday = new Date(2026, 4, 23, 12, 0, 0);
    expect(isWorkingDay(saturday, qa, [])).toBe(false);
  });

  it("devuelve false para domingo (isoDay=7)", () => {
    // 24 mayo 2026 = domingo
    const sunday = new Date(2026, 4, 24, 12, 0, 0);
    expect(isWorkingDay(sunday, qa, [])).toBe(false);
  });

  it("devuelve false en día festivo aunque sea laborable", () => {
    const tuesday = new Date(2026, 4, 19, 12, 0, 0);
    const holiday: HolidayEntry = {
      country_code: "CO",
      holiday_date: "2026-05-19",
      name: "Festivo de prueba",
    };
    expect(isWorkingDay(tuesday, qa, [holiday])).toBe(false);
  });

  it("devuelve false si el día no está en work_days del QA", () => {
    const qaSemireduced: QAWorkConfig = { ...qa, work_days: [1, 2, 3, 4] }; // solo Lun–Jue
    const friday = new Date(2026, 4, 22, 12, 0, 0);
    expect(isWorkingDay(friday, qaSemireduced, [])).toBe(false);
  });
});

describe("dailyHours", () => {
  it("devuelve 8h para jornada 08:00–17:00 con 1h almuerzo", () => {
    const qa: QAWorkConfig = {
      id: "1",
      country_code: "CO",
      work_start_time: "08:00",
      work_end_time: "17:00",
      lunch_hours: 1,
      work_days: [1, 2, 3, 4, 5],
    };
    expect(dailyHours(qa)).toBe(8);
  });

  it("devuelve 8h como fallback cuando los campos son null", () => {
    const qa: QAWorkConfig = {
      id: "1",
      country_code: null,
      work_start_time: null,
      work_end_time: null,
      lunch_hours: null,
      work_days: null,
    };
    expect(dailyHours(qa)).toBe(8);
  });

  it("calcula correctamente jornada 09:00–18:00 con 0h almuerzo", () => {
    const qa: QAWorkConfig = {
      id: "1",
      country_code: "CO",
      work_start_time: "09:00",
      work_end_time: "18:00",
      lunch_hours: 0,
      work_days: [1, 2, 3, 4, 5],
    };
    expect(dailyHours(qa)).toBe(9);
  });
});

// ── getAdjustmentFactor con isOngoing=true ────────────────────────────────

describe("getAdjustmentFactor — isOngoing=true estabiliza el factor en días no laborables", () => {
  // Guardar fetch original para restaurarlo después: en Node 18+ fetch es nativo y
  // no-configurable, delete lanzaría error o rompería otros suites del mismo run.
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    // Supabase mock: sin OOO, sin festivos
    getServiceClient.mockReturnValue(buildMockSupabase([], []));

    // En jsdom, global.fetch y global.Response no existen; se asigna directamente.
    // Intercepta llamadas a Nager.Date y devuelve array vacío (sin festivos).
    // Se usa un objeto plain en lugar de `new Response` para evitar warnings en jsdom.
    originalFetch = global.fetch;
    global.fetch = jest.fn().mockImplementation((url: string | URL) => {
      const isNager = String(url).includes("nager.at");
      return Promise.resolve({
        ok: isNager,
        json: () => Promise.resolve(isNager ? [] : null),
      });
    }) as typeof global.fetch;
  });

  afterEach(() => {
    jest.resetAllMocks();
    // Restaurar fetch original en lugar de delete para no corromper el entorno en Node 18+.
    global.fetch = originalFetch;
  });

  /**
   * Escenario clave: el cron corre el sábado 23/05 al mediodía.
   * El factor debería ser igual al del viernes 22/05 al cierre de jornada (17:00 Bogota).
   *
   * Viernes  22/05/2026 17:00 Bogota = 22:00 UTC
   * Sábado   23/05/2026 12:00 Bogota = 17:00 UTC
   */
  it("factor en sábado es igual al del viernes EOD (no decrece en fin de semana)", async () => {
    const FRIDAY_EOD_UTC = new Date("2026-05-22T22:00:00.000Z"); // 17:00 Bogota
    const SATURDAY_NOON_UTC = new Date("2026-05-23T17:00:00.000Z"); // 12:00 Bogota

    const windowFriday: TaskQAWindow = { from: MAY_1_UTC, to: FRIDAY_EOD_UTC };
    const windowSaturday: TaskQAWindow = {
      from: MAY_1_UTC,
      to: SATURDAY_NOON_UTC,
    };

    const factorFriday = await getAdjustmentFactor(
      COLOMBIA_QA,
      YEAR,
      MONTH,
      windowFriday,
      true,
    );
    const factorSaturday = await getAdjustmentFactor(
      COLOMBIA_QA,
      YEAR,
      MONTH,
      windowSaturday,
      true,
    );

    expect(factorFriday).not.toBeNull();
    expect(factorSaturday).not.toBeNull();
    // Con isOngoing=true, el sábado clampea al viernes EOD → mismo factor
    expect(factorSaturday).toBeCloseTo(factorFriday!, 4);
  });

  /**
   * El factor no debe decrecer entre sábado y domingo:
   * si no hay días laborables entre las dos mediciones, el factor permanece estable.
   */
  it("factor en domingo es igual al del sábado (ambos clampeados al viernes EOD)", async () => {
    const SATURDAY_NOON_UTC = new Date("2026-05-23T17:00:00.000Z");
    const SUNDAY_NOON_UTC = new Date("2026-05-24T17:00:00.000Z");

    const factorSaturday = await getAdjustmentFactor(
      COLOMBIA_QA,
      YEAR,
      MONTH,
      { from: MAY_1_UTC, to: SATURDAY_NOON_UTC },
      true,
    );
    const factorSunday = await getAdjustmentFactor(
      COLOMBIA_QA,
      YEAR,
      MONTH,
      { from: MAY_1_UTC, to: SUNDAY_NOON_UTC },
      true,
    );

    expect(factorSaturday).not.toBeNull();
    expect(factorSunday).not.toBeNull();
    // Domingo también clampea al viernes EOD → igual
    expect(factorSunday).toBeCloseTo(factorSaturday!, 4);
  });

  /**
   * En un día laboral durante horario de trabajo, isOngoing=true NO debe
   * clampear: el clamp solo actúa fuera de horario / días no laborables.
   * isOngoing=true e isOngoing=false deben producir el mismo factor.
   */
  it("en día laboral durante horario, isOngoing=true da el mismo factor que isOngoing=false", async () => {
    // Lunes 25/05/2026 10:00 Bogota = 15:00 UTC
    const MONDAY_10AM_UTC = new Date("2026-05-25T15:00:00.000Z");

    const factorOngoing = await getAdjustmentFactor(
      COLOMBIA_QA,
      YEAR,
      MONTH,
      { from: MAY_1_UTC, to: MONDAY_10AM_UTC },
      true,
    );
    const factorNotOngoing = await getAdjustmentFactor(
      COLOMBIA_QA,
      YEAR,
      MONTH,
      { from: MAY_1_UTC, to: MONDAY_10AM_UTC },
      false,
    );

    expect(factorOngoing).not.toBeNull();
    expect(factorNotOngoing).not.toBeNull();
    // En lunes laboral a las 10am el clamp no actúa → mismo resultado
    expect(factorOngoing).toBeCloseTo(factorNotOngoing!, 4);
  });

  /**
   * Con isOngoing=false (entry histórico), el factor usa la ventana tal cual
   * sin clampear. Pasar sábado vs viernes EOD produce resultados distintos
   * (diferente denominador) — confirma que isOngoing=false NO congela.
   */
  it("con isOngoing=false, sábado y viernes EOD producen factores diferentes", async () => {
    const FRIDAY_EOD_UTC = new Date("2026-05-22T22:00:00.000Z");
    const SATURDAY_NOON_UTC = new Date("2026-05-23T17:00:00.000Z");

    const factorFriday = await getAdjustmentFactor(
      COLOMBIA_QA,
      YEAR,
      MONTH,
      { from: MAY_1_UTC, to: FRIDAY_EOD_UTC },
      false, // sin clamp
    );
    const factorSaturday = await getAdjustmentFactor(
      COLOMBIA_QA,
      YEAR,
      MONTH,
      { from: MAY_1_UTC, to: SATURDAY_NOON_UTC },
      false,
    );

    expect(factorFriday).not.toBeNull();
    expect(factorSaturday).not.toBeNull();
    // Sin isOngoing, sábado tiene más horas calendario en el denominador
    // pero igual workHours → factor más bajo
    expect(factorSaturday!).toBeLessThan(factorFriday!);
  });

  /**
   * QA sin country_code → getAdjustmentFactor retorna null independientemente
   * de isOngoing (señal para usar split legacy en clickupService).
   */
  it("retorna null si el QA no tiene country_code, independiente de isOngoing", async () => {
    const qaNoCountry: QAWorkConfig = {
      ...COLOMBIA_QA,
      country_code: null,
    };

    const result = await getAdjustmentFactor(
      qaNoCountry,
      YEAR,
      MONTH,
      { from: MAY_1_UTC, to: new Date("2026-05-23T17:00:00.000Z") },
      true,
    );
    expect(result).toBeNull();
  });
});

// ── getWorkingHoursForQA — ajuste de día parcial al inicio de la ventana ───

describe("getWorkingHoursForQA — ventanas parciales (inicio y fin)", () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    getServiceClient.mockReturnValue(buildMockSupabase([], []));
    originalFetch = global.fetch;
    global.fetch = jest.fn().mockImplementation((url: string | URL) => {
      const isNager = String(url).includes("nager.at");
      return Promise.resolve({
        ok: isNager,
        json: () => Promise.resolve(isNager ? [] : null),
      });
    }) as typeof global.fetch;
  });

  afterEach(() => {
    jest.resetAllMocks();
    global.fetch = originalFetch;
  });

  /**
   * Caso reportado (jun/2026): la tarea entró a QA a media tarde, pero el
   * cálculo contaba el día completo desde workStart → +6.5h fantasma.
   * Jueves 21/05/2026 14:30 Bogota = 19:30 UTC → EOD 17:00 Bogota = 22:00 UTC.
   * Esperado: solo las horas restantes de jornada (8 − 6.5 = 1.5h).
   */
  it("ventana que empieza a media tarde solo cuenta las horas restantes de jornada", async () => {
    const from = new Date("2026-05-21T19:30:00.000Z"); // 14:30 Bogota
    const to = new Date("2026-05-21T22:00:00.000Z"); // 17:00 Bogota

    const hours = await getWorkingHoursForQA(COLOMBIA_QA, YEAR, MONTH, {
      from,
      to,
    });
    expect(hours).toBeCloseTo(1.5, 1);
  });

  /**
   * Delta overnight: del cierre de jornada (17:00) a la mañana siguiente antes
   * de empezar (08:00) no transcurre ninguna hora laboral → 0h.
   * Antes del fix, este intervalo sumaba horas (causa principal de inflación).
   */
  it("ventana overnight (EOD → 8AM día siguiente) produce 0 horas", async () => {
    const from = new Date("2026-05-21T22:00:00.000Z"); // jue 17:00 Bogota
    const to = new Date("2026-05-22T13:00:00.000Z"); // vie 08:00 Bogota

    const hours = await getWorkingHoursForQA(COLOMBIA_QA, YEAR, MONTH, {
      from,
      to,
    });
    expect(hours).toBeCloseTo(0, 1);
  });

  it("ventana que empieza antes del inicio de jornada cuenta el día completo", async () => {
    const from = new Date("2026-05-21T11:00:00.000Z"); // 06:00 Bogota
    const to = new Date("2026-05-21T22:00:00.000Z"); // 17:00 Bogota

    const hours = await getWorkingHoursForQA(COLOMBIA_QA, YEAR, MONTH, {
      from,
      to,
    });
    expect(hours).toBeCloseTo(8, 1);
  });

  /**
   * Escenario completo del caso real: entra a QA jueves 14:38, sync viernes
   * 09:00 → tarde del jueves (~2.4h con la convención sin hora de almuerzo
   * explícita) + 1h de la mañana del viernes.
   */
  it("ventana tarde de un día → mañana del siguiente suma solo horas de jornada", async () => {
    const from = new Date("2026-05-21T19:38:00.000Z"); // jue 14:38 Bogota
    const to = new Date("2026-05-22T14:00:00.000Z"); // vie 09:00 Bogota

    const hours = await getWorkingHoursForQA(COLOMBIA_QA, YEAR, MONTH, {
      from,
      to,
    });
    // jue: 8 − 6.63 (mañana no trabajada) = 1.37 · vie: 1h transcurrida → ~2.37
    expect(hours).toBeCloseTo(2.37, 1);
  });

  /**
   * Guard de timezone: from = 1° de mes 00:00 UTC equivale a la tarde del día
   * anterior en Bogotá. El ajuste de inicio no debe restar horas de un día
   * que no pertenece a la ventana contada.
   */
  it("from = inicio de mes 00:00 UTC no descuenta el día anterior (guard TZ)", async () => {
    const from = MAY_1_UTC; // 30/abr 19:00 Bogota
    const to = new Date("2026-05-01T22:00:00.000Z"); // vie 1/may 17:00 Bogota

    const hours = await getWorkingHoursForQA(COLOMBIA_QA, YEAR, MONTH, {
      from,
      to,
    });
    expect(hours).toBeCloseTo(8, 1);
  });

  /**
   * Feriado dentro del intervalo del delta → 0h aunque ClickUp siga midiendo.
   * QA de Ecuador con festivo el lunes 25/05; delta viernes EOD → lunes 10 AM.
   */
  it("feriado dentro del delta produce 0 horas", async () => {
    const ECUADOR_QA: QAWorkConfig = {
      ...COLOMBIA_QA,
      id: "qa-ec-test",
      country_code: "EC",
    };
    getServiceClient.mockReturnValue(
      buildMockSupabase(
        [],
        [
          {
            country_code: "EC",
            holiday_date: "2026-05-25",
            name: "Festivo de prueba",
          },
        ],
      ),
    );

    const from = new Date("2026-05-22T22:00:00.000Z"); // vie 17:00 Guayaquil
    const to = new Date("2026-05-25T15:00:00.000Z"); // lun festivo 10:00

    const hours = await getWorkingHoursForQA(ECUADOR_QA, YEAR, MONTH, {
      from,
      to,
    });
    expect(hours).toBeCloseTo(0, 1);
  });

  /**
   * Día OOO dentro del intervalo del delta → 0h (vacaciones/permiso).
   */
  it("día OOO dentro del delta produce 0 horas", async () => {
    getServiceClient.mockReturnValue(
      buildMockSupabase(
        [{ date_from: "2026-05-22", date_to: "2026-05-22" }],
        [],
      ),
    );

    const from = new Date("2026-05-21T22:00:00.000Z"); // jue 17:00 Bogota
    const to = new Date("2026-05-22T15:00:00.000Z"); // vie OOO 10:00 Bogota

    const hours = await getWorkingHoursForQA(COLOMBIA_QA, YEAR, MONTH, {
      from,
      to,
    });
    expect(hours).toBeCloseTo(0, 1);
  });
});
