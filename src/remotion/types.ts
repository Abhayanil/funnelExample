export interface Chapter {
  id: string;
  title: string;
  startFrame: number;
  durationFrames: number;
}

export interface NarrationSegment {
  sceneId: string;
  startFrame: number;
  durationFrames: number;
  audioFileName?: string;
  text: string;
}

export const VIDEO_CONFIG = {
  fps: 30,
  width: 1920,
  height: 1080,
  durationInFrames: 5400,
};

export const CHAPTERS: Chapter[] = [
  { id: 'intro', title: '1. Architecture & Blueprint', startFrame: 0, durationFrames: 750 },
  { id: 'funnel', title: '2. Graph FSM & UX', startFrame: 750, durationFrames: 1050 },
  { id: 'qualifier', title: '3. SSA Qualification Engine', startFrame: 1800, durationFrames: 900 },
  { id: 'telemetry', title: '4. Dual CAPI & Closed Loop', startFrame: 2700, durationFrames: 900 },
  { id: 'resilience', title: '5. Resilience & DLQ', startFrame: 3600, durationFrames: 900 },
  { id: 'dashboard', title: '6. Intelligence Dashboard', startFrame: 4500, durationFrames: 900 },
];
