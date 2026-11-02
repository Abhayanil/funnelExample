import React from "react";
import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { AnimatedCursor } from "../components/AnimatedCursor";
import { VirtualCamera } from "../components/VirtualCamera";
import { COLORS } from "../components/Primitives";

// Which funnel screenshots to show and when
const SHOTS = [
  { file: "funnel_shots/01_start.png", startFrame: 0, label: "Step 1 of 26 — Landing" },
  { file: "funnel_shots/02_receiving_ben.png", startFrame: 80, label: "Receiving Benefits?" },
  { file: "funnel_shots/03_page_sm72h5.png", startFrame: 160, label: "Current Work Hours" },
  { file: "funnel_shots/04_lastworked.png", startFrame: 240, label: "Last Worked Date" },
  { file: "funnel_shots/05_fiveyearwork.png", startFrame: 320, label: "5-Year Work History" },
  { file: "funnel_shots/07_outofwork.png", startFrame: 400, label: "Out-of-Work Duration" },
  { file: "funnel_shots/08_visit.png", startFrame: 490, label: "Doctor Visits" },
  { file: "funnel_shots/11_attorney.png", startFrame: 570, label: "Attorney Representation" },
  { file: "funnel_shots/24_email.png", startFrame: 650, label: "Micro-commitment: Email" },
  { file: "funnel_shots/25_contact.png", startFrame: 730, label: "Full Contact Details" },
  { file: "funnel_shots/26_result.png", startFrame: 790, label: "Qualification Result" },
];

// Cursor waypoints matching shot transitions
const CURSOR_WAYPOINTS = [
  { frame: 0, x: 920, y: 600 },
  { frame: 60, x: 920, y: 680, click: true },
  { frame: 80, x: 920, y: 600 },
  { frame: 140, x: 920, y: 560, click: true },
  { frame: 160, x: 900, y: 610 },
  { frame: 220, x: 900, y: 690, click: true },
  { frame: 240, x: 910, y: 620 },
  { frame: 300, x: 910, y: 650, click: true },
  { frame: 320, x: 920, y: 600 },
  { frame: 380, x: 920, y: 640, click: true },
  { frame: 400, x: 900, y: 600 },
  { frame: 460, x: 900, y: 670, click: true },
  { frame: 490, x: 920, y: 600 },
  { frame: 550, x: 920, y: 655, click: true },
  { frame: 570, x: 910, y: 620 },
  { frame: 630, x: 910, y: 670, click: true },
  { frame: 650, x: 900, y: 600 },
  { frame: 710, x: 900, y: 700, click: true },
  { frame: 730, x: 910, y: 610 },
  { frame: 770, x: 1000, y: 760, click: true },
  { frame: 810, x: 920, y: 600 },
];

export const Scene2Funnel: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Which shot is currently visible
  let currentShot = SHOTS[0];
  let nextShot = SHOTS[1];
  for (let i = SHOTS.length - 1; i >= 0; i--) {
    if (frame >= SHOTS[i].startFrame) {
      currentShot = SHOTS[i];
      nextShot = SHOTS[Math.min(i + 1, SHOTS.length - 1)];
      break;
    }
  }

  // Cross-dissolve between shots (15 frame dissolve)
  const transitionStart = nextShot.startFrame - 10;
  const dissolve = interpolate(frame, [transitionStart, nextShot.startFrame], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  // Progress through funnel
  const shotIndex = SHOTS.indexOf(currentShot);
  const progressPct = (shotIndex / (SHOTS.length - 1)) * 100;

  // Dijkstra label – count down remaining steps
  const stepsRemaining = Math.max(1, 26 - shotIndex * 2);

  // Title slide-in
  const titleOpacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bg, fontFamily: "Inter, -apple-system, sans-serif" }}>
      {/* Left info panel */}
      <div style={{
        position: "absolute", left: 0, top: 0, bottom: 0, width: 340,
        backgroundColor: "#0D1220",
        borderRight: `1px solid ${COLORS.border}`,
        padding: "50px 30px",
        display: "flex", flexDirection: "column", gap: 24,
        opacity: titleOpacity,
      }}>
        <div>
          <div style={{
            fontSize: 11, color: COLORS.blue, fontWeight: 700,
            letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8,
          }}>
            Live Funnel Walkthrough
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: COLORS.text, lineHeight: 1.2 }}>
            26-Step SSA<br />Qualification Flow
          </div>
        </div>

        {/* Progress */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12, color: COLORS.textMuted }}>
            <span>Dijkstra Progress</span>
            <span style={{ color: COLORS.blue, fontWeight: 700 }}>{Math.round(progressPct)}%</span>
          </div>
          <div style={{ width: "100%", height: 6, backgroundColor: "#1E293B", borderRadius: 999 }}>
            <div style={{
              width: `${progressPct}%`, height: "100%",
              backgroundColor: COLORS.blue, borderRadius: 999,
              boxShadow: `0 0 12px ${COLORS.blue}60`,
            }} />
          </div>
          <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 6 }}>
            ~{stepsRemaining} nodes remaining on shortest path
          </div>
        </div>

        {/* Current page label */}
        <div style={{
          backgroundColor: "#151C28",
          border: `1px solid ${COLORS.border}`,
          borderRadius: 10, padding: "14px 16px",
        }}>
          <div style={{ fontSize: 10, color: COLORS.textMuted, textTransform: "uppercase", marginBottom: 4 }}>
            Current Screen
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.text }}>
            {currentShot.label}
          </div>
        </div>

        {/* Key insight callouts */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: "auto" }}>
          {[
            { label: "Hard Disqualifiers", value: "4 rules", color: "#EF4444" },
            { label: "Scoring Signals", value: "12 factors", color: COLORS.amber },
            { label: "SSA Rubric", value: "Deterministic", color: COLORS.emerald },
          ].map((item) => (
            <div key={item.label} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "8px 12px",
              backgroundColor: "#111827", borderRadius: 8,
              border: `1px solid ${COLORS.border}`,
            }}>
              <span style={{ fontSize: 12, color: COLORS.textMuted }}>{item.label}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: item.color }}>{item.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Main screenshot area */}
      <div style={{
        position: "absolute", left: 340, right: 0, top: 0, bottom: 0,
        overflow: "hidden",
      }}>
        <VirtualCamera
          zoomStart={30}
          zoomEnd={120}
          targetScale={1.12}
          originX={50}
          originY={45}
        >
          {/* Current shot */}
          <Img
            src={staticFile(currentShot.file)}
            style={{
              position: "absolute", inset: 0,
              width: "100%", height: "100%",
              objectFit: "cover", objectPosition: "top center",
              opacity: 1 - dissolve,
            }}
          />
          {/* Next shot — cross dissolves in */}
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
          {/* Animated cursor overlay */}
          <AnimatedCursor waypoints={CURSOR_WAYPOINTS} size={28} />
        </VirtualCamera>

        {/* Top browser chrome bar */}
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 44,
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
            lexhive-poc.vercel.app/funnel
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
