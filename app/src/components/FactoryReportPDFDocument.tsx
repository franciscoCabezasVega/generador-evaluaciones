import React from "react";
import {
  Document,
  Page,
  View,
  Text,
  Link,
  StyleSheet,
} from "@react-pdf/renderer";

// ── Tipos ──────────────────────────────────────────────────────────────────

export interface FactoryTaskEntry {
  name: string;
  task_link?: string;
  low_returns: number;
  medium_returns: number;
  high_returns: number;
  calculated_score: number;
  status?: string;
}

export interface FactoryReportPDFData {
  tasksBySquad: Record<string, FactoryTaskEntry[]>;
  deprecatedPendingBySquad?: Record<string, FactoryTaskEntry[]>;
  squadsScores: Record<string, number>;
  performanceComments?: Record<string, string> | string;
  communicationComments?: Record<string, string> | string;
  productType?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const parseComments = (
  raw: Record<string, string> | string | undefined,
): Record<string, string> => {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return raw;
};

const formatScore = (score: number) =>
  score.toLocaleString("es-ES", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });

const sortSquadsByNumber = (squads: string[]) =>
  [...squads].sort((a, b) => {
    const numA = parseInt(a.match(/\d+/)?.[0] || "0");
    const numB = parseInt(b.match(/\d+/)?.[0] || "0");
    return numA - numB;
  });

// ── Estilos ────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page: {
    flexDirection: "column",
    backgroundColor: "#ffffff",
    padding: 32,
    fontFamily: "Helvetica",
  },

  // Header
  headerBlock: {
    marginBottom: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  productTitle: {
    fontSize: 20,
    fontFamily: "Helvetica-Bold",
    color: "#111827",
    marginBottom: 4,
  },
  headerMeta: {
    fontSize: 9,
    color: "#6B7280",
    marginTop: 2,
  },

  // Sección de squad
  squadSection: {
    marginBottom: 28,
  },
  squadHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    marginBottom: 12,
  },
  squadName: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: "#1F2937",
  },
  finalScore: {
    fontSize: 15,
    fontFamily: "Helvetica-Bold",
    color: "#1D4ED8",
  },

  // Tabla
  table: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: 12,
  },
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: "#F3F4F6",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
    minHeight: 22,
    alignItems: "center",
  },
  tableRowEven: {
    backgroundColor: "#F9FAFB",
  },
  tableRowOdd: {
    backgroundColor: "#FFFFFF",
  },
  thNum: {
    width: 28,
    paddingHorizontal: 5,
    paddingVertical: 6,
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#374151",
    textAlign: "center",
  },
  thName: {
    flex: 1,
    paddingHorizontal: 6,
    paddingVertical: 6,
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#374151",
  },
  thSmall: {
    width: 46,
    paddingHorizontal: 4,
    paddingVertical: 6,
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#374151",
    textAlign: "center",
  },
  tdNum: {
    width: 28,
    paddingHorizontal: 5,
    paddingVertical: 5,
    fontSize: 8,
    color: "#374151",
    textAlign: "center",
  },
  tdName: {
    flex: 1,
    paddingHorizontal: 6,
    paddingVertical: 5,
  },
  tdNameText: {
    fontSize: 8,
    color: "#374151",
  },
  tdNameLink: {
    fontSize: 8,
    color: "#2563EB",
    textDecoration: "underline",
  },
  tdSmall: {
    width: 46,
    paddingHorizontal: 4,
    paddingVertical: 5,
    fontSize: 8,
    color: "#374151",
    textAlign: "center",
  },
  tdScore: {
    width: 46,
    paddingHorizontal: 4,
    paddingVertical: 5,
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#374151",
    textAlign: "center",
  },

  // Sin tareas
  emptyBox: {
    backgroundColor: "#FEFCE8",
    borderWidth: 1,
    borderColor: "#FDE047",
    borderRadius: 4,
    padding: 10,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 8,
    color: "#854D0E",
  },

  // Comentarios
  commentBlock: {
    marginBottom: 8,
    borderRadius: 6,
    padding: 10,
  },
  commentBlockPerf: {
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  commentBlockComm: {
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#BBF7D0",
  },
  commentTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
  },
  commentTitlePerf: {
    color: "#1E3A5F",
  },
  commentTitleComm: {
    color: "#14532D",
  },
  commentText: {
    fontSize: 7.5,
    lineHeight: 1.5,
  },
  commentTextPerf: {
    color: "#1E40AF",
  },
  commentTextComm: {
    color: "#166534",
  },

  // Sección deprecadas/pendientes
  depSectionTitle: {
    fontSize: 15,
    fontFamily: "Helvetica-Bold",
    color: "#111827",
    marginBottom: 16,
  },
  depSquadTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: "#374151",
    marginBottom: 8,
    marginTop: 4,
  },

  // Badge de estado
  badgeDep: {
    backgroundColor: "#FEE2E2",
    borderRadius: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  badgePend: {
    backgroundColor: "#FEF9C3",
    borderRadius: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  badgeDepText: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: "#991B1B",
  },
  badgePendText: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: "#854D0E",
  },

  // Footer
  footer: {
    position: "absolute",
    bottom: 14,
    left: 32,
    right: 32,
    flexDirection: "row",
    justifyContent: "center",
  },
  footerText: {
    fontSize: 7,
    color: "#9CA3AF",
  },
});

