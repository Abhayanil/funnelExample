import React from "react";
import { Easing, interpolate, useCurrentFrame } from "remotion";

interface CursorWaypoint {
  frame: number;
  x: number;
  y: number;
  click?: boolean;
}

interface AnimatedCursorProps {
  waypoints: CursorWaypoint[];
  size?: number;
}

export const AnimatedCursor: React.FC<AnimatedCursorProps> = ({
  waypoints,
  size = 24,
}) => {
  const frame = useCurrentFrame();

  if (waypoints.length === 0) return null;

  // Find which segment we are in
  let segIdx = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    if (frame >= waypoints[i].frame) segIdx = i;
  }

  const from = waypoints[segIdx];
  const to = waypoints[Math.min(segIdx + 1, waypoints.length - 1)];
  const segLen = Math.max(1, to.frame - from.frame);

  const t = interpolate(frame, [from.frame, to.frame], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.25, 0.46, 0.45, 0.94),
  });

  const cx = from.x + (to.x - from.x) * t;
  const cy = from.y + (to.y - from.y) * t;

  // Click ripple — detect if any waypoint with click=true is near current frame
  const clickWaypoints = waypoints.filter((w) => w.click);
  const activeClick = clickWaypoints.find(
    (w) => frame >= w.frame && frame <= w.frame + 20
  );
  const clickProgress = activeClick
    ? interpolate(frame, [activeClick.frame, activeClick.frame + 20], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 0;

  // Cursor scale — tiny press on click
  const cursorScale =
    activeClick && frame >= activeClick.frame && frame <= activeClick.frame + 8
      ? interpolate(frame, [activeClick.frame, activeClick.frame + 8], [1, 0.8], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      : 1;

  return (
    <div
      style={{
        position: "absolute",
        left: cx,
        top: cy,
        pointerEvents: "none",
        zIndex: 9999,
      }}
    >
      {/* Click ripple circle */}
      {activeClick && clickProgress > 0 && (
        <div
          style={{
            position: "absolute",
            left: -size,
            top: -size,
            width: size * 2,
            height: size * 2,
            borderRadius: "50%",
            border: "2px solid rgba(59,130,246,0.8)",
            transform: `scale(${interpolate(clickProgress, [0, 1], [0.5, 2.5])})`,
            opacity: interpolate(clickProgress, [0, 0.3, 1], [1, 1, 0]),
          }}
        />
      )}

      {/* Arrow cursor SVG */}
      <svg
        width={size}
        height={size * 1.3}
        viewBox="0 0 16 20"
        style={{
          transform: `scale(${cursorScale})`,
          filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.7))",
        }}
      >
        <path
          d="M0 0 L0 16 L4 12 L7.5 19 L9.5 18 L6 11 L11 11 Z"
          fill="white"
          stroke="rgba(0,0,0,0.6)"
          strokeWidth="1"
        />
      </svg>
    </div>
  );
};
