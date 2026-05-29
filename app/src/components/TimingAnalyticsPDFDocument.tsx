import React from "react";
import {
  Document,
  Page,
  View,
  Text,
  Svg,
  Circle,
  Line,
  StyleSheet,
} from "@react-pdf/renderer";
import { formatTime } from "@/lib/timingUtils";

// ── Data interface ─────────────────────────────────────────────────────────

export interface PDFSegment {
  label: string;
  hours: number;
  pct: number;
  color: string;
}

export interface PDFComplexitySegment {
  size: string;
  hours: number;
  pct: number;
  color: string;
}

export interface PDFActivityRow {
  name: string;
  hours: number;
  color: string;
  compliance: number;
  isOver: boolean;
}

export interface PDFChartData {
  generatedAt: string;
  dateRange: string; // e.g. "01/05/2026 - 31/05/2026"
  totalTimingHours: number;
  totalTimingTasks: number;
  avgPerTask: number;
  avgPerQA: number;
  avgEfficiency: number;
  nActiveQAs: number;
  productTypeSegments: PDFSegment[];
  projectSegments: PDFSegment[];
  complexitySegments: PDFComplexitySegment[];
  productTypeSummary: PDFSegment[];
  cumulativeChartData: Record<string, string | number>[]; // [{date, ProductA, ProductB, ...}]
  allProductTypes: string[]; // ordered product type names
  productTypeColors: Record<string, string>;
  top5Tasks: { name: string; hours: number }[];
  qaDistSegments: PDFSegment[];
  activityRows: PDFActivityRow[];
  totalActivityHours: number;
  availableHoursTotal: number;
  nQAs: number;
}

export interface PDFQACategoryAvg {
  id: string;
  name: string;
  color: string;
  teamAvgHours: number;
  teamTotalHours: number;
  teamPct: number;
}

export interface PDFQAPerEntry {
  name: string;
  hoursByCategory: Record<string, number>;
  controllableHours: number;
  efficiencyRate: number;
}

export interface PDFQAStatsData {
  generatedAt: string;
  dateRange: string;
  nQAs: number;
  avgEfficiency: number;
  avgControllablePerQA: number;
  avgValidPerQA: number; // Testing + QA Fixed + Retesting avg per QA
  totalTeamHours: number; // sum of controllable hours
  nonControllableHours: number; // sum of excluded category hours
  totalAllHours: number; // controllable + non-controllable
  nonControllableCategories: Array<{
    id: string;
    name: string;
    color: string;
    hours: number;
  }>;
  categories: PDFQACategoryAvg[];
  qas: PDFQAPerEntry[];
}

export interface PDFQAEvaluationRow {
  qa_name: string | null | undefined;
  tasa_aceptacion: number | null | undefined;
  cumplimiento: number | null | undefined;
  excelencia: number | null | undefined;
  soft_skills: number | null | undefined;
  comentarios: string | null | undefined;
}

export interface PDFQAEvaluationData {
  rows: PDFQAEvaluationRow[];
  startDate: string;
  endDate: string;
  generatedAt: string;
}

export type PDFPageDef =
  | { type: "analytics"; data: PDFChartData; label: string }
  | { type: "qa-stats"; data: PDFQAStatsData; label: string }
  | { type: "qa-evaluation"; data: PDFQAEvaluationData };

// ── Styles ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page: {
    flexDirection: "column",
    backgroundColor: "#fff",
    padding: 24,
    fontFamily: "Helvetica",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  title: { fontSize: 16, fontFamily: "Helvetica-Bold", color: "#111827" },
  subtitle: { fontSize: 8, color: "#6B7280" },
  genAt: { fontSize: 7, color: "#9CA3AF" },
  kpiRow: { flexDirection: "row", marginBottom: 12 },
  kpiCard: {
    flex: 1,
    backgroundColor: "#F9FAFB",
    borderRadius: 6,
    padding: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginRight: 6,
  },
  kpiCardLast: {
    flex: 1,
    backgroundColor: "#F9FAFB",
    borderRadius: 6,
    padding: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  kpiLabel: { fontSize: 6.5, color: "#6B7280", marginBottom: 2 },
  kpiValue: { fontSize: 13, fontFamily: "Helvetica-Bold", color: "#111827" },
  kpiSub: { fontSize: 6.5, color: "#9CA3AF", marginTop: 1 },
  row3: { flexDirection: "row", marginBottom: 10 },
  row2: { flexDirection: "row", marginBottom: 10 },
  panel: {
    flex: 1,
    backgroundColor: "#F9FAFB",
    borderRadius: 6,
    padding: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginRight: 8,
  },
  panelWide: {
    flex: 2,
    backgroundColor: "#F9FAFB",
    borderRadius: 6,
    padding: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginRight: 8,
  },
  panelTitle: {
    fontSize: 6.5,
    fontFamily: "Helvetica-Bold",
    color: "#374151",
    marginBottom: 7,
  },
  panelLast: {
    flex: 1,
    backgroundColor: "#F9FAFB",
    borderRadius: 6,
    padding: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  tRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 2.5,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  tRowBold: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 3,
    backgroundColor: "#F3F4F6",
    marginTop: 2,
  },
  tHead: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: 3,
    borderBottomWidth: 1,
    borderBottomColor: "#D1D5DB",
    marginBottom: 2,
  },
  tLabel: { fontSize: 7.5, color: "#374151", flex: 3 },
  tLabelBold: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: "#111827",
    flex: 3,
  },
  tVal: { fontSize: 7.5, color: "#374151", flex: 2, textAlign: "right" },
  tValBold: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: "#111827",
    flex: 2,
    textAlign: "right",
  },
  tPct: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    flex: 1.5,
    textAlign: "right",
  },
  tHeadLabel: { fontSize: 6.5, color: "#6B7280", fontFamily: "Helvetica-Bold" },
  dot: { width: 7, height: 7, borderRadius: 4, marginRight: 4 },
  dotSq: { width: 7, height: 7, borderRadius: 1, marginRight: 4 },
  barBg: {
    height: 5,
    backgroundColor: "#E5E7EB",
    borderRadius: 3,
    marginTop: 2,
  },
  infoNote: {
    fontSize: 6,
    color: "#6B7280",
    marginTop: 6,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  footer: {
    position: "absolute",
    bottom: 14,
    left: 24,
    right: 24,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    paddingTop: 6,
    fontSize: 6.5,
    color: "#9CA3AF",
  },
});

// ── Sub-components ──────────────────────────────────────────────────────────

