import jsPDF from 'jspdf';

interface TaskData {
  name: string;
  task_link?: string;
  low_returns: number;
  medium_returns: number;
  high_returns: number;
  calculated_score: number;
  status?: string;
}

interface ReportDataStructure {
  tasksBySquad: Record<string, TaskData[]>;
  deprecatedPendingBySquad?: Record<string, TaskData[]>;
  squadsScores: Record<string, number>;
  performanceComments?: Record<string, string>;
  communicationComments?: Record<string, string>;
  productType?: string;
}

// Helper para dibujar una tabla simple y legible
const drawSimpleTable = (
  doc: jsPDF,
  startY: number,
  headers: string[],
  rows: string[][],
  pageWidth: number,
  pageHeight: number,
  marginLeft: number,
  marginRight: number,
  alignmentOverride?: ('left' | 'center')[] // Para permitir alineación custom por columna
): number => {
  const headerHeight = 7;
  const baseRowHeight = 6;
  const colPadding = 3;  // Aumentado para mejor espaciado
  
  let currentY = startY;
  const availableWidth = pageWidth - marginLeft - marginRight;
  
  // Calcular anchos de columna con proporciones personalizadas
  // Optimizado para maximizar espacio en Nombre y minimizar en columnas numéricas
  const columnWeights = headers.map((_, idx) => {
    if (idx === 0) return 0.35;     // N° muy angosta
    if (idx === 1) return 3.0;      // Nombre muy ancha
    return 0.6;                     // Otras columnas (Bajas, Medias, Graves, Estado, Nota) angostas
  });
  
  const totalWeight = columnWeights.reduce((a, b) => a + b, 0);
  const columnWidths = columnWeights.map(w => (availableWidth * w) / totalWeight);

  // Dibujar header
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);
  doc.setTextColor(0, 0, 0);

  let cellX = marginLeft;
  // Dibujar línea superior
  doc.line(marginLeft, currentY, marginLeft + availableWidth, currentY);

  for (let i = 0; i < headers.length; i++) {
    // Línea vertical izquierda
    doc.line(cellX, currentY, cellX, currentY + headerHeight);

    // Texto del header - centrado verticalmente
    doc.text(
      headers[i],
      cellX + colPadding,
      currentY + headerHeight / 2 + 0.5,
      { maxWidth: columnWidths[i] - colPadding * 2 }
    );

    cellX += columnWidths[i];
  }

  // Línea vertical derecha y línea inferior del header
  cellX = marginLeft + availableWidth;
  doc.line(cellX, currentY, cellX, currentY + headerHeight);
  doc.line(marginLeft, currentY + headerHeight, cellX, currentY + headerHeight);

  currentY += headerHeight;

  // Dibujar filas
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);

  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx];

    // Calcular altura dinámica de la fila basada en el contenido
    let maxLines = 1;
    for (let colIdx = 0; colIdx < headers.length; colIdx++) {
      const splitText = doc.splitTextToSize(
        row[colIdx] || '',
        columnWidths[colIdx] - colPadding * 2
      );
      maxLines = Math.max(maxLines, splitText.length);
    }
    
    const rowHeight = baseRowHeight + (maxLines - 1) * 3; // Agregar altura por cada línea adicional

    // Verificar si necesitamos nueva página
    if (currentY + rowHeight > pageHeight - 15) {
      doc.addPage();
      currentY = 12;
    }

    cellX = marginLeft;

    for (let colIdx = 0; colIdx < headers.length; colIdx++) {
      // Línea vertical izquierda
      doc.line(cellX, currentY, cellX, currentY + rowHeight);

      // Texto con soporte para múltiples líneas
      doc.setTextColor(0, 0, 0);
      const alignment = alignmentOverride
        ? alignmentOverride[colIdx]
        : colIdx === 0 ? 'center' : 'left';
      
      const splitText = doc.splitTextToSize(
        row[colIdx] || '',
        columnWidths[colIdx] - colPadding * 2
      );
      
      // Calcular posición Y centrada verticalmente
      const lineHeight = 3.5; // altura aproximada de una línea de texto a 7pt
      const textTotalHeight = splitText.length * lineHeight;
      const availableHeight = rowHeight - colPadding * 2;
      const verticalOffset = Math.max(0, (availableHeight - textTotalHeight) / 2);
      const textY = currentY + colPadding + verticalOffset;
      
      doc.text(
        splitText,
        cellX + colPadding,
        textY,
        {
          maxWidth: columnWidths[colIdx] - colPadding * 2,
          align: alignment as 'left' | 'center',
        }
      );

      cellX += columnWidths[colIdx];
    }

    // Línea vertical derecha
    doc.line(cellX, currentY, cellX, currentY + rowHeight);

    // Línea horizontal inferior
    doc.line(marginLeft, currentY + rowHeight, cellX, currentY + rowHeight);

    currentY += rowHeight;
  }

  return currentY;
};

