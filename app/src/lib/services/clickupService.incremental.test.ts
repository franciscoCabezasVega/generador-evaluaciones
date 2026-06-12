import {
  computeDeltaWindowStart,
  computeIncrementalDeltaMinutes,
  parseCheckpoint,
  serializeCheckpoint,
} from "@/lib/services/clickupService";

describe("clickupService incremental checkpoint", () => {
  it("serializa y parsea checkpoint correctamente", () => {
    const raw = serializeCheckpoint({
      status: "QA - Testing",
      since: "1718036400000",
      byMinute: 125,
    });

    const parsed = parseCheckpoint(raw);

    expect(parsed.statusForDisplay).toBe("QA - Testing");
    expect(parsed.checkpoint).toEqual({
      status: "QA - Testing",
      since: "1718036400000",
      byMinute: 125,
    });
  });

  it("devuelve null checkpoint cuando formato legacy no tiene prefijo", () => {
    const parsed = parseCheckpoint("QA - Fixed");

    expect(parsed.statusForDisplay).toBe("QA - Fixed");
    expect(parsed.checkpoint).toBeNull();
  });

  it("en misma sesion calcula solo el delta", () => {
    const delta = computeIncrementalDeltaMinutes(
      { status: "QA - Testing", since: "1718036400000", byMinute: 100 },
      { status: "QA - Testing", since: "1718036400000", byMinute: 145 },
    );

    expect(delta).toBe(45);
  });

  it("si cambia de estado inicia desde byMinute del estado nuevo", () => {
    const delta = computeIncrementalDeltaMinutes(
      { status: "QA - Testing", since: "1718036400000", byMinute: 145 },
      { status: "QA - Fixed", since: "1718040000000", byMinute: 30 },
    );

    expect(delta).toBe(30);
  });

  it("si no existe checkpoint previo retorna null para bootstrap", () => {
    const delta = computeIncrementalDeltaMinutes(null, {
      status: "QA - Testing",
      since: "1718036400000",
      byMinute: 20,
    });

    expect(delta).toBeNull();
  });
});

describe("computeDeltaWindowStart", () => {
  const SINCE_MS = 1781206702355; // 11/jun/2026 ~19:38 UTC
  const LAST_SYNC = "2026-06-12T14:00:00.000Z";

  it("misma sesión: la ventana del delta arranca en lastSyncedAt", () => {
    const result = computeDeltaWindowStart(
      { status: "QA - Testing", since: String(SINCE_MS), byMinute: 100 },
      { status: "QA - Testing", since: String(SINCE_MS), byMinute: 160 },
      LAST_SYNC,
    );
    expect(result).toEqual(new Date(LAST_SYNC));
  });

  it("cambio de estado: la ventana arranca en el since del estado actual", () => {
    const newSince = 1781300000000;
    const result = computeDeltaWindowStart(
      { status: "QA - Testing", since: String(SINCE_MS), byMinute: 100 },
      { status: "QA - Fixed", since: String(newSince), byMinute: 30 },
      LAST_SYNC,
    );
    expect(result).toEqual(new Date(newSince));
  });

  it("misma sesión sin lastSyncedAt: usa el since del estado", () => {
    const result = computeDeltaWindowStart(
      { status: "QA - Testing", since: String(SINCE_MS), byMinute: 100 },
      { status: "QA - Testing", since: String(SINCE_MS), byMinute: 160 },
      null,
    );
    expect(result).toEqual(new Date(SINCE_MS));
  });

  it("sin checkpoint previo (bootstrap): usa el since del estado", () => {
    const result = computeDeltaWindowStart(
      null,
      { status: "QA - Testing", since: String(SINCE_MS), byMinute: 20 },
      LAST_SYNC,
    );
    expect(result).toEqual(new Date(SINCE_MS));
  });

  it("misma sesión con since posterior a lastSyncedAt: prefiere since", () => {
    const lateSince = new Date("2026-06-12T15:30:00.000Z").getTime();
    const result = computeDeltaWindowStart(
      { status: "QA - Testing", since: String(lateSince), byMinute: 10 },
      { status: "QA - Testing", since: String(lateSince), byMinute: 40 },
      LAST_SYNC,
    );
    expect(result).toEqual(new Date(lateSince));
  });

  it("since inválido y cambio de estado: retorna null", () => {
    const result = computeDeltaWindowStart(
      { status: "QA - Testing", since: "1781206702355", byMinute: 100 },
      { status: "QA - Fixed", since: "invalid", byMinute: 30 },
      LAST_SYNC,
    );
    expect(result).toBeNull();
  });
});
