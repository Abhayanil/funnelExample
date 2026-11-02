import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS } from "../components/Primitives";

interface FlowStep {
  label: string;
  sublabel: string;
  color: string;
  y: number;
}

const FLOW_STEPS: FlowStep[] = [
  { label: "Lead Submission", sublabel: "POST /api/leads", color: COLORS.blue, y: 80 },
  { label: "Supabase RPC", sublabel: "Atomic upsert_lead()", color: COLORS.emerald, y: 180 },
  { label: "Fallback Store", sublabel: "In-memory Map — instant", color: COLORS.amber, y: 280 },
  { label: "Retry Worker", sublabel: "Exp. backoff + jitter (5 attempts)", color: COLORS.amber, y: 380 },
  { label: "Dead Letter Queue", sublabel: "Full context — replayable", color: "#EF4444", y: 480 },
];

export const Scene5Resilience: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleOpacity = interpolate(frame, [0, 25], [0, 1], { extrapolateRight: "clamp" });

  // Retry counter animation
  const retryCount = Math.floor(
    interpolate(frame, [fps * 1.5, fps * 3], [0, 5], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    })
  );

  // Show "success" or "DLQ" path
  const showFailPath = frame > fps * 2.5;

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bg, fontFamily: "Inter, -apple-system, sans-serif" }}>
      <div style={{
        position: "absolute", inset: 0,
        background: "radial-gradient(ellipse at 80% 50%, rgba(245,158,11,0.05) 0%, transparent 60%)",
      }} />

      {/* Header */}
      <div style={{ position: "absolute", top: 60, left: 100, right: 100, opacity: titleOpacity }}>
        <div style={{ fontSize: 11, color: COLORS.amber, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
          Resilience & Dead Letter Queue
        </div>
        <div style={{ fontSize: 36, fontWeight: 900, color: COLORS.text, letterSpacing: "-0.02em" }}>
          Nothing Gets Lost. Ever.
        </div>
        <p style={{ fontSize: 18, color: COLORS.textMuted, margin: "12px 0 0", maxWidth: 720 }}>
          Five-attempt retry chain with exponential backoff, then automatic DLQ with full context for manual replay.
        </p>
      </div>

      {/* Left: Flow diagram */}
      <div style={{ position: "absolute", left: 100, top: 220, width: 440 }}>
        {FLOW_STEPS.map((step, i) => {
          const stepOpacity = interpolate(frame, [20 + i * 18, 45 + i * 18], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const isActive = i === 1; // Supabase = primary path
          const isFallback = i === 2 || i === 3 || i === 4;
          const showStep = !isFallback || showFailPath;

          return (
            <div key={step.label} style={{
              position: "absolute",
              top: step.y - 220,
              left: 0, right: 0,
              opacity: stepOpacity * (showStep ? 1 : 0.2),
            }}>
              {/* Connector line */}
              {i < FLOW_STEPS.length - 1 && (
                <div style={{
                  position: "absolute",
                  left: 21,
                  top: 44,
                  width: 2,
                  height: 96,
                  backgroundColor: isFallback ? `${COLORS.amber}50` : `${COLORS.border}`,
                  borderLeft: isFallback ? `2px dashed ${COLORS.amber}40` : `2px solid ${COLORS.border}`,
                }} />
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: "50%",
                  backgroundColor: `${step.color}22`,
                  border: `2px solid ${step.color}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 13, fontWeight: 800, color: step.color,
                  flexShrink: 0,
                }}>
                  {i + 1}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.text }}>{step.label}</div>
                  <div style={{ fontSize: 11, color: COLORS.textMuted }}>{step.sublabel}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Right: Retry counter visualization */}
      <div style={{
        position: "absolute",
        right: 100, top: 220, width: 480,
      }}>
        {/* Backoff intervals table */}
        <div style={{
          backgroundColor: "#0D1220",
          border: `1px solid ${COLORS.border}`,
          borderRadius: 12, padding: "20px",
          marginBottom: 20,
          opacity: interpolate(frame, [fps * 0.5, fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}>
          <div style={{ fontSize: 11, color: COLORS.textMuted, textTransform: "uppercase", marginBottom: 14 }}>
            Backoff Schedule (with jitter)
          </div>
          {[
            { attempt: 1, delay: "1s", jitter: "±0.3s", color: COLORS.emerald },
            { attempt: 2, delay: "2s", jitter: "±0.6s", color: COLORS.emerald },
            { attempt: 3, delay: "4s", jitter: "±1.2s", color: COLORS.amber },
            { attempt: 4, delay: "8s", jitter: "±2.4s", color: COLORS.amber },
            { attempt: 5, delay: "16s", jitter: "±4.8s", color: "#EF4444" },
          ].map((row, i) => {
            const active = retryCount >= i + 1;
            return (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "7px 0",
                borderBottom: i < 4 ? `1px solid ${COLORS.border}` : "none",
                opacity: active ? 1 : 0.35,
              }}>
                <div style={{
                  width: 8, height: 8, borderRadius: "50%",
                  backgroundColor: active ? row.color : COLORS.border,
                  flexShrink: 0,
                }} />
                <span style={{ color: COLORS.textMuted, fontSize: 12, width: 60 }}>Attempt {row.attempt}</span>
                <span style={{ color: COLORS.text, fontWeight: 700, fontSize: 12, width: 40 }}>{row.delay}</span>
                <span style={{ color: COLORS.textMuted, fontSize: 11 }}>+ {row.jitter} jitter</span>
                {active && (
                  <span style={{
                    marginLeft: "auto", fontSize: 10, fontWeight: 700,
                    color: row.color, backgroundColor: `${row.color}20`,
                    padding: "2px 8px", borderRadius: 4,
                  }}>
                    {i < 4 ? "RETRIED" : "→ DLQ"}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* DLQ entry */}
        <div style={{
          backgroundColor: "rgba(239,68,68,0.08)",
          border: "1px solid rgba(239,68,68,0.3)",
          borderRadius: 10, padding: "16px 20px",
          opacity: showFailPath
            ? interpolate(frame, [fps * 2.5, fps * 3], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
            : 0,
        }}>
          <div style={{ fontSize: 11, color: "#EF4444", fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>
            Dead Letter Queue Entry
          </div>
          <div style={{ fontFamily: "monospace", fontSize: 11, color: COLORS.textMuted, lineHeight: 1.6 }}>
            <div><span style={{ color: COLORS.text }}>leadId:</span> "a7f2b91c-4e8d..."</div>
            <div><span style={{ color: COLORS.text }}>attempts:</span> <span style={{ color: "#EF4444" }}>5</span></div>
            <div><span style={{ color: COLORS.text }}>lastError:</span> "Connection timeout"</div>
            <div><span style={{ color: COLORS.text }}>payload:</span> {"{"} ... full lead data ... {"}"}</div>
            <div><span style={{ color: COLORS.text }}>replayable:</span> <span style={{ color: COLORS.emerald }}>true</span></div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