function PDFDonut({
  segments,
  size = 72,
  stroke = 12,
}: {
  segments: { pct: number; color: string }[];
  size?: number;
  stroke?: number;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const cx = size / 2;
  const cy = size / 2;
  let offset = 0;
  return (
    <Svg width={size} height={size}>
      <Circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="#E5E7EB"
        strokeWidth={stroke}
      />
      {segments
        .filter((seg) => seg.pct > 0)
        .map((seg, i) => {
          const dashLen = Math.max((seg.pct / 100) * circ, 0.01);
          const dashGap = Math.max(circ - dashLen, 0.01);
          const rotate = (offset / 100) * 360 - 90;
          offset += seg.pct;
          return (
            <Circle
              key={i}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth={stroke}
              strokeDasharray={`${dashLen} ${dashGap}`}
              transform={`rotate(${rotate}, ${cx}, ${cy})`}
            />
          );
        })}
    </Svg>
  );
}

function DonutWithCenter({
  segments,
  size = 72,
  stroke = 12,
  centerValue,
  centerLabel,
}: {
  segments: { pct: number; color: string }[];
  size?: number;
  stroke?: number;
  centerValue: string;
  centerLabel?: string;
}) {
  return (
    <View style={{ width: size, height: size }}>
      <PDFDonut segments={segments} size={size} stroke={stroke} />
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: size,
          height: size,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Text
          style={{
            fontSize: 7,
            fontFamily: "Helvetica-Bold",
            color: "#111827",
            textAlign: "center",
          }}
        >
          {centerValue}
        </Text>
        {centerLabel ? (
          <Text
            style={{
              fontSize: 5.5,
              color: "#6B7280",
              textAlign: "center",
              marginTop: 1,
            }}
          >
            {centerLabel}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function KPICard({
  label,
  value,
  sub,
  accentColor,
  last = false,
}: {
  label: string;
  value: string;
  sub?: string;
  accentColor: string;
  last?: boolean;
}) {
  return (
    <View style={last ? s.kpiCardLast : s.kpiCard}>
      <Text style={{ ...s.kpiLabel, color: accentColor }}>{label}</Text>
      <Text style={s.kpiValue}>{value}</Text>
      {sub ? <Text style={s.kpiSub}>{sub}</Text> : null}
    </View>
  );
}

function LegendRow({
  color,
  label,
  hours,
  pct,
  square = false,
}: {
  color: string;
  label: string;
  hours: number;
  pct: number;
  square?: boolean;
}) {
  return (
    <View style={s.tRow}>
      <View style={{ flex: 3, flexDirection: "row", alignItems: "center" }}>
        <View
          style={{ ...(square ? s.dotSq : s.dot), backgroundColor: color }}
        />
        <Text style={s.tLabel}>{label}</Text>
      </View>
      <Text style={s.tVal}>{formatTime(hours)}</Text>
      <Text style={{ ...s.tPct, color }}>{pct.toFixed(1)}%</Text>
    </View>
  );
}

function HBar({
  label,
  hours,
  pct,
  color,
}: {
  label: string;
  hours: number;
  pct: number;
  color: string;
}) {
  return (
    <View style={{ marginBottom: 6 }}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <View style={{ flex: 1, flexDirection: "row", alignItems: "center" }}>
          <Text style={{ fontSize: 7.5, color: "#374151" }}>{label}</Text>
          <Text style={{ fontSize: 6.5, color: "#9CA3AF", marginLeft: 4 }}>
            {formatTime(hours)}
          </Text>
        </View>
        <Text
          style={{
            fontSize: 7.5,
            color,
            fontFamily: "Helvetica-Bold",
            marginLeft: 4,
          }}
        >
          {pct.toFixed(1)}%
        </Text>
      </View>
      <View style={s.barBg}>
        <View
          style={{
            height: 5,
            borderRadius: 3,
            backgroundColor: color,
            width: `${Math.min(pct, 100)}%`,
          }}
        />
      </View>
    </View>
  );
}

// Miniature line chart built with SVG Line elements
function MiniLineChart({
  data,
  productTypes,
  colors,
  width = 1100,
  height = 95,
}: {
  data: Record<string, string | number>[];
  productTypes: string[];
  colors: Record<string, string>;
  width?: number;
  height?: number;
}) {
  if (!data || data.length < 2 || productTypes.length === 0) return null;

  const padL = 26;
  const padR = 8;
  const padT = 6;
  const padB = 16;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;

  let maxVal = 0;
  for (const row of data) {
    for (const p of productTypes) {
      const v = typeof row[p] === "number" ? (row[p] as number) : 0;
      if (v > maxVal) maxVal = v;
    }
  }
  if (maxVal === 0) return null;

  const n = data.length;
  const xScale = (i: number) => padL + (i / (n - 1)) * chartW;
  const yScale = (v: number) => padT + chartH - (v / maxVal) * chartH;

  const fmtH = (h: number) => {
    const d = Math.round(h / 8);
    return d > 0 ? `${d}d` : `${Math.round(h)}h`;
  };
  const shortDate = (d: string) => {
    const months = [
      "ene",
      "feb",
      "mar",
      "abr",
      "may",
      "jun",
      "jul",
      "ago",
      "sep",
      "oct",
      "nov",
      "dic",
    ];
    const p = d.split("-");
    return p.length < 3 ? d : `${parseInt(p[2])} ${months[parseInt(p[1]) - 1]}`;
  };

  const xLabels = [
    0,
    Math.floor(n / 4),
    Math.floor(n / 2),
    Math.floor((3 * n) / 4),
    n - 1,
  ].filter((v, i, a) => a.indexOf(v) === i);

  return (
    <Svg width={width} height={height}>
      {/* Y axis grid lines */}
      <Line
        x1={padL}
        y1={padT}
        x2={padL + chartW}
        y2={padT}
        stroke="#E5E7EB"
        strokeWidth={0.5}
      />
      <Line
        x1={padL}
        y1={padT + chartH / 2}
        x2={padL + chartW}
        y2={padT + chartH / 2}
        stroke="#F3F4F6"
        strokeWidth={0.5}
      />
      <Line
        x1={padL}
        y1={padT + chartH}
        x2={padL + chartW}
        y2={padT + chartH}
        stroke="#D1D5DB"
        strokeWidth={0.5}
      />
      {/* Y labels */}
      <Text style={{ fontSize: 5, color: "#9CA3AF" }} x={0} y={padT + 4}>
        {fmtH(maxVal)}
      </Text>
      <Text
        style={{ fontSize: 5, color: "#9CA3AF" }}
        x={0}
        y={padT + chartH / 2 + 4}
      >
        {fmtH(maxVal / 2)}
      </Text>
      <Text
        style={{ fontSize: 5, color: "#9CA3AF" }}
        x={0}
        y={padT + chartH + 4}
      >
        0
      </Text>
      {/* X labels */}
      {xLabels.map((idx) => (
        <Text
          key={idx}
          style={{ fontSize: 5, color: "#9CA3AF" }}
          x={xScale(idx) - 7}
          y={height - 2}
        >
          {shortDate(String(data[idx].date))}
        </Text>
      ))}
      {/* Lines */}
      {productTypes.map((p) => {
        const color = colors[p] ?? "#9CA3AF";
        const pts = data.map((row, i) => ({
          x: xScale(i),
          y: yScale(typeof row[p] === "number" ? (row[p] as number) : 0),
        }));
        return pts
          .slice(0, -1)
          .map((pt, i) => (
            <Line
              key={`${p}-${i}`}
              x1={pt.x}
              y1={pt.y}
              x2={pts[i + 1].x}
              y2={pts[i + 1].y}
              stroke={color}
              strokeWidth={1.2}
            />
          ));
      })}
    </Svg>
  );
}

// ── QA chart helpers ───────────────────────────────────────────────────────

/** Single vertical bar per category — team average hours, colored by category */
function PDFQACategoryVertBars({
  categories,
  barH = 100,
}: {
  categories: PDFQACategoryAvg[];
  barH?: number;
}) {
  const maxVal = Math.max(...categories.map((c) => c.teamAvgHours), 0.001);
  const fmtH = (h: number) => {
    const d = Math.floor(h / 8);
    const rem = h - d * 8;
    if (d > 0 && rem > 0.05) return `${d}d ${rem.toFixed(0)}h`;
    if (d > 0) return `${d}d`;
    return `${h.toFixed(1)}h`;
  };
  return (
    <View>
      <View
        style={{ flexDirection: "row", alignItems: "flex-end", height: barH }}
      >
        {categories.map((cat) => {
          const h = (cat.teamAvgHours / maxVal) * (barH - 16);
          return (
            <View
              key={cat.id}
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "flex-end",
              }}
            >
              {cat.teamAvgHours > 0 && (
                <Text
                  style={{ fontSize: 6, color: "#374151", marginBottom: 2 }}
                >
                  {fmtH(cat.teamAvgHours)}
                </Text>
              )}
              <View
                style={{
                  width: "55%",
                  height: Math.max(h, 1),
                  backgroundColor: cat.color,
                  borderRadius: 2,
                }}
              />
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: "row", marginTop: 6 }}>
        {categories.map((cat) => (
          <View key={cat.id} style={{ flex: 1, alignItems: "center" }}>
            <Text
              style={{ fontSize: 6, color: "#374151", textAlign: "center" }}
            >
              {cat.name.length > 14
                ? cat.name.slice(0, 13) + "\u2026"
                : cat.name}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Grouped vertical bar chart: one cluster of bars per QA, colored by category */
function PDFGroupedBarChart({
  qas,
  categories,
  chartH = 110,
}: {
  qas: PDFQAPerEntry[];
  categories: PDFQACategoryAvg[];
  chartH?: number;
}) {
  const activeCats = categories.slice(0, 6);
  let maxVal = 0;
  for (const qa of qas) {
    for (const cat of activeCats) {
      const v = qa.hoursByCategory[cat.id] ?? 0;
      if (v > maxVal) maxVal = v;
    }
  }
  if (maxVal === 0 || qas.length === 0) return null;

  const barW = 8;
  const barGap = 1;

  return (
    <View>
      {/* Legend */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 5 }}>
        {activeCats.map((cat) => (
          <View
            key={cat.id}
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginRight: 7,
              marginBottom: 2,
            }}
          >
            <View
              style={{
                width: 7,
                height: 7,
                backgroundColor: cat.color,
                borderRadius: 1,
                marginRight: 2,
              }}
            />
            <Text style={{ fontSize: 6, color: "#374151" }}>
              {cat.name.length > 20 ? cat.name.slice(0, 19) + "…" : cat.name}
            </Text>
          </View>
        ))}
      </View>
      {/* Bars */}
      <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
        {qas.map((qa) => (
          <View key={qa.name} style={{ flex: 1, alignItems: "center" }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "flex-end",
                height: chartH,
              }}
            >
              {activeCats.map((cat) => {
                const h = qa.hoursByCategory[cat.id] ?? 0;
                const bH = h > 0 ? Math.max((h / maxVal) * chartH, 2) : 0;
                return (
                  <View
                    key={cat.id}
                    style={{
                      width: barW,
                      height: bH,
                      backgroundColor: h > 0 ? cat.color : "transparent",
                      borderRadius: 2,
                      marginRight: barGap,
                    }}
                  />
                );
              })}
            </View>
            <Text
              style={{
                fontSize: 6.5,
                color: "#374151",
                textAlign: "center",
                marginTop: 4,
              }}
            >
              {qa.name.split(" ")[0]}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Stacked 100 % bar chart: each QA = one column, segments = category share */
function PDFStackedBar100({
  qas,
  categories,
  barH = 110,
}: {
  qas: PDFQAPerEntry[];
  categories: PDFQACategoryAvg[];
  barH?: number;
}) {
  const activeCats = categories.slice(0, 8);
  if (qas.length === 0) return null;

  return (
    <View>
      {/* Legend */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 5 }}>
        {activeCats.map((cat) => (
          <View
            key={cat.id}
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginRight: 7,
              marginBottom: 2,
            }}
          >
            <View
              style={{
                width: 7,
                height: 7,
                backgroundColor: cat.color,
                borderRadius: 1,
                marginRight: 2,
              }}
            />
            <Text style={{ fontSize: 6, color: "#374151" }}>
              {cat.name.length > 20 ? cat.name.slice(0, 19) + "…" : cat.name}
            </Text>
          </View>
        ))}
      </View>
      {/* Bars */}
      <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
        {qas.map((qa) => {
          const total = activeCats.reduce(
            (s, c) => s + (qa.hoursByCategory[c.id] ?? 0),
            0,
          );
          if (total === 0) return null;

          // Compute pixel heights summing to barH
          let usedH = 0;
          const segs: { id: string; color: string; h: number }[] = [];
          const activeSrcCats = activeCats.filter(
            (c) => (qa.hoursByCategory[c.id] ?? 0) > 0,
          );
          activeSrcCats.forEach((cat, i) => {
            const raw = Math.round((qa.hoursByCategory[cat.id] / total) * barH);
            const segH = i === activeSrcCats.length - 1 ? barH - usedH : raw;
            usedH += segH;
            segs.push({ id: cat.id, color: cat.color, h: Math.max(segH, 0) });
          });

          return (
            <View
              key={qa.name}
              style={{ flex: 1, alignItems: "center", marginRight: 4 }}
            >
              <View style={{ width: 22, height: barH, borderRadius: 3 }}>
                {segs.map((seg) => (
                  <View
                    key={seg.id}
                    style={{
                      width: 22,
                      height: seg.h,
                      backgroundColor: seg.color,
                    }}
                  />
                ))}
              </View>
              <Text
                style={{
                  fontSize: 6.5,
                  color: "#374151",
                  textAlign: "center",
                  marginTop: 4,
                }}
              >
                {qa.name.split(" ")[0]}
              </Text>
            </View>
          );
        })}
      </View>
      <Text style={{ fontSize: 6, color: "#9CA3AF", marginTop: 4 }}>
        Porcentaje del total de horas controlables por QA
      </Text>
    </View>
  );
}

/** Line chart: one line per category, QA names on X axis */
function PDFQALineChart({
  qas,
  categories,
  width = 480,
  height = 120,
}: {
  qas: PDFQAPerEntry[];
  categories: PDFQACategoryAvg[];
  width?: number;
  height?: number;
}) {
  if (qas.length < 2) return null;
  const activeCats = categories.slice(0, 6);
  let maxVal = 0;
  for (const qa of qas) {
    for (const cat of activeCats) {
      const v = qa.hoursByCategory[cat.id] ?? 0;
      if (v > maxVal) maxVal = v;
    }
  }
  if (maxVal === 0) return null;

  const padL = 28;
  const padR = 8;
  const padT = 8;
  const padB = 22;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;
  const n = qas.length;
  const xScale = (i: number) =>
    padL + (n > 1 ? (i / (n - 1)) * chartW : chartW / 2);
  const yScale = (v: number) => padT + chartH - (v / maxVal) * chartH;
  const fmtH = (h: number) => {
    const d = Math.round(h / 8);
    return d > 0 ? `${d}d` : `${Math.round(h)}h`;
  };

  return (
    <Svg width={width} height={height}>
      <Line
        x1={padL}
        y1={padT}
        x2={padL + chartW}
        y2={padT}
        stroke="#E5E7EB"
        strokeWidth={0.5}
      />
      <Line
        x1={padL}
        y1={padT + chartH / 2}
        x2={padL + chartW}
        y2={padT + chartH / 2}
        stroke="#F3F4F6"
        strokeWidth={0.5}
      />
      <Line
        x1={padL}
        y1={padT + chartH}
        x2={padL + chartW}
        y2={padT + chartH}
        stroke="#D1D5DB"
        strokeWidth={1}
      />
      <Text style={{ fontSize: 5, color: "#9CA3AF" }} x={0} y={padT + 4}>
        {fmtH(maxVal)}
      </Text>
      <Text
        style={{ fontSize: 5, color: "#9CA3AF" }}
        x={0}
        y={padT + chartH / 2 + 4}
      >
        {fmtH(maxVal / 2)}
      </Text>
      <Text
        style={{ fontSize: 5, color: "#9CA3AF" }}
        x={0}
        y={padT + chartH + 4}
      >
        0
      </Text>
      {qas.map((qa, i) => (
        <Text
          key={i}
          style={{ fontSize: 5.5, color: "#9CA3AF" }}
          x={xScale(i) - 12}
          y={height - 2}
        >
          {qa.name.split(" ")[0].slice(0, 8)}
        </Text>
      ))}
      {activeCats.map((cat) => {
        const pts = qas.map((qa, i) => ({
          x: xScale(i),
          y: yScale(qa.hoursByCategory[cat.id] ?? 0),
        }));
        return pts
          .slice(0, -1)
          .map((pt, i) => (
            <Line
              key={`${cat.id}-${i}`}
              x1={pt.x}
              y1={pt.y}
              x2={pts[i + 1].x}
              y2={pts[i + 1].y}
              stroke={cat.color}
              strokeWidth={1.5}
            />
          ));
      })}
      {activeCats.map((cat) =>
        qas.map((qa, i) => (
          <Circle
            key={`${cat.id}-dot-${i}`}
            cx={xScale(i)}
            cy={yScale(qa.hoursByCategory[cat.id] ?? 0)}
            r={2.5}
            fill={cat.color}
          />
        )),
      )}
    </Svg>
  );
}

// ── QA Stats PDF Page ──────────────────────────────────────────────────────

function PDFQAStatsPage({
  data,
  label,
}: {
  data: PDFQAStatsData;
  label: string;
}) {
  const {
    generatedAt,
    dateRange,
    nQAs: _nQAs,
    avgEfficiency,
    avgControllablePerQA: _avgControllablePerQA,
    avgValidPerQA,
    nonControllableHours,
    totalAllHours,
    nonControllableCategories,
    categories,
    qas,
  } = data;

  const effColor =
    avgEfficiency >= 70
      ? "#10B981"
      : avgEfficiency >= 50
        ? "#F59E0B"
        : "#EF4444";
  // Mostrar solo "Manual" o "Automatización" en el subtítulo (el título ya dice «Análisis Estadístico QA»)
  const shortLabel = label.includes(" — ")
    ? label.split(" — ").slice(1).join(" — ")
    : label;

  // Nota informativa (igual que el web)
  const top3 = categories.slice(0, 3);
  const noteText =
    top3.length >= 3
      ? `Mayor tiempo: ${top3[0].name}, seguido de ${top3[1].name} y ${top3[2].name}.`
      : top3.length === 2
        ? `Mayor tiempo: ${top3[0].name}, seguido de ${top3[1].name}.`
        : top3.length === 1
          ? `Mayor tiempo: ${top3[0].name}.`
          : "";

  // Segmentos del donut en base a totalAllHours (incluye No Productivo, igual que web)
  const _totalBase = totalAllHours > 0 ? totalAllHours : 1;
  const donutSegs = [
    ...categories.map((cat) => ({
      pct: (cat.teamTotalHours / _totalBase) * 100,
      color: cat.color,
    })),
    ...(nonControllableHours > 0
      ? [{ pct: (nonControllableHours / _totalBase) * 100, color: "#71717A" }]
      : []),
  ];

  return (
    <Page size="A3" orientation="landscape" style={s.page}>
      {/* ── Header ── */}
      <View style={{ ...s.headerRow, marginBottom: 7, paddingBottom: 6 }}>
        <View>
          <Text style={s.title}>Análisis Estadístico QA</Text>
          <Text style={s.subtitle}>
            {shortLabel} · Período: {dateRange}
          </Text>
        </View>
        <Text style={s.genAt}>Generado: {generatedAt}</Text>
      </View>

      {/* ── FILA 1: Barras verticales por área + Resumen promedios (web Row 1) ── */}
      <View style={{ ...s.row2, marginBottom: 5 }}>
        {/* Panel A: Promedio por área — barras verticales (= web left col Row 1) */}
        <View style={{ ...s.panel, flex: 2 }}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: 8,
            }}
          >
            <Text style={s.panelTitle}>
              PROMEDIO DE HORAS POR ÁREA{" "}
              <Text
                style={{
                  fontSize: 6.5,
                  fontFamily: "Helvetica",
                  color: "#9CA3AF",
                }}
              >
                (por QA)
              </Text>
            </Text>
            {noteText ? (
              <View
                style={{
                  maxWidth: 190,
                  borderRadius: 5,
                  borderWidth: 1,
                  borderColor: "rgba(59,130,246,0.22)",
                  backgroundColor: "rgba(59,130,246,0.06)",
                  padding: 5,
                  marginLeft: 8,
                }}
              >
                <Text
                  style={{
                    fontSize: 6.5,
                    color: "rgba(96,165,250,0.9)",
                    lineHeight: 1.5,
                  }}
                >
                  {noteText}
                </Text>
              </View>
            ) : null}
          </View>
          <PDFQACategoryVertBars categories={categories} barH={75} />
        </View>

        {/* Panel B: Resumen promedios por QA (= web right panel Row 1) */}
        <View style={s.panelLast}>
          <Text style={s.panelTitle}>RESUMEN PROMEDIOS POR QA</Text>
          <View>
            {categories.map((cat) => (
              <View
                key={cat.id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginBottom: 3,
                }}
              >
                <View
                  style={{
                    width: 13,
                    height: 13,
                    borderRadius: 7,
                    borderWidth: 2,
                    borderColor: cat.color,
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: 5,
                  }}
                >
                  <View
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: 3,
                      backgroundColor: cat.color,
                    }}
                  />
                </View>
                <Text style={{ flex: 1, fontSize: 7.5, color: "#111827" }}>
                  {cat.name}
                </Text>
                <Text
                  style={{
                    fontSize: 7.5,
                    fontFamily: "Helvetica-Bold",
                    color: "#111827",
                  }}
                >
                  {formatTime(cat.teamAvgHours)}
                </Text>
              </View>
            ))}
          </View>
          <View
            style={{ marginVertical: 4, height: 1, backgroundColor: "#E5E7EB" }}
          />
          {/* Total horas válidas (Testing + QA Fixed + Retesting) */}
          <View
            style={{
              borderRadius: 5,
              borderWidth: 1,
              borderColor: "rgba(59,130,246,0.25)",
              backgroundColor: "rgba(59,130,246,0.08)",
              padding: 5,
              marginBottom: 3,
            }}
          >
            <Text
              style={{
                fontSize: 6.5,
                fontFamily: "Helvetica-Bold",
                color: "#60A5FA",
              }}
            >
              TOTAL HORAS PROMEDIO VÁLIDAS
            </Text>
            <Text style={{ fontSize: 5.5, color: "#9CA3AF", marginTop: 1 }}>
              (Testing + QA Fixed + Retesting)
            </Text>
            <Text
              style={{
                fontSize: 13,
                fontFamily: "Helvetica-Bold",
                color: "#60A5FA",
                marginTop: 3,
              }}
            >
              {formatTime(avgValidPerQA)}
            </Text>
          </View>
          {/* Eficiencia promedio */}
          <View
            style={{
              borderRadius: 5,
              borderWidth: 1,
              borderColor: `${effColor}40`,
              backgroundColor: `${effColor}12`,
              padding: 5,
            }}
          >
            <Text
              style={{
                fontSize: 6.5,
                fontFamily: "Helvetica-Bold",
                color: effColor,
              }}
            >
              EFICIENCIA PROMEDIO
            </Text>
            <Text style={{ fontSize: 5.5, color: "#9CA3AF", marginTop: 1 }}>
              Testing efectivo / horas controlables
            </Text>
            <Text
              style={{
                fontSize: 13,
                fontFamily: "Helvetica-Bold",
                color: effColor,
                marginTop: 3,
              }}
            >
              {avgEfficiency.toFixed(1)}%
            </Text>
          </View>
        </View>
      </View>

      {/* ── FILA 2: Comparativo agrupado + Distribución donut (web Row 2) ── */}
      <View style={{ ...s.row2, marginBottom: 5 }}>
        {/* Panel C: Grouped bars per QA (la leyenda ya está dentro de PDFGroupedBarChart) */}
        <View style={{ ...s.panel, flex: 2 }}>
          <Text style={s.panelTitle}>COMPARATIVO POR QA — HORAS POR ÁREA</Text>
          <PDFGroupedBarChart qas={qas} categories={categories} chartH={100} />
        </View>

        {/* Panel D: Donut distribución porcentual */}
        <View style={s.panelLast}>
          <Text style={s.panelTitle}>DISTRIBUCIÓN PORCENTUAL DEL TIEMPO</Text>
          <View style={{ alignItems: "center", marginBottom: 4 }}>
            <DonutWithCenter
              segments={donutSegs}
              size={68}
              stroke={13}
              centerValue="100%"
              centerLabel="TOTAL"
            />
          </View>
          <View>
            {categories.map((cat) => {
              const pct =
                _totalBase > 0 ? (cat.teamTotalHours / _totalBase) * 100 : 0;
              return (
                <View key={cat.id} style={{ ...s.tRow, paddingVertical: 1.5 }}>
                  <View
                    style={{
                      flex: 3,
                      flexDirection: "row",
                      alignItems: "center",
                    }}
                  >
                    <View style={{ ...s.dot, backgroundColor: cat.color }} />
                    <Text style={s.tLabel}>{cat.name}</Text>
                  </View>
                  <Text style={{ ...s.tPct, color: cat.color }}>
                    {pct.toFixed(1)}%
                  </Text>
                </View>
              );
            })}
            {nonControllableHours > 0 && (
              <View>
                {/* Fila encabezado */}
                <View style={{ ...s.tRow, paddingVertical: 1.5 }}>
                  <View
                    style={{
                      flex: 3,
                      flexDirection: "row",
                      alignItems: "center",
                    }}
                  >
                    <View style={{ ...s.dot, backgroundColor: "#71717A" }} />
                    <Text
                      style={{
                        ...s.tLabel,
                        color: "#71717A",
                        fontFamily: "Helvetica-Bold",
                      }}
                    >
                      Tiempo No Productivo*
                    </Text>
                  </View>
                  <Text
                    style={{
                      ...s.tPct,
                      color: "#71717A",
                      fontFamily: "Helvetica-Bold",
                    }}
                  >
                    {((nonControllableHours / _totalBase) * 100).toFixed(1)}%
                  </Text>
                </View>
                {/* Sub-filas de categorías excluidas */}
                <View
                  style={{
                    borderLeftWidth: 1.5,
                    borderLeftColor: "#52525B",
                    paddingLeft: 7,
                    marginTop: 3,
                    marginBottom: 2,
                  }}
                >
                  {nonControllableCategories.map((cat) => {
                    const pct =
                      _totalBase > 0 ? (cat.hours / _totalBase) * 100 : 0;
                    return (
                      <View
                        key={cat.id}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          marginBottom: 2,
                        }}
                      >
                        <View
                          style={{
                            width: 5,
                            height: 5,
                            borderRadius: 3,
                            backgroundColor: cat.color,
                            marginRight: 4,
                          }}
                        />
                        <Text
                          style={{ flex: 1, fontSize: 6, color: "#9CA3AF" }}
                        >
                          {cat.name}
                        </Text>
                        <Text
                          style={{
                            fontSize: 6,
                            color: "#6B7280",
                            marginRight: 5,
                          }}
                        >
                          {formatTime(cat.hours)}
                        </Text>
                        <Text
                          style={{
                            fontSize: 5.5,
                            color: "#71717A",
                            width: 28,
                            textAlign: "right",
                          }}
                        >
                          {pct.toFixed(1)}%
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}
          </View>
          {nonControllableHours > 0 && (
            <Text style={{ fontSize: 5.5, color: "#9CA3AF", marginTop: 5 }}>
              * No forma parte de la métrica de eficiencia.
            </Text>
          )}
        </View>
      </View>

      {/* ── FILA 3: Ranking + Tendencia + Composición % (web Row 3) ── */}
      <View style={{ flexDirection: "row", marginBottom: 4 }}>
        {/* Panel E: Ranking (web left 300px col) */}
        <View style={{ ...s.panel, flex: 1 }}>
          <Text style={s.panelTitle}>RANKING DE TESTING EFECTIVO</Text>
          {[...qas]
            .sort((a, b) => b.efficiencyRate - a.efficiencyRate)
            .map((qa, i) => {
              const qEffColor =
                qa.efficiencyRate >= 70
                  ? "#10B981"
                  : qa.efficiencyRate >= 50
                    ? "#F59E0B"
                    : "#EF4444";
              return (
                <View key={qa.name} style={{ marginBottom: 4 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ fontSize: 7.5, color: "#374151", flex: 1 }}>
                      {i + 1}. {qa.name}
                    </Text>
                    <Text
                      style={{
                        fontSize: 7.5,
                        fontFamily: "Helvetica-Bold",
                        color: qEffColor,
                        marginLeft: 4,
                      }}
                    >
                      {qa.efficiencyRate.toFixed(1)}%
                    </Text>
                  </View>
                  <View style={s.barBg}>
                    <View
                      style={{
                        height: 5,
                        borderRadius: 3,
                        backgroundColor: qEffColor,
                        width: `${Math.min(qa.efficiencyRate, 100)}%`,
                      }}
                    />
                  </View>
                </View>
              );
            })}
          <View
            style={{
              marginTop: 5,
              borderRadius: 5,
              padding: 5,
              backgroundColor: `${effColor}18`,
              borderWidth: 1,
              borderColor: `${effColor}40`,
            }}
          >
            <Text
              style={{
                fontSize: 6.5,
                color: effColor,
                fontFamily: "Helvetica-Bold",
                marginBottom: 2,
              }}
            >
              EFICIENCIA PROMEDIO DEL EQUIPO
            </Text>
            <Text
              style={{
                fontSize: 14,
                fontFamily: "Helvetica-Bold",
                color: effColor,
              }}
            >
              {avgEfficiency.toFixed(1)}%
            </Text>
          </View>
        </View>

        {/* Panel F: Tendencia (web middle col) */}
        <View style={{ ...s.panel, flex: 2 }}>
          <Text style={s.panelTitle}>TENDENCIA DE HORAS PROMEDIO POR ÁREA</Text>
          <View
            style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 2 }}
          >
            {categories.slice(0, 6).map((cat) => (
              <View
                key={cat.id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginRight: 8,
                  marginBottom: 2,
                }}
              >
                <View
                  style={{
                    width: 7,
                    height: 7,
                    backgroundColor: cat.color,
                    borderRadius: 4,
                    marginRight: 2,
                  }}
                />
                <Text style={{ fontSize: 6, color: "#374151" }}>
                  {cat.name.length > 20
                    ? cat.name.slice(0, 19) + "…"
                    : cat.name}
                </Text>
              </View>
            ))}
          </View>
          <PDFQALineChart qas={qas} categories={categories} height={95} />
        </View>

        {/* Panel G: Composición porcentual (web right col) */}
        <View style={s.panelLast}>
          <Text style={s.panelTitle}>COMPOSICIÓN DE HORAS POR QA (%)</Text>
          <PDFStackedBar100 qas={qas} categories={categories} barH={100} />
        </View>
      </View>

      {/* ── Nota al pie (igual que el web) ── */}
      <View
        style={{
          flexDirection: "row",
          borderRadius: 5,
          borderWidth: 1,
          borderColor: "#E5E7EB",
          backgroundColor: "#F9FAFB",
          paddingHorizontal: 8,
          paddingVertical: 3,
          marginBottom: 4,
          alignItems: "flex-start",
        }}
      >
        <Text style={{ fontSize: 5.5, color: "#9CA3AF", marginRight: 4 }}>
          ⓘ
        </Text>
        <Text style={{ fontSize: 5.5, color: "#9CA3AF", flex: 1 }}>
          Nota: Todos los promedios están calculados en horas por QA. La
          eficiencia se calcula únicamente con QA Testing + QA Fixed + Retesting
          sobre las horas controlables totales.
        </Text>
      </View>

      {/* ── Footer ── */}
      <View style={s.footer} fixed>
        <Text>Evaluador de Tareas · Análisis Estadístico QA · {label}</Text>
        <Text>{generatedAt}</Text>
      </View>
    </Page>
  );
}

// ── Main Document ───────────────────────────────────────────────────────────

function PDFReportPage({ data, label }: { data: PDFChartData; label: string }) {
  const {
    generatedAt,
    dateRange,
    totalTimingHours,
    totalTimingTasks,
    avgPerTask,
    avgPerQA,
    avgEfficiency,
    nActiveQAs,
    productTypeSegments,
    projectSegments,
    complexitySegments,
    productTypeSummary,
    cumulativeChartData,
    allProductTypes,
    productTypeColors,
    top5Tasks,
    qaDistSegments,
    activityRows,
    totalActivityHours,
    availableHoursTotal,
    nQAs,
  } = data;

  const maxTop5 = top5Tasks[0]?.hours ?? 1;

  // Info notes (dynamic, mirrors web panel notes)
  const centerTotalLabel = formatTime(totalTimingHours);
  const productNote = productTypeSegments[0]
    ? `${productTypeSegments[0].label} concentra el mayor tiempo con ${productTypeSegments[0].pct.toFixed(1)}% del total.`
    : "";
  const projectNote = projectSegments[0]
    ? `${projectSegments[0].label} lidera con ${projectSegments[0].pct.toFixed(1)}% del tiempo total registrado.`
    : "";
  const complexityNote = complexitySegments[0]
    ? `Las tareas de talla ${complexitySegments[0].size} concentran el mayor tiempo (${complexitySegments[0].pct.toFixed(1)}%).`
    : "";
  const qaNote = qaDistSegments[0]
    ? `${qaDistSegments[0].name} lidera con ${qaDistSegments[0].pct.toFixed(1)}% del tiempo total.`
    : "";
  const totalQADistHours = qaDistSegments.reduce((acc, q) => acc + q.hours, 0);

  return (
    <Page size="A3" orientation="landscape" style={s.page}>
      {/* ── Header ── */}
      <View style={s.headerRow}>
        <View>
          <Text style={s.title}>Análisis de Tiempo y Cumplimiento</Text>
          <Text style={s.subtitle}>
            {label} · Período: {dateRange}
          </Text>
        </View>
        <Text style={s.genAt}>Generado: {generatedAt}</Text>
      </View>

      {/* ── KPIs ── */}
      <View style={s.kpiRow}>
        <KPICard
          label="TIEMPO TOTAL INVERTIDO"
          value={formatTime(totalTimingHours)}
          sub="100% del tiempo registrado"
          accentColor="#F59E0B"
        />
        <KPICard
          label="TOTAL TAREAS ANALIZADAS"
          value={String(totalTimingTasks)}
          sub="Con tiempo registrado"
          accentColor="#3B82F6"
        />
        <KPICard
          label="PROMEDIO POR TAREA"
          value={formatTime(avgPerTask)}
          sub="Horas promedio / tarea"
          accentColor="#8B5CF6"
        />
        <KPICard
          label="PROMEDIO POR QA"
          value={formatTime(avgPerQA)}
          sub={`${nActiveQAs} QAs activos`}
          accentColor="#EC4899"
        />
        <KPICard
          label="EFICIENCIA QA"
          value={`${avgEfficiency.toFixed(1)}%`}
          sub="Testing efectivo / horas disponibles"
          accentColor="#10B981"
          last
        />
      </View>

      {/* ── FILA 2: Producto · Proyecto · Complejidad ── */}
      <View style={s.row3}>
        {/* Distribución de tiempo por producto */}
        <View style={{ ...s.panel, justifyContent: "space-between" }}>
          <View>
            <Text style={s.panelTitle}>
              DISTRIBUCIÓN DE TIEMPO POR PRODUCTO
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <DonutWithCenter
                segments={productTypeSegments}
                size={72}
                stroke={12}
                centerValue={centerTotalLabel}
                centerLabel="TOTAL"
              />
              <View style={{ flex: 1, marginLeft: 8 }}>
                {productTypeSegments.map((seg) => (
                  <LegendRow
                    key={seg.label}
                    color={seg.color}
                    label={seg.label}
                    hours={seg.hours}
                    pct={seg.pct}
                  />
                ))}
              </View>
            </View>
          </View>
          {productNote ? <Text style={s.infoNote}>{productNote}</Text> : null}
        </View>

        {/* Tiempo por tipo de proyecto */}
        <View style={{ ...s.panel, justifyContent: "space-between" }}>
          <View>
            <Text style={s.panelTitle}>TIEMPO POR TIPO DE PROYECTO</Text>
            {projectSegments
              .filter((seg) => seg.hours > 0)
              .map((seg) => (
                <HBar
                  key={seg.label}
                  label={seg.label}
                  hours={seg.hours}
                  pct={seg.pct}
                  color={seg.color}
                />
              ))}
          </View>
          {projectNote ? <Text style={s.infoNote}>{projectNote}</Text> : null}
        </View>

        {/* Distribución de tiempo por complejidad */}
        <View style={{ ...s.panelLast, justifyContent: "space-between" }}>
          <View>
            <Text style={s.panelTitle}>
              DISTRIBUCIÓN DE TIEMPO POR COMPLEJIDAD
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <DonutWithCenter
                segments={complexitySegments}
                size={72}
                stroke={12}
                centerValue={centerTotalLabel}
                centerLabel="TOTAL"
              />
              <View style={{ flex: 1, marginLeft: 8 }}>
                {complexitySegments.map((seg) => (
                  <View key={seg.size} style={s.tRow}>
                    <View
                      style={{
                        flex: 3,
                        flexDirection: "row",
                        alignItems: "center",
                      }}
                    >
                      <View
                        style={{ ...s.dotSq, backgroundColor: seg.color }}
                      />
                      <Text style={s.tLabel}>{seg.size}</Text>
                    </View>
                    <Text style={s.tVal}>{formatTime(seg.hours)}</Text>
                    <Text style={{ ...s.tPct, color: seg.color }}>
                      {seg.pct.toFixed(1)}%
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
          {complexityNote ? (
            <Text style={s.infoNote}>{complexityNote}</Text>
          ) : null}
        </View>
      </View>

      {/* ── FILA 3: Gráfico acumulado · Resumen producto ── */}
      <View style={s.row2}>
        <View style={{ ...s.panelWide, justifyContent: "space-between" }}>
          <View>
            <Text style={s.panelTitle}>TIEMPO ACUMULADO POR PRODUCTO</Text>
            <MiniLineChart
              data={cumulativeChartData}
              productTypes={allProductTypes}
              colors={productTypeColors}
              width={738}
              height={95}
            />
            <View
              style={{
                flexDirection: "row",
                justifyContent: "center",
                marginTop: 6,
                flexWrap: "wrap",
              }}
            >
              {allProductTypes.map((p) => (
                <View
                  key={p}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginRight: 14,
                  }}
                >
                  <View
                    style={{
                      width: 16,
                      height: 2,
                      backgroundColor: productTypeColors[p] ?? "#9CA3AF",
                      marginRight: 4,
                      borderRadius: 1,
                    }}
                  />
                  <Text style={{ fontSize: 6.5, color: "#374151" }}>{p}</Text>
                </View>
              ))}
            </View>
          </View>
          <Text style={s.infoNote}>
            Evolucion del tiempo registrado acumulado por tipo de producto a lo
            largo del periodo.
          </Text>
        </View>

        {/* Resumen por tipo de producto */}
        <View style={s.panelLast}>
          <Text style={s.panelTitle}>TIEMPO POR PRODUCTO (RESUMEN)</Text>
          <View style={s.tHead}>
            <Text style={{ ...s.tHeadLabel, flex: 3 }}>Producto</Text>
            <Text style={{ ...s.tHeadLabel, flex: 2, textAlign: "right" }}>
              Tiempo
            </Text>
            <Text style={{ ...s.tHeadLabel, flex: 1.5, textAlign: "right" }}>
              % del total
            </Text>
          </View>
          {productTypeSummary.map((row) => (
            <LegendRow
              key={row.label}
              color={row.color}
              label={row.label}
              hours={row.hours}
              pct={row.pct}
            />
          ))}
          <View style={s.tRowBold}>
            <Text style={{ ...s.tLabelBold, flex: 3 }}>TOTAL</Text>
            <Text style={s.tValBold}>{formatTime(totalTimingHours)}</Text>
            <Text style={{ ...s.tPct, color: "#374151" }}>100%</Text>
          </View>
        </View>
      </View>

      {/* ── FILA 4: Top 5 · QA distribución · Cumplimiento ── */}
      <View style={s.row2}>
        {/* Top 5 tareas */}
        <View style={{ ...s.panel, justifyContent: "space-between" }}>
          <View>
            <Text style={s.panelTitle}>
              TOP 5 TAREAS CON MÁS TIEMPO INVERTIDO
            </Text>
            {top5Tasks.map((t, i) => {
              const COLORS = [
                "#F59E0B",
                "#3B82F6",
                "#8B5CF6",
                "#EC4899",
                "#10B981",
              ];
              const color = COLORS[i % COLORS.length];
              const pct = maxTop5 > 0 ? (t.hours / maxTop5) * 100 : 0;
              return (
                <View key={t.name + i} style={{ marginBottom: 6 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ fontSize: 7.5, color: "#374151", flex: 1 }}>
                      {t.name}
                    </Text>
                    <Text
                      style={{
                        fontSize: 7.5,
                        color,
                        fontFamily: "Helvetica-Bold",
                        marginLeft: 4,
                      }}
                    >
                      {formatTime(t.hours)}
                    </Text>
                  </View>
                  <View style={s.barBg}>
                    <View
                      style={{
                        height: 5,
                        borderRadius: 3,
                        backgroundColor: color,
                        width: `${pct}%`,
                      }}
                    />
                  </View>
                </View>
              );
            })}
          </View>
          <Text style={s.infoNote}>
            Ordenadas de mayor a menor horas registradas en el periodo.
          </Text>
        </View>

        {/* QA distribución */}
        <View style={{ ...s.panel, justifyContent: "space-between" }}>
          <View>
            <Text style={s.panelTitle}>TIEMPO POR QA (DISTRIBUCION)</Text>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <DonutWithCenter
                segments={qaDistSegments}
                size={72}
                stroke={12}
                centerValue={formatTime(totalQADistHours)}
                centerLabel="TOTAL"
              />
              <View style={{ flex: 1, marginLeft: 8 }}>
                {qaDistSegments.map((seg) => (
                  <View key={seg.name} style={s.tRow}>
                    <View
                      style={{
                        flex: 3,
                        flexDirection: "row",
                        alignItems: "center",
                      }}
                    >
                      <View style={{ ...s.dot, backgroundColor: seg.color }} />
                      <Text style={s.tLabel}>{seg.name}</Text>
                    </View>
                    <Text style={s.tVal}>{formatTime(seg.hours)}</Text>
                    <Text style={{ ...s.tPct, color: seg.color }}>
                      {seg.pct.toFixed(1)}%
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
          {qaNote ? <Text style={s.infoNote}>{qaNote}</Text> : null}
        </View>

        {/* Cumplimiento por actividad */}
        <View style={s.panelLast}>
          <Text style={s.panelTitle}>CUMPLIMIENTO POR TIPO DE ACTIVIDAD</Text>
          <View style={s.tHead}>
            <Text style={{ ...s.tHeadLabel, flex: 3 }}>Actividad</Text>
            <Text style={{ ...s.tHeadLabel, flex: 2, textAlign: "right" }}>
              Tiempo
            </Text>
            <Text style={{ ...s.tHeadLabel, flex: 1.5, textAlign: "right" }}>
              Cumpl.
            </Text>
          </View>
          {activityRows.map((row) => (
            <View key={row.name} style={s.tRow}>
              <View
                style={{ flex: 3, flexDirection: "row", alignItems: "center" }}
              >
                <View style={{ ...s.dotSq, backgroundColor: row.color }} />
                <Text style={s.tLabel}>{row.name}</Text>
              </View>
              <Text style={s.tVal}>{formatTime(row.hours)}</Text>
              <Text
                style={{
                  ...s.tPct,
                  color: row.isOver
                    ? "#EF4444"
                    : row.compliance > 70
                      ? "#10B981"
                      : "#F59E0B",
                }}
              >
                {row.compliance.toFixed(1)}%{row.isOver ? "*" : ""}
              </Text>
            </View>
          ))}
          <View style={s.tRowBold}>
            <Text style={{ ...s.tLabelBold, flex: 3 }}>TOTAL VÁLIDO</Text>
            <Text style={s.tValBold}>{formatTime(totalActivityHours)}</Text>
            <Text
              style={{
                ...s.tPct,
                color:
                  availableHoursTotal > 0 &&
                  (totalActivityHours / availableHoursTotal) * 100 > 100
                    ? "#EF4444"
                    : "#10B981",
              }}
            >
              {availableHoursTotal > 0
                ? `${((totalActivityHours / availableHoursTotal) * 100).toFixed(1)}%`
                : "—"}
            </Text>
          </View>
          <Text style={{ fontSize: 6.5, color: "#9CA3AF", marginTop: 5 }}>
            Basado en {availableHoursTotal}h disponibles (160h × {nQAs} QA
            {nQAs !== 1 ? "s" : ""}).
          </Text>
        </View>
      </View>

      {/* ── Footer ── */}
      <View style={s.footer} fixed>
        <Text>
          Evaluador de Tareas · Análisis de Tiempo y Cumplimiento · {label}
        </Text>
        <Text>{generatedAt}</Text>
      </View>
    </Page>
  );
}

// ── PDFQAEvaluationPage ────────────────────────────────────────────────────
// Página de la tabla de evaluaciones de QA (equivalente a qaReportPdfService)

const evStyles = StyleSheet.create({
  // paddingBottom generoso para que ninguna fila de tabla quede debajo del footer fijo
  page: {
    backgroundColor: "#fff",
    paddingTop: 24,
    paddingLeft: 24,
    paddingRight: 24,
    paddingBottom: 50,
    fontFamily: "Helvetica",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  title: { fontSize: 14, fontFamily: "Helvetica-Bold", color: "#111827" },
  subtitle: { fontSize: 8, color: "#6B7280", marginTop: 2 },
  genAt: { fontSize: 7, color: "#9CA3AF" },
  kpiRow: { flexDirection: "row", marginBottom: 12, gap: 6 },
  kpiCard: {
    flex: 1,
    backgroundColor: "#F9FAFB",
    borderRadius: 5,
    padding: 7,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  kpiLabel: { fontSize: 6.5, color: "#6B7280", marginBottom: 2 },
  kpiValue: { fontSize: 12, fontFamily: "Helvetica-Bold", color: "#111827" },
  // Tabla
  thead: {
    flexDirection: "row",
    backgroundColor: "#1F2937",
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  th: { fontSize: 7, fontFamily: "Helvetica-Bold", color: "#F9FAFB" },
  row: {
    flexDirection: "row",
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  rowAlt: {
    flexDirection: "row",
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
    backgroundColor: "#F9FAFB",
  },
  td: { fontSize: 7, color: "#374151" },
  tdBold: { fontSize: 7, fontFamily: "Helvetica-Bold", color: "#111827" },
  badge: {
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
    backgroundColor: "#D1FAE5",
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: "#065F46",
  },
  footer: {
    position: "absolute",
    bottom: 14,
    left: 24,
    right: 24,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    paddingTop: 5,
    fontSize: 6.5,
    color: "#9CA3AF",
  },
});

function fmtScore(v: number | null | undefined): string {
  if (v == null) return "—";
  return String(v);
}

function fmtLocalDate(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("es-ES");
}

function PDFQAEvaluationPage({ data }: { data: PDFQAEvaluationData }) {
  const { rows, startDate, endDate, generatedAt } = data;

  const withEval = rows.filter(
    (r) => r.excelencia != null || r.soft_skills != null,
  ).length;
  const excelVals = rows
    .filter((r) => r.excelencia != null)
    .map((r) => r.excelencia as number);
  const ssVals = rows
    .filter((r) => r.soft_skills != null)
    .map((r) => r.soft_skills as number);
  const avgEx =
    excelVals.length > 0
      ? (excelVals.reduce((a, b) => a + b, 0) / excelVals.length).toFixed(2)
      : "—";
  const avgSs =
    ssVals.length > 0
      ? (ssVals.reduce((a, b) => a + b, 0) / ssVals.length).toFixed(2)
      : "—";

  // Anchos de columna (A4 landscape ~792pt - 48pt padding = 744pt usable, pero Page A3 = 1191)
  // Usamos porcentajes relativos con flex
  const COL = {
    n: 0.03,
    name: 0.17,
    tasa: 0.1,
    cump: 0.1,
    excel: 0.1,
    ss: 0.1,
    final: 0.1,
    coment: 0.3,
  };

  return (
    <Page size="A3" orientation="landscape" style={evStyles.page}>
      {/* Header */}
      <View style={evStyles.headerRow}>
        <View>
          <Text style={evStyles.title}>Evaluaciones de QA</Text>
          <Text style={evStyles.subtitle}>
            Período: {fmtLocalDate(startDate)} – {fmtLocalDate(endDate)}
          </Text>
        </View>
        <Text style={evStyles.genAt}>Generado: {generatedAt}</Text>
      </View>

      {/* KPIs */}
      <View style={evStyles.kpiRow}>
        {[
          { label: "Total miembros", value: String(rows.length) },
          { label: "Con evaluación", value: String(withEval) },
          { label: "Prom. Excelencia", value: avgEx },
          { label: "Prom. Soft Skills", value: avgSs },
        ].map((k) => (
          <View key={k.label} style={evStyles.kpiCard}>
            <Text style={evStyles.kpiLabel}>{k.label}</Text>
            <Text style={evStyles.kpiValue}>{k.value}</Text>
          </View>
        ))}
      </View>

      {/* Tabla */}
      {/* Encabezado */}
      <View style={evStyles.thead}>
        <Text style={{ ...evStyles.th, flex: COL.n }}>N°</Text>
        <Text style={{ ...evStyles.th, flex: COL.name }}>Nombre</Text>
        <Text style={{ ...evStyles.th, flex: COL.tasa, textAlign: "center" }}>
          Tasa Acept.
        </Text>
        <Text style={{ ...evStyles.th, flex: COL.cump, textAlign: "center" }}>
          Cumplimiento
        </Text>
        <Text style={{ ...evStyles.th, flex: COL.excel, textAlign: "center" }}>
          Excelencia
        </Text>
        <Text style={{ ...evStyles.th, flex: COL.ss, textAlign: "center" }}>
          Soft Skills
        </Text>
        <Text style={{ ...evStyles.th, flex: COL.final, textAlign: "center" }}>
          Calif. Final
        </Text>
        <Text style={{ ...evStyles.th, flex: COL.coment }}>Comentarios</Text>
      </View>

      {/* Filas */}
      {rows.map((row, idx) => {
        const vals = [
          row.tasa_aceptacion,
          row.cumplimiento,
          row.excelencia,
          row.soft_skills,
        ].filter((v): v is number => v != null);
        const avg =
          vals.length > 0
            ? vals.reduce((a, b) => a + b, 0) / vals.length
            : null;
        const califFinal =
          avg != null ? (avg % 1 === 0 ? avg.toFixed(0) : avg.toFixed(2)) : "—";
        const rowStyle = idx % 2 === 0 ? evStyles.row : evStyles.rowAlt;
        const tasat = row.tasa_aceptacion;
        const cump = row.cumplimiento;
        return (
          <View key={String(idx)} style={rowStyle} wrap={false}>
            <Text style={{ ...evStyles.td, flex: COL.n }}>{idx + 1}</Text>
            <Text style={{ ...evStyles.tdBold, flex: COL.name }}>
              {row.qa_name ?? "—"}
            </Text>
            <Text
              style={{ ...evStyles.td, flex: COL.tasa, textAlign: "center" }}
            >
              {tasat != null
                ? tasat % 1 === 0
                  ? String(Math.round(tasat))
                  : String(tasat)
                : "0"}
            </Text>
            <Text
              style={{ ...evStyles.td, flex: COL.cump, textAlign: "center" }}
            >
              {cump != null ? String(cump) : "0"}
            </Text>
            <Text
              style={{ ...evStyles.td, flex: COL.excel, textAlign: "center" }}
            >
              {fmtScore(row.excelencia)}
            </Text>
            <Text style={{ ...evStyles.td, flex: COL.ss, textAlign: "center" }}>
              {fmtScore(row.soft_skills)}
            </Text>
            <View
              style={{
                flex: COL.final,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {avg != null ? (
                <Text style={evStyles.badge}>{califFinal}</Text>
              ) : (
                <Text style={{ ...evStyles.td, textAlign: "center" }}>—</Text>
              )}
            </View>
            <Text style={{ ...evStyles.td, flex: COL.coment }}>
              {row.comentarios ?? "—"}
            </Text>
          </View>
        );
      })}

      {/* Pie de página */}
      <View style={evStyles.footer} fixed>
        <Text>Evaluador de Tareas · Evaluaciones de QA</Text>
        <Text>{generatedAt}</Text>
      </View>
    </Page>
  );
}

export function TimingAnalyticsPDFDocument({ pages }: { pages: PDFPageDef[] }) {
  return (
    <Document>
      {pages.map((page) =>
        page.type === "qa-evaluation" ? (
          <PDFQAEvaluationPage key="qa-evaluation" data={page.data} />
        ) : page.type === "qa-stats" ? (
          <PDFQAStatsPage
            key={page.label}
            data={page.data}
            label={page.label}
          />
        ) : (
          <PDFReportPage key={page.label} data={page.data} label={page.label} />
        ),
      )}
    </Document>
  );
}
