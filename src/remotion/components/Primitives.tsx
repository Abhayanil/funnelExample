import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

export const COLORS = {
  bg: "#0B0F17",
  card: "#151C28",
  border: "#233044",
  blue: "#3B82F6",
  emerald: "#10B981",
  amber: "#F59E0B",
  rose: "#EF4444",
  text: "#F3F4F6",
  textMuted: "#9CA3AF",
};

export const Badge: React.FC<{ label: string; color?: string }> = ({
  label,
  color = COLORS.blue,
}) => (
  <span
    style={{
      padding: "6px 14px",
      fontSize: 14,
      fontWeight: 700,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      color,
      backgroundColor: color + "18",
      border: "1px solid " + color + "44",
      borderRadius: 9999,
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
    }}
  >
    <span
      style={{
        width: 6,
        height: 6,
        borderRadius: "50%",
        backgroundColor: color,
        boxShadow: "0 0 8px " + color,
      }}
    />
    {label}
  </span>
);

export const FeatureCard: React.FC<{
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  delay?: number;
  highlightColor?: string;
  style?: React.CSSProperties;
}> = ({ title, subtitle, children, delay = 0, highlightColor = COLORS.blue, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const entrance = spring({
    frame: frame - delay,
    fps,
    config: { damping: 14, mass: 0.8, stiffness: 100 },
  });

  const opacity = interpolate(entrance, [0, 1], [0, 1]);
  const scale = interpolate(entrance, [0, 1], [0.94, 1]);
  const translateY = interpolate(entrance, [0, 1], [24, 0]);

  return (
    <div
      style={{
        backgroundColor: COLORS.card,
        border: "1px solid " + COLORS.border,
        borderRadius: 16,
        padding: 24,
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 20px 40px -15px rgba(0,0,0,0.5)",
        opacity,
        transform: "translateY(" + translateY + "px) scale(" + scale + ")",
        ...style,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 20, color: COLORS.text, fontWeight: 700 }}>{title}</h3>
        {subtitle && <span style={{ fontSize: 13, color: highlightColor, fontWeight: 600 }}>{subtitle}</span>}
      </div>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
};

export const BrowserFrame: React.FC<{
  url?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ url = "https://funnel.lexhive.internal/qualification-v30", children, style }) => (
  <div
    style={{
      backgroundColor: COLORS.card,
      border: "1px solid " + COLORS.border,
      borderRadius: 18,
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      boxShadow: "0 25px 60px -15px rgba(0, 0, 0, 0.7)",
      ...style,
    }}
  >
    <div
      style={{
        height: 44,
        backgroundColor: "#0E131E",
        borderBottom: "1px solid " + COLORS.border,
        display: "flex",
        alignItems: "center",
        padding: "0 16px",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", gap: 6 }}>
        <div style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: "#EF4444" }} />
        <div style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: "#F59E0B" }} />
        <div style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: "#10B981" }} />
      </div>
      <div
        style={{
          flex: 1,
          height: 26,
          backgroundColor: "#151C28",
          borderRadius: 6,
          display: "flex",
          alignItems: "center",
          padding: "0 12px",
          fontSize: 12,
          color: COLORS.textMuted,
          fontFamily: "monospace",
          border: "1px solid " + COLORS.border,
        }}
      >
        {url}
      </div>
    </div>
    <div style={{ flex: 1, position: "relative" }}>{children}</div>
  </div>
);

export const CodeSnippet: React.FC<{ code: string; title?: string }> = ({ code, title }) => (
  <div
    style={{
      backgroundColor: "#080B11",
      border: "1px solid " + COLORS.border,
      borderRadius: 12,
      padding: 16,
      fontFamily: "monospace",
      fontSize: 13,
      lineHeight: 1.5,
      color: "#E5E7EB",
      overflow: "hidden",
    }}
  >
    {title && (
      <div style={{ color: COLORS.blue, fontSize: 11, marginBottom: 8, fontWeight: 700, textTransform: "uppercase" }}>
        {title}
      </div>
    )}
    <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{code}</pre>
  </div>
);
