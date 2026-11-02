import React from "react";
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

interface VirtualCameraProps {
  children: React.ReactNode;
  /** Frame to start the zoom */
  zoomStart?: number;
  /** Frame to finish the zoom */
  zoomEnd?: number;
  /** Scale to reach at zoomEnd (1 = no zoom) */
  targetScale?: number;
  /** X origin of scale (0–100%) default 50 */
  originX?: number;
  /** Y origin of scale (0–100%) default 50 */
  originY?: number;
  /** Horizontal pan in px at zoomEnd */
  panX?: number;
  /** Vertical pan in px at zoomEnd */
  panY?: number;
}

export const VirtualCamera: React.FC<VirtualCameraProps> = ({
  children,
  zoomStart = 0,
  zoomEnd = 60,
  targetScale = 1.6,
  originX = 50,
  originY = 50,
  panX = 0,
  panY = 0,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Zoom in during [zoomStart, zoomEnd], hold, then subtle drift out
  const holdEnd = Math.max(zoomEnd, durationInFrames - 40);
  const scaleOut = 40;

  const scale = interpolate(
    frame,
    [zoomStart, zoomEnd, holdEnd, holdEnd + scaleOut],
    [1, targetScale, targetScale, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    }
  );

  const tx = interpolate(
    frame,
    [zoomStart, zoomEnd, holdEnd, holdEnd + scaleOut],
    [0, panX, panX, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    }
  );

  const ty = interpolate(
    frame,
    [zoomStart, zoomEnd, holdEnd, holdEnd + scaleOut],
    [0, panY, panY, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    }
  );

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          transformOrigin: `${originX}% ${originY}%`,
          transform: `scale(${scale}) translate(${tx}px, ${ty}px)`,
        }}
      >
        {children}
      </div>
    </div>
  );
};