export const generateReportPDF = (
  reportData: ReportDataStructure,
  month: number,
  year: number
) => {
  const pageWidth = 279; // Ancho en mm (horizontal/landscape - 11 inches)
  const pageHeight = 215.9; // Alto en mm (horizontal/landscape - 8.5 inches)
  const marginLeft = 10;
  const marginRight = 10;
  const marginTop = 12;
  const marginBottom = 10;

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'letter',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- jsPDF constructor returns incompatible overloaded types
  }) as any;

  let isFirstPage = true;
  let pageCount = 1;

  // Helper para agregar nueva página
  const addNewPage = () => {
    if (!isFirstPage) {
      doc.addPage();
      pageCount++;
    }
    isFirstPage = false;
  };

  // Helper para agregar encabezado
  const addHeader = (squadName: string): number => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.text(`Squad: ${squadName}`, marginLeft, marginTop);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const dateStr = `${month}/${year}`;
    doc.text(`Período: ${dateStr}`, marginLeft, marginTop + 8);
    doc.text(
      `Generado: ${new Date().toLocaleDateString('es-ES')}`,
      marginLeft,
      marginTop + 13
    );

    return marginTop + 18;
  };

  // Helper para agregar comentarios
  const addComments = (
    performanceComment: string | undefined,
    communicationComment: string | undefined,
    startY: number
  ): number => {
    let currentY = startY + 5;
    const commentIndent = marginLeft + 3; // Indentación para las notas
    const commentWidth = pageWidth - commentIndent - marginRight;

    if (performanceComment) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(31, 78, 121); // Azul
      doc.text('Desempeño: ', commentIndent, currentY);

      // Calcular el ancho disponible después del título
      const titleWidth = doc.getTextWidth('Desempeño: ');
      
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(0, 0, 0);
      const perfSplitText = doc.splitTextToSize(
        performanceComment,
        commentWidth - titleWidth
      );
      
      doc.setFontSize(8);
      
      // Primera línea junto al título
      if (perfSplitText.length > 0) {
        doc.text(perfSplitText[0], commentIndent + titleWidth, currentY);
      }
      
      // Líneas siguientes con indentación
      if (perfSplitText.length > 1) {
        const restLines = perfSplitText.slice(1);
        doc.text(restLines, commentIndent, currentY + 3.5);
        currentY += restLines.length * 3.5;
      }
      
      currentY += 6;
    }

    if (communicationComment) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(34, 139, 34); // Verde
      doc.text('Comunicación: ', commentIndent, currentY);

      // Calcular el ancho disponible después del título
      const titleWidth = doc.getTextWidth('Comunicación: ');
      
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(0, 0, 0);
      const commSplitText = doc.splitTextToSize(
        communicationComment,
        commentWidth - titleWidth
      );
      
      doc.setFontSize(8);
      
      // Primera línea junto al título
      if (commSplitText.length > 0) {
        doc.text(commSplitText[0], commentIndent + titleWidth, currentY);
      }
      
      // Líneas siguientes con indentación
      if (commSplitText.length > 1) {
        const restLines = commSplitText.slice(1);
        doc.text(restLines, commentIndent, currentY + 3.5);
        currentY += restLines.length * 3.5;
      }
      
      currentY += 6;
    }

    return currentY;
  };

  // Procesar tareas por squad
  const sortedSquads = Object.keys(reportData.tasksBySquad || {}).sort((a, b) => {
    const numA = parseInt(a.match(/\d+/)?.[0] || '0');
    const numB = parseInt(b.match(/\d+/)?.[0] || '0');
    return numA - numB;
  });

  const performanceComments = typeof reportData.performanceComments === 'string'
    ? JSON.parse(reportData.performanceComments)
    : reportData.performanceComments || {};

  const communicationComments = typeof reportData.communicationComments === 'string'
    ? JSON.parse(reportData.communicationComments)
    : reportData.communicationComments || {};

  sortedSquads.forEach((squad) => {
    const tasks = reportData.tasksBySquad[squad] || [];
    const squadScore = reportData.squadsScores?.[squad] || 0;
    const perfComment = performanceComments[squad];
    const commComment = communicationComments[squad];

    if (tasks.length === 0) {
      addNewPage();
      let currentY = addHeader(squad);

      doc.setFontSize(9);
      doc.setTextColor(150, 100, 100);
      doc.text('Este equipo no tuvo tareas asignadas en este período.', marginLeft, currentY);

      // Agregar nota final
      currentY += 10;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      doc.text(
        `Nota Final: ${squadScore.toLocaleString('es-ES', {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        })}/10`,
        marginLeft,
        currentY
      );

      // Agregar comentarios si existen
      if (perfComment || commComment) {
        addComments(perfComment, commComment, currentY + 8);
      }
    } else {
      addNewPage();
      let currentY = addHeader(squad);

      // Preparar datos para la tabla
      const tableHeaders = ['N°', 'Nombre', 'Bajas', 'Medias', 'Graves', 'Nota'];
      const tableRows = tasks.map((task, idx) => [
        (idx + 1).toString(),
        task.name, // Sin truncar - ahora se divide en múltiples líneas
        task.low_returns?.toString() || '0',
        task.medium_returns?.toString() || '0',
        task.high_returns?.toString() || '0',
        task.calculated_score?.toLocaleString('es-ES', {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        }) || '0',
      ]);

      // Agregar tabla
      currentY = drawSimpleTable(
        doc,
        currentY,
        tableHeaders,
        tableRows,
        pageWidth,
        pageHeight,
        marginLeft,
        marginRight
      );

      // Agregar nota final
      currentY += 5;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(25, 118, 210); // Azul
      doc.text(
        `Nota Final: ${squadScore.toLocaleString('es-ES', {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        })}/10`,
        marginLeft,
        currentY
      );

      // Agregar comentarios
      if (perfComment || commComment) {
        currentY += 8;
        addComments(perfComment, commComment, currentY);
      }
    }
  });

  // Procesar tareas deprecadas y pendientes
  const deprecatedPending = reportData.deprecatedPendingBySquad || {};
  const hasDeprecatedOrPending = Object.values(deprecatedPending).some(
    (tasks: unknown) => Array.isArray(tasks) && tasks.length > 0
  );

  if (hasDeprecatedOrPending) {
    addNewPage();
    // Encabezado sin "Squad:" para tareas deprecadas
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.text('Tareas Deprecadas y Pendientes', marginLeft, marginTop);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const dateStr = `${month}/${year}`;
    doc.text(`Período: ${dateStr}`, marginLeft, marginTop + 8);
    doc.text(
      `Generado: ${new Date().toLocaleDateString('es-ES')}`,
      marginLeft,
      marginTop + 13
    );

    let currentY = marginTop + 18;

    const sortedDepSquads = Object.keys(deprecatedPending).sort((a, b) => {
      const numA = parseInt(a.match(/\d+/)?.[0] || '0');
      const numB = parseInt(b.match(/\d+/)?.[0] || '0');
      return numA - numB;
    });

    sortedDepSquads.forEach((squad) => {
      const tasks = deprecatedPending[squad] || [];
      if (tasks.length === 0) return;

      // Agregar título del squad
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      doc.text(`${squad}:`, marginLeft, currentY);
      currentY += 5;

      // Preparar datos para la tabla
      const tableHeaders = ['N°', 'Nombre', 'Estado'];
      const tableRows = tasks.map((task: TaskData, idx: number) => [
        (idx + 1).toString(),
        task.name, // Sin truncar - ahora se divide en múltiples líneas
        task.status || 'Deprecada',
      ]);

      // Agregar tabla con alineación custom: [center, left, left]
      currentY = drawSimpleTable(
        doc,
        currentY,
        tableHeaders,
        tableRows,
        pageWidth,
        pageHeight,
        marginLeft,
        marginRight,
        ['center', 'left', 'left'] // N° centrado, Nombre y Estado a la izquierda
      );

      currentY += 5;

      // Si estamos muy cerca del final de la página, agregar nueva
      if (currentY > pageHeight - marginBottom - 15) {
        addNewPage();
        currentY = marginTop;
      }
    });
  }

  // Agregar números de página
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Página ${i} de ${pageCount}`,
      pageWidth / 2,
      pageHeight - 5,
      { align: 'center' }
    );
  }

  return doc;
}

export const downloadReportPDF = (
  reportData: ReportDataStructure,
  month: number,
  year: number,
  productType: string = 'Platform',
  fileName?: string
) => {
  const doc = generateReportPDF(reportData, month, year);
  const finalFileName = fileName || `Reporte-Evaluaciones-${productType}-${month}-${year}.pdf`;
  doc.save(finalFileName);
};