// ── Sub-componentes ────────────────────────────────────────────────────────

const TaskTable = ({ tasks }: { tasks: FactoryTaskEntry[] }) => (
  <View style={s.table}>
    {/* Cabecera */}
    <View style={s.tableHeaderRow}>
      <Text style={s.thNum}>N°</Text>
      <Text style={s.thName}>Nombre</Text>
      <Text style={s.thSmall}>Bajas</Text>
      <Text style={s.thSmall}>Medias</Text>
      <Text style={s.thSmall}>Graves</Text>
      <Text style={s.thSmall}>Nota</Text>
    </View>
    {/* Filas */}
    {tasks.map((task, idx) => (
      <View
        key={idx}
        style={[s.tableRow, idx % 2 === 0 ? s.tableRowOdd : s.tableRowEven]}
        wrap={false}
      >
        <Text style={s.tdNum}>{idx + 1}</Text>
        <View style={s.tdName}>
          {task.task_link ? (
            <Link src={task.task_link} style={s.tdNameLink}>
              {task.name}
            </Link>
          ) : (
            <Text style={s.tdNameText}>{task.name}</Text>
          )}
        </View>
        <Text style={s.tdSmall}>{task.low_returns ?? 0}</Text>
        <Text style={s.tdSmall}>{task.medium_returns ?? 0}</Text>
        <Text style={s.tdSmall}>{task.high_returns ?? 0}</Text>
        <Text style={s.tdScore}>
          {formatScore(task.calculated_score ?? 0)}/10
        </Text>
      </View>
    ))}
  </View>
);

const DeprecatedTable = ({ tasks }: { tasks: FactoryTaskEntry[] }) => (
  <View style={s.table}>
    {/* Cabecera */}
    <View style={s.tableHeaderRow}>
      <Text style={s.thNum}>N°</Text>
      <Text style={s.thName}>Nombre</Text>
      <Text style={[s.thSmall, { width: 70 }]}>Estado</Text>
    </View>
    {/* Filas */}
    {tasks.map((task, idx) => (
      <View
        key={idx}
        style={[s.tableRow, idx % 2 === 0 ? s.tableRowOdd : s.tableRowEven]}
        wrap={false}
      >
        <Text style={s.tdNum}>{idx + 1}</Text>
        <View style={s.tdName}>
          {task.task_link ? (
            <Link src={task.task_link} style={s.tdNameLink}>
              {task.name}
            </Link>
          ) : (
            <Text style={s.tdNameText}>{task.name}</Text>
          )}
        </View>
        <View style={[s.tdSmall, { width: 70, alignItems: "center" }]}>
          <View style={task.status === "Deprecada" ? s.badgeDep : s.badgePend}>
            <Text
              style={
                task.status === "Deprecada" ? s.badgeDepText : s.badgePendText
              }
            >
              {task.status ?? "Deprecada"}
            </Text>
          </View>
        </View>
      </View>
    ))}
  </View>
);

const PageFooter = ({
  pageNum,
  totalPages,
}: {
  pageNum: number;
  totalPages: number;
}) => (
  <View style={s.footer} fixed>
    <Text style={s.footerText}>
      Página {pageNum} de {totalPages}
    </Text>
  </View>
);

// ── Documento principal ────────────────────────────────────────────────────

interface FactoryReportPDFDocumentProps {
  reportData: FactoryReportPDFData;
  month: number;
  year: number;
  productName: string;
  version?: number;
  generatedAt?: string;
}

