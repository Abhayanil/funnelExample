import React from "react";
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS } from "../components/Primitives";

const NODES = [
  { id: "Frontend", x: 200, y: 300, color: COLORS.blue },
  { id: "DAG Engine", x: 530, y: 150, color: COLORS.emerald },
  { id: "Qualifier", x: 530, y: 450, color: COLORS.amber },
  { id: "API Route", x: 860, y: 300, color: COLORS.blue },
  { id: "Supabase", x: 1190, y: 180, color: COLORS.emerald },
  { id: "Meta CAPI", x: 1190, y: 420, color: "#EC4899" },
  { id: "Dashboard", x: 1520, y: 300, color: COLORS.blue },
];

const EDGES = [
  [0, 1], [0, 2], [1, 3], [2, 3], [3, 4], [3, 5], [4, 6], [5, 6],
];

export const Scene1Intro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleOpacity = interpolate(frame, [0, fps * 0.7], [0, 1], {
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const titleY = interpolate(frame, [0, fps * 0.7], [30, 0], {
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  const subtitleOpacity = interpolate(frame, [fps * 0.5, fps * 1.2], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  // Dramatic stat counter: "70%" waste
  const statVal = interpolate(frame, [fps * 0.8, fps * 2], [0, 70], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const archOpacity = interpolate(frame, [fps * 2, fps * 2.5], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bg, fontFamily: "Inter, -apple-system, sans-serif" }}>
      {/* Dark gradient overlay */}
      <div style={{
        position: "absolute", inset: 0,
        background: "radial-gradient(ellipse at 20% 50%, rgba(59,130,246,0.08) 0%, transparent 60%)",
      }} />

      {/* Top section: hook */}
      <div style={{
        position: "absolute", top: 80, left: 100, right: 100,
        opacity: titleOpacity,
        transform: `translateY(${titleY}px)`,
      }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          backgroundColor: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.3)",
          borderRadius: 6, padding: "6px 14px", marginBottom: 24,
        }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: COLORS.emerald }} />
          <span style={{ color: COLORS.emerald, fontSize: 13, fontWeight: 600, letterSpacing: "0.05em" }}>
            LIVE DEMO — LEXHIVE DISABILITY FUNNEL
          </span>
        </div>

        <h1 style={{
          fontSize: 64, fontWeight: 900, color: COLORS.text,
          lineHeight: 1.05, margin: 0, letterSpacing: "-0.02em",
        }}>
          Eliminating the{" "}
          <span style={{ color: COLORS.blue }}>
            {Math.round(statVal)}%
          </span>
          <br />
          Ad Spend That Never Converts
        </h1>
      </div>

      {/* Subtitle */}
      <div style={{
        position: "absolute", top: 340, left: 100, right: 600,
        opacity: subtitleOpacity,
      }}>
        <p style={{ fontSize: 22, color: COLORS.textMuted, lineHeight: 1.6, margin: 0 }}>
          A 26-step SSA qualification engine that scores every applicant before
          a single dollar fires to Meta — built live in React, Next.js 16, and Supabase.
        </p>
      </div>

      {/* Architecture diagram */}
      <div style={{
        position: "absolute", bottom: 80, left: 60, right: 60, height: 260,
        opacity: archOpacity,
      }}>
        <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          System Architecture
        </div>
        <svg width="100%" height="200" viewBox="0 0 1720 200" style={{ overflow: "visible" }}>
          {/* Edges */}
          {EDGES.map(([from, to], i) => {
            const a = NODES[from];
            const b = NODES[to];
            const progress = interpolate(frame, [fps * 2.5 + i * 8, fps * 2.5 + i * 8 + 30], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            const ex = a.x + (b.x - a.x) * progress - 60;
            const ey = a.y + (b.y - a.y) * progress - 80;
            const sx = a.x - 60;
            const sy = a.y - 80;
            return (
              <line
                key={i}
                x1={sx} y1={sy} x2={ex} y2={ey}
                stroke="rgba(59,130,246,0.35)" strokeWidth="1.5"
                strokeDasharray="4 4"
              />
            );
          })}
          {/* Nodes */}
          {NODES.map((node, i) => {
            const nodeOpacity = interpolate(frame, [fps * 2.2 + i * 12, fps * 2.2 + i * 12 + 20], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            const nx = node.x - 60;
            const ny = node.y - 80;
            return (
              <g key={i} opacity={nodeOpacity}>
                <rect x={nx - 55} y={ny - 18} width={110} height={36} rx={8}
                  fill="#151C28" stroke={node.color} strokeWidth="1.5" />
                <text x={nx} y={ny + 5} textAnchor="middle" fill={node.color} fontSize="12" fontWeight="600">
                  {node.id}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Scanline texture overlay for cinematic feel */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)",
      }} />
    </AbsoluteFill>
  );
};
