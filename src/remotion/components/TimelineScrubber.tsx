import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { CHAPTERS, VIDEO_CONFIG } from "../types";
import { COLORS } from "./Primitives";

export const TimelineScrubber: React.FC = () => {
  const frame = useCurrentFrame();

  const progressPercent = interpolate(frame, [0, VIDEO_CONFIG.durationInFrames], [0, 100], {
    extrapolateRight: "clamp",
  });

  const activeChapter =
    CHAPTERS.slice().reverse().find((c) => frame >= c.startFrame) || CHAPTERS[0];

  const seconds = Math.floor(frame / VIDEO_CONFIG.fps);
  const minutes = Math.floor(seconds / 60);
  const remainderSeconds = seconds % 60;
  const timestamp = String(minutes) + ":" + (remainderSeconds < 10 ? "0" : "") + String(remainderSeconds);

  return (
    <div
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        height: 64,
        backgroundColor: "#090D14F0",
        backdropFilter: "blur(10px)",
        borderTop: "1px solid " + COLORS.border,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "0 32px",
        zIndex: 1000,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 13, fontWeight: 600 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ color: COLORS.blue, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Current Chapter:
          </span>
          <span style={{ color: COLORS.text }}>{activeChapter.title}</span>
        </div>
        <div style={{ color: COLORS.textMuted, fontFamily: "monospace" }}>
          {timestamp} / 3:00 ({frame} frames)
        </div>
      </div>

      <div
        style={{
          width: "100%",
          height: 6,
          backgroundColor: "#1E293B",
          borderRadius: 9999,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: progressPercent + "%",
            backgroundColor: COLORS.blue,
            boxShadow: "0 0 12px " + COLORS.blue,
          }}
        />
        {CHAPTERS.map((chapter) => {
          const mark = (chapter.startFrame / VIDEO_CONFIG.durationInFrames) * 100;
          return (
            <div
              key={chapter.id}
              style={{
                position: "absolute",
                left: mark + "%",
                top: 0,
                bottom: 0,
                width: 2,
                backgroundColor: "#334155",
              }}
            />
          );
        })}
      </div>
    </div>
  );
};
