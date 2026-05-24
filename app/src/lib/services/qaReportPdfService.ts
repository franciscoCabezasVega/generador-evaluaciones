import jsPDF from "jspdf";
import { QAEvaluationRow } from "@/lib/types";

function fmtLocalDate(isoDate: string): string {
  return new Date(isoDate + "T12:00:00").toLocaleDateString("es-ES");
}

function fmtScore(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return String(v);
}

// Dibuja una tabla en el PDF y retorna la Y final
function drawTable(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  doc: any,
  startY: number,
  headers: string[],
  colWidths: number[],
  rows: string[][],
  marginLeft: number,
  pageHeight: number,
  marginBottom: number,
  addPage: () => number,
): number {
  const headerH = 7;
  const rowH = 6; // alto mínimo de fila (celdas de una sola línea)
  const lineH = 3.2; // alto por línea adicional a fontSize 7.5
  const cellPad = 2.5;
  let y = startY;

  // Cabecera
  doc.setFillColor(30, 30, 30);
  doc.rect(
    marginLeft,
    y,
    colWidths.reduce((a: number, b: number) => a + b, 0),
    headerH,
    "F",
  );
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  let x = marginLeft;
  headers.forEach((h, i) => {
    doc.text(h, x + cellPad, y + headerH - 2);
    x += colWidths[i];
  });

  y += headerH;

  // Filas
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);

  rows.forEach((row, rowIdx) => {
    // Pre-calcular líneas de cada celda para determinar alto dinámico
    const cellLines: string[][] = row.map((cell, i) => {
      const maxW = colWidths[i] - cellPad * 2;
      return doc.splitTextToSize(cell, maxW) as string[];
    });
    const maxLines = Math.max(...cellLines.map((l) => l.length));
    const dynamicRowH = maxLines <= 1 ? rowH : 2 + maxLines * lineH + 2;

    // Nueva página si no hay espacio
    if (y + dynamicRowH > pageHeight - marginBottom) {
      y = addPage();
      // Redibujar cabecera de la tabla en la nueva página
      doc.setFillColor(30, 30, 30);
      doc.rect(
        marginLeft,
        y,
        colWidths.reduce((a: number, b: number) => a + b, 0),
        headerH,
        "F",
      );
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);
      let xH = marginLeft;
      headers.forEach((h, i) => {
        doc.text(h, xH + cellPad, y + headerH - 2);
        xH += colWidths[i];
      });
      y += headerH;
      // Restaurar estilos para las celdas
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
    }

    // Fondo alternado
    if (rowIdx % 2 === 0) {
      doc.setFillColor(248, 248, 248);
      doc.rect(
        marginLeft,
        y,
        colWidths.reduce((a: number, b: number) => a + b, 0),
        dynamicRowH,
        "F",
      );
    }

    doc.setTextColor(30, 30, 30);
    x = marginLeft;
    cellLines.forEach((lines, i) => {
      lines.forEach((line, lineIdx) => {
        doc.text(line, x + cellPad, y + 4 + lineIdx * lineH);
      });
      x += colWidths[i];
    });

    // Línea divisora
    doc.setDrawColor(220, 220, 220);
    doc.line(
      marginLeft,
      y + dynamicRowH,
      marginLeft + colWidths.reduce((a: number, b: number) => a + b, 0),
      y + dynamicRowH,
    );

    y += dynamicRowH;
  });

  return y;
}

export function downloadQAReportPDF(
  rows: QAEvaluationRow[],
  startDate: string,
  endDate: string,
): void {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "letter",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;

  const pageWidth = 279;
  const pageHeight = 215.9;
  const marginLeft = 12;
  const marginRight = 12;
  const marginTop = 14;
  const marginBottom = 14;

  let pageCount = 1;

  const addPage = (): number => {
    doc.addPage();
    pageCount++;
    // Footer en la nueva página
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(160, 160, 160);
    doc.text(`Página ${pageCount}`, pageWidth / 2, pageHeight - 6, {
      align: "center",
    });
    return marginTop;
  };

  // ─── Encabezado ─────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(0, 0, 0);
  doc.text("Evaluaciones de QA", marginLeft, marginTop);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.text(
    `Período: ${fmtLocalDate(startDate)} – ${fmtLocalDate(endDate)}`,
    marginLeft,
    marginTop + 7,
  );
  doc.text(
    `Generado: ${new Date().toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" })}`,
    marginLeft,
    marginTop + 13,
  );

  // ─── Métricas resumen ────────────────────────────────────────────────────
  const withEval = rows.filter(
    (r) => r.excelencia !== null || r.soft_skills !== null,
  ).length;
  const excelVals = rows
    .filter((r) => r.excelencia !== null)
    .map((r) => r.excelencia as number);
  const ssVals = rows
    .filter((r) => r.soft_skills !== null)
    .map((r) => r.soft_skills as number);
  const avgEx =
    excelVals.length > 0
      ? (excelVals.reduce((a, b) => a + b, 0) / excelVals.length).toFixed(2)
      : "—";
  const avgSs =
    ssVals.length > 0
      ? (ssVals.reduce((a, b) => a + b, 0) / ssVals.length).toFixed(2)
      : "—";

  const statsY = marginTop + 22;
  const statsData = [
    { label: "Total miembros", value: String(rows.length) },
    { label: "Con evaluación", value: String(withEval) },
    { label: "Prom. Excelencia", value: avgEx },
    { label: "Prom. Soft Skills", value: avgSs },
  ];
  const statW = (pageWidth - marginLeft - marginRight) / statsData.length;

  statsData.forEach((stat, i) => {
    const sx = marginLeft + i * statW;
    doc.setFillColor(245, 245, 245);
    doc.roundedRect(sx, statsY, statW - 3, 14, 2, 2, "F");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.text(stat.label, sx + (statW - 3) / 2, statsY + 5, {
      align: "center",
    });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(30, 30, 30);
    doc.text(stat.value, sx + (statW - 3) / 2, statsY + 11, {
      align: "center",
    });
  });

  // ─── Tabla principal ─────────────────────────────────────────────────────
  const tableY = statsY + 20;

  // Ancho total disponible: 279 - 12 - 12 = 255
  const headers = [
    "N°",
    "Nombre",
    "Tasa Aceptación",
    "Cumplimiento",
    "Excelencia",
    "Soft Skills",
    "Comentarios",
  ];
  const colWidths = [10, 52, 30, 28, 26, 26, 83]; // suma = 255

  const tableRows = rows.map((row, idx) => [
    String(idx + 1),
    row.qa_name ?? "—",
    row.tasa_aceptacion != null
      ? row.tasa_aceptacion % 1 === 0
        ? String(Math.round(row.tasa_aceptacion))
        : String(row.tasa_aceptacion)
      : "0",
    String(row.cumplimiento ?? 0),
    fmtScore(row.excelencia),
    fmtScore(row.soft_skills),
    row.comentarios ?? "—",
  ]);

  drawTable(
    doc,
    tableY,
    headers,
    colWidths,
    tableRows,
    marginLeft,
    pageHeight,
    marginBottom,
    addPage,
  );

  // ─── Footer página 1 ─────────────────────────────────────────────────────
  // doc.setPage(1) es necesario porque drawTable() puede haber llamado addPage(),
  // desplazando el cursor a la última página; sin esto el footer se imprimiría allí.
  doc.setPage(1);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(160, 160, 160);
  doc.text("Página 1", pageWidth / 2, pageHeight - 6, { align: "center" });

  const fileName = `Evaluaciones-QA-${startDate}_${endDate}.pdf`;
  doc.save(fileName);
}
