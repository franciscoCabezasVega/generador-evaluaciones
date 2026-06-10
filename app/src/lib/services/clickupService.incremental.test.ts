import {
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
