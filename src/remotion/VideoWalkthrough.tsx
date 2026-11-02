import React from "react";
import { Audio, Composition, Series, staticFile } from "remotion";
import { TimelineScrubber } from "./components/TimelineScrubber";
import { Scene1Intro } from "./scenes/Scene1Intro";
import { Scene2Funnel } from "./scenes/Scene2Funnel";
import { Scene3Qualifier } from "./scenes/Scene3Qualifier";
import { Scene4Telemetry } from "./scenes/Scene4Telemetry";
import { Scene5Resilience } from "./scenes/Scene5Resilience";
import { Scene6Dashboard } from "./scenes/Scene6Dashboard";
import { VIDEO_CONFIG } from "./types";

export const VideoWalkthrough: React.FC = () => {
  return (
    <div
      style={{
        flex: 1,
        backgroundColor: "#0B0F17",
        fontFamily: "Inter, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif",
        position: "relative",
        overflow: "hidden",
        width: VIDEO_CONFIG.width,
        height: VIDEO_CONFIG.height,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Series>
        {/* Scene 1: 0 - 750 (0:00 - 0:25) */}
        <Series.Sequence durationInFrames={750}>
          <Audio src={staticFile("audio/scene1.wav")} />
          <Scene1Intro />
        </Series.Sequence>

        {/* Scene 2: 750 - 1800 (0:25 - 1:00) */}
        <Series.Sequence durationInFrames={1050}>
          <Audio src={staticFile("audio/scene2.wav")} />
          <Scene2Funnel />
        </Series.Sequence>

        {/* Scene 3: 1800 - 2700 (1:00 - 1:30) */}
        <Series.Sequence durationInFrames={900}>
          <Audio src={staticFile("audio/scene3.wav")} />
          <Scene3Qualifier />
        </Series.Sequence>

        {/* Scene 4: 2700 - 3600 (1:30 - 2:00) */}
        <Series.Sequence durationInFrames={900}>
          <Audio src={staticFile("audio/scene4.wav")} />
          <Scene4Telemetry />
        </Series.Sequence>

        {/* Scene 5: 3600 - 4500 (2:00 - 2:30) */}
        <Series.Sequence durationInFrames={900}>
          <Audio src={staticFile("audio/scene5.wav")} />
          <Scene5Resilience />
        </Series.Sequence>

        {/* Scene 6: 4500 - 5400 (2:30 - 3:00) */}
        <Series.Sequence durationInFrames={900}>
          <Audio src={staticFile("audio/scene6.wav")} />
          <Scene6Dashboard />
        </Series.Sequence>
      </Series>

      <TimelineScrubber />
    </div>
  );
};

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="LexHiveWalkthrough"
      component={VideoWalkthrough}
      durationInFrames={VIDEO_CONFIG.durationInFrames}
      fps={VIDEO_CONFIG.fps}
      width={VIDEO_CONFIG.width}
      height={VIDEO_CONFIG.height}
    />
  );
};
