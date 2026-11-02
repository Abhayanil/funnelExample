import React from "react";
import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { AnimatedCursor } from "../components/AnimatedCursor";
import { VirtualCamera } from "../components/VirtualCamera";
import { COLORS } from "../components/Primitives";

// Show final capture screens + result page with score overlay
const SHOTS = [
  { file: "funnel_shots/23_conditionstart.png", startFrame: 0 },
  { file: "funnel_shots/24_email.png", startFrame: 100 },
  { file: "funnel_shots/25_contact.png", startFrame: 240 },
  { file: "funnel_shots/26_result.png", startFrame: 380 },
];

const CURSOR_WAYPOINTS = [
  { frame: 0, x: 700, y: 500 },
  { frame: 70, x: 700, y: 580, click: true },
  { frame: 100, x: 700, y: 520 },
  { frame: 200, x: 700, y: 620, click: true },
  { frame: 240, x: 750, y: 540 },
  { frame: 360, x: 900, y: 720, click: true },
  { frame: 380, x: 880, y: 600 },
  { frame: 600, x: 880, y: 600 },
];

// Score gauge animated component
const ScoreGauge: React.FC<{ score: number; tier: string; value: string; frame: number; startFrame: number }> = ({
  score, tier, value, frame, startFrame,
}) => {
  const { fps } = useVideoConfig() as { fps: number; durationInFrames: number; width: number; height: number };
  const animScore = interpolate(frame, [startFrame, startFrame + fps * 1.5], [0, score], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const opacity = interpolate(frame, [startFrame, startFrame + 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const tierColor = tier === "QUALIFIED" ? COLORS.emerald : tier === "BORDERLINE" ? COLORS.amber : "#EF4444";

  return (
    <div style={{ opacity, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      <div style={{ fontSize: 11, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.08em" }}>
        SSA Score
      </div>
      {/* Circular gauge */}
      <svg width={120} height={120} viewBox="0 0 120 120">
        <circle cx={60} cy={60} r={50} fill="none" stroke="#1E293B" strokeWidth={10} />
        <circle
          cx={60} cy={60} r={50}
          fill="none"
          stroke={tierColor}
          strokeWidth={10}
          strokeDasharray={`${(animScore / 100) * 314} 314`}
          strokeLinecap="round"
          transform="rotate(-90 60 60)"
        />
        <text x={60} y={55} textAnchor="middle" fill={COLORS.text} fontSize={26} fontWeight={800}>
          {Math.round(animScore)}
        </text>
        <text x={60} y={72} textAnchor="middle" fill={COLORS.textMuted} fontSize={10}>
          / 100
        </text>
      </svg>
      <div style={{
        padding: "6px 16px", borderRadius: 6,
        backgroundColor: `${tierColor}22`, border: `1px solid ${tierColor}66`,
        color: tierColor, fontWeight: 800, fontSize: 14,
      }}>
        {tier}
      </div>
      <div style={{ fontSize: 13, color: COLORS.textMuted }}>
        Meta Value: <strong style={{ color: tierColor }}>{value}</strong>
      </div>
    </div>
  );
};

export const Scene3Qualifier: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  let currentShot = SHOTS[0];
  for (let i = SHOTS.length - 1; i >= 0; i--) {
    if (frame >= SHOTS[i].startFrame) { currentShot = SHOTS[i]; break; }
  }

  const nextShotIdx = Math.min(SHOTS.indexOf(currentShot) + 1, SHOTS.length - 1);
  const nextShot = SHOTS[nextShotIdx];
  const transStart = nextShot.startFrame - 10;
  const dissolve = interpolate(frame, [transStart, nextShot.startFrame], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Tier breakdown visible after screenshot 3
  const rulesOpacity = interpolate(frame, [40, 80], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const showGauge = frame >= 380;

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bg, fontFamily: "Inter, -apple-system, sans-serif" }}>
      {/* Left panel */}
      <div style={{
        position: "absolute", left: 0, top: 0, bottom: 0, width: 360,
        backgroundColor: "#0D1220",
        borderRight: `1px solid ${COLORS.border}`,
        padding: "50px 28px",
        display: "flex", flexDirection: "column", gap: 20,
      }}>
        <div>
          <div style={{ fontSize: 11, color: COLORS.emerald, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
            SSA Qualification Engine
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: COLORS.text, lineHeight: 1.25 }}>
            5-Factor Rubric<br />Real-Time Scoring
          </div>
        </div>

        <div style={{ opacity: rulesOpacity, display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            { rule: "Substantial Gainful Activity", status: "Pass", color: COLORS.emerald, detail: "≤20 hrs/wk" },
            { rule: "Work History (5-yr)", status: "Pass", color: COLORS.emerald, detail: "≥2 years" },
            { rule: "Medical Evidence", status: "Pass", color: COLORS.emerald, detail: "Doctor certified" },
            { rule: "Age Grid Weight", status: "Pass", color: COLORS.emerald, detail: "+15 pts" },
            { rule: "Representation", status: "Clear", color: COLORS.emerald, detail: "No attorney" },
          ].map((item, i) => {
            const itemOpacity = interpolate(frame, [50 + i * 15, 80 + i * 15], [0, 1], {
              extrapolateLeft: "clamp", extrapolateRight: "clamp",
            });
            return (
              <div key={item.rule} style={{
                opacity: itemOpacity,
                padding: "8px 12px",
                backgroundColor: "#111827",
                border: `1px solid ${COLORS.border}`,
                borderRadius: 8,
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.text }}>{item.rule}</div>
                  <div style={{ fontSize: 10, color: COLORS.textMuted }}>{item.detail}</div>
                </div>
                <div style={{
                  fontSize: 10, fontWeight: 700, color: item.color,
                  backgroundColor: `${item.color}22`, padding: "2px 8px", borderRadius: 4,
                }}>
                  {item.status}
                </div>
              </div>
            );
          })}
        </div>

        {showGauge && (
          <div style={{ marginTop: "auto" }}>
            <ScoreGauge score={85} tier="QUALIFIED" value="$250 USD" frame={frame} startFrame={390} />
          </div>
        )}
      </div>

      {/* Main screenshot area */}
      <div style={{ position: "absolute", left: 360, right: 0, top: 0, bottom: 0, overflow: "hidden" }}>
        <VirtualCamera
          zoomStart={260}
          zoomEnd={360}
          targetScale={1.25}
          originX={50}
          originY={60}
        >
          <Img
            src={staticFile(currentShot.file)}
            style={{
              position: "absolute", inset: 0,
              width: "100%", height: "100%",
              objectFit: "cover", objectPosition: "top center",
              opacity: 1 - dissolve,
            }}
          />
          {nextShot !== currentShot && (
            <Img
              src={staticFile(nextShot.file)}
              style={{
                position: "absolute", inset: 0,
                width: "100%", height: "100%",
                objectFit: "cover", objectPosition: "top center",
                opacity: dissolve,
              }}
            />
          )}
          <AnimatedCursor waypoints={CURSOR_WAYPOINTS} size={26} />
        </VirtualCamera>

        {/* Browser chrome */}
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 40,
          backgroundColor: "#0D1220",
          borderBottom: `1px solid ${COLORS.border}`,
          display: "flex", alignItems: "center", gap: 8, padding: "0 16px",
        }}>
          <div style={{ display: "flex", gap: 6 }}>
            {["#EF4444", "#F59E0B", "#10B981"].map((c) => (
              <div key={c} style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: c }} />
            ))}
          </div>
          <div style={{
            flex: 1, maxWidth: 400, margin: "0 auto",
            backgroundColor: "#151C28", borderRadius: 6,
            padding: "4px 12px", fontSize: 11, color: COLORS.textMuted,
            textAlign: "center",
          }}>
            lexhive-poc.vercel.app/funnel — qualification in progress
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
