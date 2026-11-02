import React from "react";
import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { AnimatedCursor } from "../components/AnimatedCursor";
import { VirtualCamera } from "../components/VirtualCamera";
import { COLORS } from "../components/Primitives";

// Simulated dashboard screenshot — use result page and zoom to show quality data
// In future, replace with actual /dashboard screenshot
const DASHBOARD_SHOTS = [
  { file: "funnel_shots/26_result.png", startFrame: 0 },
];

const CURSOR_WAYPOINTS = [
  { frame: 0, x: 400, y: 300 },
  { frame: 80, x: 600, y: 200 },
  { frame: 180, x: 800, y: 250 },
  { frame: 280, x: 500, y: 400 },
  { frame: 400, x: 700, y: 350 },
  { frame: 600, x: 700, y: 350 },
];

// KPI counter component
const KpiCounter: React.FC<{
  label: string;
  from: number;
  to: number;
  unit?: string;
  color?: string;
  delay: number;
  suffix?: string;
  decimals?: number;
}> = ({ label, from, to, unit = "", color = COLORS.text, delay, suffix = "", decimals = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const val = interpolate(frame, [delay, delay + fps * 1.5], [from, to], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const opacity = interpolate(frame, [delay - 10, delay + 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div style={{
      opacity,
      backgroundColor: "#0E131E",
      border: `1px solid ${COLORS.border}`,
      borderRadius: 10,
      padding: "16px 18px",
    }}>
      <div style={{ fontSize: 11, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 32, fontWeight: 900, color }}>
        {unit}{decimals > 0 ? val.toFixed(decimals) : Math.round(val)}{suffix}
      </div>
    </div>
  );
};

// Lead row in table
const LeadRow: React.FC<{
  name: string;
  source: string;
  tier: "Qualified" | "Borderline" | "Disqualified";
  score: number;
  value: string;
  disposition: string;
  delay: number;
}> = ({ name, source, tier, score, value, disposition, delay }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [delay, delay + 15], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const tierColor =
    tier === "Qualified" ? COLORS.emerald
    : tier === "Borderline" ? COLORS.amber
    : "#EF4444";
  const dispColor =
    disposition === "Retained" ? COLORS.emerald
    : disposition === "Consult scheduled" ? COLORS.blue
    : COLORS.textMuted;

  return (
    <tr style={{ borderBottom: `1px solid #192231`, opacity }}>
      <td style={{ padding: "10px 14px", color: COLORS.text, fontWeight: 600, fontSize: 13 }}>{name}</td>
      <td style={{ padding: "10px 14px", color: COLORS.textMuted, fontSize: 12 }}>{source}</td>
      <td style={{ padding: "10px 14px" }}>
        <span style={{
          color: tierColor, fontWeight: 700, fontSize: 12,
          backgroundColor: `${tierColor}20`,
          padding: "3px 8px", borderRadius: 5,
          border: `1px solid ${tierColor}40`,
        }}>{tier}</span>
      </td>
      <td style={{ padding: "10px 14px", color: COLORS.text, fontSize: 13 }}>{score}</td>
      <td style={{ padding: "10px 14px", color: tierColor, fontWeight: 700, fontSize: 13 }}>{value}</td>
      <td style={{ padding: "10px 14px" }}>
        <span style={{
          color: dispColor, fontSize: 11, fontWeight: 700,
          backgroundColor: `${dispColor}20`,
          padding: "3px 8px", borderRadius: 5,
        }}>{disposition}</span>
      </td>
    </tr>
  );
};

export const Scene6Dashboard: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });

  const tableOpacity = interpolate(frame, [fps * 1.8, fps * 2.2], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bg, fontFamily: "Inter, -apple-system, sans-serif" }}>
      <div style={{
        position: "absolute", inset: 0,
        background: "radial-gradient(ellipse at 50% 0%, rgba(16,185,129,0.06) 0%, transparent 50%)",
      }} />

      {/* Header */}
      <div style={{
        position: "absolute", top: 48, left: 80, right: 80,
        display: "flex", justifyContent: "space-between", alignItems: "flex-start",
        opacity: titleOpacity,
      }}>
        <div>
          <div style={{ fontSize: 11, color: COLORS.emerald, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>
            Live Intelligence Dashboard
          </div>
          <div style={{ fontSize: 30, fontWeight: 900, color: COLORS.text, letterSpacing: "-0.02em" }}>
            The Closed Loop — Click to Retained
          </div>
        </div>
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          backgroundColor: "rgba(16,185,129,0.12)",
          border: "1px solid rgba(16,185,129,0.3)",
          borderRadius: 6, padding: "6px 14px",
        }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: COLORS.emerald }} />
          <span style={{ color: COLORS.emerald, fontSize: 12, fontWeight: 700 }}>LIVE</span>
        </div>
      </div>

      {/* KPI grid */}
      <div style={{
        position: "absolute", top: 150, left: 80, right: 80,
        display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14,
      }}>
        <KpiCounter label="Total Leads" from={0} to={142} delay={15} />
        <KpiCounter label="Conversion Rate" from={0} to={24.2} suffix="%" decimals={1} delay={25} />
        <KpiCounter label="Qualified Leads" from={0} to={68} color={COLORS.emerald} delay={35} />
        <KpiCounter label="Qualified Rate" from={0} to={47.9} suffix="%" decimals={1} color={COLORS.emerald} delay={45} />
        <KpiCounter label="Median Time" from={60} to={102} unit="" suffix="s" delay={55} />
      </div>

      {/* Tier breakdown bars */}
      <div style={{
        position: "absolute", top: 300, left: 80, width: 360,
        opacity: interpolate(frame, [fps * 1, fps * 1.4], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.text, marginBottom: 14 }}>Lead Quality Distribution</div>
        {[
          { tier: "Qualified", count: 68, total: 142, color: COLORS.emerald },
          { tier: "Borderline", count: 41, total: 142, color: COLORS.amber },
          { tier: "Disqualified", count: 33, total: 142, color: "#EF4444" },
        ].map((item, i) => {
          const barWidth = interpolate(frame, [fps * 1.2 + i * 10, fps * 2 + i * 10], [0, (item.count / item.total) * 100], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          });
          return (
            <div key={item.tier} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 11 }}>
                <span style={{ color: COLORS.textMuted }}>{item.tier}</span>
                <span style={{ color: item.color, fontWeight: 700 }}>{item.count}</span>
              </div>
              <div style={{ width: "100%", height: 8, backgroundColor: "#1E293B", borderRadius: 999 }}>
                <div style={{
                  width: `${barWidth}%`, height: "100%",
                  backgroundColor: item.color, borderRadius: 999,
                  boxShadow: `0 0 10px ${item.color}60`,
                }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Campaign quality table */}
      <div style={{
        position: "absolute", top: 300, left: 460, right: 80,
        opacity: tableOpacity,
      }}>
        <div style={{
          backgroundColor: "#0E131E",
          border: `1px solid ${COLORS.border}`,
          borderRadius: 10,
          overflow: "hidden",
        }}>
          <div style={{
            padding: "12px 16px",
            borderBottom: `1px solid ${COLORS.border}`,
            fontSize: 13, fontWeight: 700, color: COLORS.text,
          }}>
            Recent Lead Intelligence
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                {["Applicant", "Source", "Quality Tier", "Score", "Value", "CRM Disposition"].map((h) => (
                  <th key={h} style={{ padding: "9px 14px", color: COLORS.textMuted, fontWeight: 600, textAlign: "left", fontSize: 11 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <LeadRow name="Jordan R." source="meta_cpc" tier="Qualified" score={85} value="$250" disposition="Retained" delay={fps * 2} />
              <LeadRow name="Marcus T." source="google_search" tier="Qualified" score={78} value="$250" disposition="Consult scheduled" delay={fps * 2 + 12} />
              <LeadRow name="Sarah B." source="meta_cpc" tier="Borderline" score={55} value="$100" disposition="Pending review" delay={fps * 2 + 24} />
              <LeadRow name="David K." source="direct" tier="Disqualified" score={20} value="$0" disposition="Auto-disqualified" delay={fps * 2 + 36} />
              <LeadRow name="Emma L." source="meta_cpc" tier="Qualified" score={91} value="$250" disposition="Retained" delay={fps * 2 + 48} />
            </tbody>
          </table>
        </div>
      </div>

      {/* Outro callout */}
      <div style={{
        position: "absolute", bottom: 48, left: 80, right: 80,
        opacity: interpolate(frame, [fps * 3, fps * 3.5], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        display: "flex", justifyContent: "center",
      }}>
        <div style={{
          backgroundColor: "rgba(59,130,246,0.1)",
          border: "1px solid rgba(59,130,246,0.3)",
          borderRadius: 10, padding: "16px 40px",
          textAlign: "center",
        }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: COLORS.text, marginBottom: 4 }}>
            Built live. Deployed live. Ready now.
          </div>
          <div style={{ fontSize: 14, color: COLORS.textMuted }}>
            LexHive — Graph-Driven Lead Intelligence for Social Security Disability Law
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
