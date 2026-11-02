import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS } from "../components/Primitives";

interface PacketProps {
  startFrame: number;
  color: string;
  label: string;
  value: string;
  fromX: number;
  toX: number;
  y: number;
}

const DataPacket: React.FC<PacketProps> = ({ startFrame, color, label, value, fromX, toX, y }) => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [startFrame, startFrame + 55], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const opacity = interpolate(frame, [startFrame, startFrame + 10, startFrame + 50, startFrame + 60], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const cx = fromX + (toX - fromX) * progress;

  return (
    <div style={{
      position: "absolute",
      left: cx,
      top: y,
      transform: "translate(-50%, -50%)",
      opacity,
    }}>
      <div style={{
        backgroundColor: `${color}22`,
        border: `1px solid ${color}`,
        borderRadius: 6,
        padding: "4px 10px",
        fontSize: 11,
        fontWeight: 700,
        color,
        whiteSpace: "nowrap",
      }}>
        {label}: {value}
      </div>
    </div>
  );
};

const NodeBox: React.FC<{
  title: string;
  subtitle: string;
  x: number;
  y: number;
  color: string;
  width?: number;
  delay: number;
}> = ({ title, subtitle, x, y, color, width = 160, delay }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [delay, delay + 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const translateY = interpolate(frame, [delay, delay + 20], [10, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div style={{
      position: "absolute",
      left: x,
      top: y,
      width,
      opacity,
      transform: `translateY(${translateY}px)`,
    }}>
      <div style={{
        backgroundColor: "#151C28",
        border: `1px solid ${color}`,
        borderRadius: 10,
        padding: "12px 14px",
        boxShadow: `0 0 20px ${color}20`,
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color, marginBottom: 2 }}>{title}</div>
        <div style={{ fontSize: 10, color: COLORS.textMuted }}>{subtitle}</div>
      </div>
    </div>
  );
};

export const Scene4Telemetry: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleOpacity = interpolate(frame, [0, 25], [0, 1], { extrapolateRight: "clamp" });

  // Deduplication UUID reveal
  const uuidProgress = interpolate(frame, [fps * 0.5, fps * 1.5], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const uuid = "a7f2b91c-4e8d-4329-b6f0-c3d2e5f1a048";
  const visibleUuid = uuid.slice(0, Math.round(uuid.length * uuidProgress));

  // Value counter animates
  const leadValue = interpolate(frame, [fps * 1.2, fps * 2], [0, 250], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bg, fontFamily: "Inter, -apple-system, sans-serif" }}>
      {/* Background grid */}
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: `linear-gradient(${COLORS.border}18 1px, transparent 1px), linear-gradient(90deg, ${COLORS.border}18 1px, transparent 1px)`,
        backgroundSize: "60px 60px",
      }} />

      {/* Header */}
      <div style={{
        position: "absolute", top: 60, left: 80,
        opacity: titleOpacity,
      }}>
        <div style={{ fontSize: 11, color: COLORS.blue, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
          Dual-Layer CAPI & Deduplication
        </div>
        <div style={{ fontSize: 32, fontWeight: 900, color: COLORS.text, letterSpacing: "-0.02em" }}>
          One Signal. Zero Duplicates. Full Coverage.
        </div>
      </div>

      {/* UUID display */}
      <div style={{
        position: "absolute", top: 175, left: 80,
        opacity: interpolate(frame, [fps * 0.3, fps * 0.7], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
      }}>
        <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 6, textTransform: "uppercase" }}>
          Shared Event ID (deterministic UUID)
        </div>
        <div style={{
          fontFamily: "monospace", fontSize: 14,
          color: COLORS.blue,
          backgroundColor: "rgba(59,130,246,0.08)",
          border: "1px solid rgba(59,130,246,0.3)",
          borderRadius: 6, padding: "8px 16px",
        }}>
          {visibleUuid}
          <span style={{ opacity: uuidProgress < 1 ? 1 : 0, color: COLORS.blue }}>|</span>
        </div>
      </div>

      {/* Architecture diagram */}
      <div style={{ position: "absolute", top: 270, left: 80, right: 80, height: 460 }}>
        {/* Left: Browser */}
        <NodeBox title="Browser" subtitle="Client-side pixel" x={60} y={100} color={COLORS.blue} delay={10} />
        {/* Center: Lead Submit API */}
        <NodeBox title="Lead Submit API" subtitle="/api/leads route" x={420} y={60} color={COLORS.emerald} width={175} delay={25} />
        <NodeBox title="SSA Qualifier" subtitle="Score computation" x={420} y={190} color={COLORS.amber} width={175} delay={35} />
        {/* Right: Meta */}
        <NodeBox title="Meta CAPI" subtitle="Server-side event" x={800} y={60} color="#EC4899" delay={40} />
        <NodeBox title="Browser Pixel" subtitle="fbq('track')" x={800} y={190} color={COLORS.blue} delay={45} />
        {/* Far right: Meta dedup */}
        <NodeBox title="Meta Algorithm" subtitle="Deduplicates on event_id" x={1120} y={120} color={COLORS.emerald} width={190} delay={60} />
        {/* Value display */}
        <div style={{
          position: "absolute", right: 0, top: 280,
          opacity: interpolate(frame, [fps * 1.0, fps * 1.3], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}>
          <div style={{ fontSize: 11, color: COLORS.textMuted, textTransform: "uppercase", marginBottom: 6 }}>
            Synthetic Value Sent to Meta
          </div>
          <div style={{ fontSize: 56, fontWeight: 900, color: COLORS.emerald }}>
            ${Math.round(leadValue)}
          </div>
          <div style={{ fontSize: 13, color: COLORS.textMuted }}>USD — QualifiedLead event value</div>
        </div>

        {/* Connector arrows as SVG */}
        <svg
          style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
          width="100%" height="100%"
          viewBox="0 0 1350 460"
        >
          {/* Browser → API */}
          <path d="M 220 130 L 420 90" stroke={COLORS.blue} strokeWidth="1.5" strokeDasharray="5 4" fill="none" opacity={0.5} />
          {/* API → Meta CAPI */}
          <path d="M 595 90 L 800 90" stroke={COLORS.emerald} strokeWidth="1.5" strokeDasharray="5 4" fill="none" opacity={0.5} />
          {/* Browser → Pixel */}
          <path d="M 220 150 L 800 220" stroke={COLORS.blue} strokeWidth="1.5" strokeDasharray="5 4" fill="none" opacity={0.5} />
          {/* CAPI → Meta Alg */}
          <path d="M 960 90 L 1120 150" stroke="#EC4899" strokeWidth="1.5" strokeDasharray="5 4" fill="none" opacity={0.5} />
          {/* Pixel → Meta Alg */}
          <path d="M 960 220 L 1120 165" stroke={COLORS.blue} strokeWidth="1.5" strokeDasharray="5 4" fill="none" opacity={0.5} />
        </svg>

        {/* Animated data packets */}
        <DataPacket startFrame={80} color={COLORS.blue} label="fbq Lead" value={`$${Math.round(leadValue)}`} fromX={220} toX={800} y={220} />
        <DataPacket startFrame={140} color="#EC4899" label="CAPI Lead" value={`$${Math.round(leadValue)}`} fromX={595} toX={800} y={90} />
        <DataPacket startFrame={220} color={COLORS.emerald} label="QualifiedLead" value="$250" fromX={595} toX={800} y={90} />
        <DataPacket startFrame={300} color={COLORS.emerald} label="Deduped → 1 signal" value="✓" fromX={960} toX={1120} y={150} />

        {/* Dedup badge */}
        <div style={{
          position: "absolute", left: 1000, top: 330,
          opacity: interpolate(frame, [fps * 2.5, fps * 3], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}>
          <div style={{
            backgroundColor: "rgba(16,185,129,0.12)",
            border: "1px solid rgba(16,185,129,0.4)",
            borderRadius: 8, padding: "10px 16px",
          }}>
            <div style={{ fontSize: 12, color: COLORS.emerald, fontWeight: 700, marginBottom: 4 }}>
              100% Deduplication
            </div>
            <div style={{ fontSize: 11, color: COLORS.textMuted, lineHeight: 1.4 }}>
              Shared event_id = same UUID<br />
              Meta sees exactly ONE signal
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