export const FactoryReportPDFDocument = ({
  reportData,
  month,
  year,
  productName,
  version,
  generatedAt,
}: FactoryReportPDFDocumentProps) => {
  const performanceComments = parseComments(reportData.performanceComments);
  const communicationComments = parseComments(reportData.communicationComments);
  const sortedSquads = sortSquadsByNumber(
    Object.keys(reportData.tasksBySquad || {}),
  );
  const deprecatedPending = reportData.deprecatedPendingBySquad ?? {};
  const hasDeprecatedOrPending = Object.values(deprecatedPending).some(
    (tasks) => Array.isArray(tasks) && tasks.length > 0,
  );

  // Calcular total de páginas: una por squad + una opcional para deprecadas
  const totalPages = sortedSquads.length + (hasDeprecatedOrPending ? 1 : 0);

  return (
    <Document>
      {/* ── Páginas por squad ── */}
      {sortedSquads.map((squad, pageIdx) => {
        const tasks = reportData.tasksBySquad[squad] ?? [];
        const squadScore = reportData.squadsScores?.[squad] ?? 0;
        const perfComment = performanceComments[squad];
        const commComment = communicationComments[squad];
        const pageNum = pageIdx + 1;

        return (
          <Page key={squad} size="A4" style={s.page}>
            {/* Header */}
            <View style={s.headerBlock}>
              <Text style={s.productTitle}>Producto: {productName}</Text>
              <Text style={s.headerMeta}>
                {month}/{year}
                {version ? ` — Versión ${version}` : ""}
              </Text>
              {generatedAt && (
                <Text style={s.headerMeta}>Generado: {generatedAt}</Text>
              )}
            </View>

            {/* Squad header */}
            <View style={s.squadSection}>
              <View style={s.squadHeader}>
                <Text style={s.squadName}>{squad}</Text>
                <Text style={s.finalScore}>
                  Nota Final: {formatScore(squadScore)}/10
                </Text>
              </View>

              {tasks.length === 0 ? (
                <View style={s.emptyBox}>
                  <Text style={s.emptyText}>
                    Este equipo no tuvo tareas asignadas en este período.
                  </Text>
                </View>
              ) : (
                <TaskTable tasks={tasks} />
              )}

              {/* Comentarios */}
              {perfComment && (
                <View style={[s.commentBlock, s.commentBlockPerf]}>
                  <Text style={[s.commentTitle, s.commentTitlePerf]}>
                    Desempeño
                  </Text>
                  <Text style={[s.commentText, s.commentTextPerf]}>
                    {perfComment}
                  </Text>
                </View>
              )}
              {commComment && (
                <View style={[s.commentBlock, s.commentBlockComm]}>
                  <Text style={[s.commentTitle, s.commentTitleComm]}>
                    Comunicación
                  </Text>
                  <Text style={[s.commentText, s.commentTextComm]}>
                    {commComment}
                  </Text>
                </View>
              )}
            </View>

            {/* Footer */}
            <PageFooter pageNum={pageNum} totalPages={totalPages} />
          </Page>
        );
      })}

      {/* ── Página de deprecadas/pendientes ── */}
      {hasDeprecatedOrPending && (
        <Page size="A4" style={s.page}>
          {/* Header */}
          <View style={s.headerBlock}>
            <Text style={s.productTitle}>Producto: {productName}</Text>
            <Text style={s.headerMeta}>
              {month}/{year}
              {version ? ` — Versión ${version}` : ""}
            </Text>
            {generatedAt && (
              <Text style={s.headerMeta}>Generado: {generatedAt}</Text>
            )}
          </View>

          <Text style={s.depSectionTitle}>Tareas Deprecadas y Pendientes</Text>

          {sortSquadsByNumber(Object.keys(deprecatedPending)).map((squad) => {
            const tasks = deprecatedPending[squad];
            if (!tasks || tasks.length === 0) return null;
            return (
              <View key={squad} style={{ marginBottom: 16 }}>
                <Text style={s.depSquadTitle}>{squad}</Text>
                <DeprecatedTable tasks={tasks} />
              </View>
            );
          })}

          {/* Footer */}
          <PageFooter
            pageNum={sortedSquads.length + 1}
            totalPages={totalPages}
          />
        </Page>
      )}
    </Document>
  );
};
