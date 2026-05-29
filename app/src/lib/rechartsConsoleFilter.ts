// Suprime un warning cosmético conocido de recharts (issues #3615, #4196):
//   "The width(-1) and height(-1) of chart should be greater than 0..."
//
// El warning lo emite ResponsiveContainer en su PRIMER ciclo de medición,
// antes del primer paint del navegador. En el siguiente frame el contenedor
// ya tiene dimensiones reales y el chart se renderiza correctamente — no
// afecta funcionalidad. Nuestros ChartWrapper bloquean el render hasta
// tener ancho > 0, pero recharts ya disparó el log internamente.
//
// Solo se instala en development y solo filtra ESTE mensaje exacto:
// cualquier otro warning/error pasa intacto al console original.

let installed = false;

export function installRechartsConsoleFilter(): void {
  if (installed) return;
  if (typeof window === "undefined") return;
  if (process.env.NODE_ENV !== "development") return;
  installed = true;

  const RECHARTS_DIM_WARNING =
    "width(-1) and height(-1) of chart should be greater than 0";

  const origWarn = console.warn.bind(console);
  const origError = console.error.bind(console);

  const isRechartsDimWarning = (args: unknown[]): boolean =>
    args.some((a) => typeof a === "string" && a.includes(RECHARTS_DIM_WARNING));

  console.warn = (...args: unknown[]) => {
    if (isRechartsDimWarning(args)) return;
    origWarn(...args);
  };
  console.error = (...args: unknown[]) => {
    if (isRechartsDimWarning(args)) return;
    origError(...args);
  };
}
