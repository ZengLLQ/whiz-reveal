export interface Config {
  totalSamples: number;
  drawCount: number;
  noDuplicates: boolean;
}

export interface Presentation {
  scale: number;
  view: 'current' | 'history';
}

export interface DrawRecord {
  id: number;
  numbers: number[];
  /** Unix time in milliseconds. */
  createdAt: number;
}

export interface ActiveDraw {
  draw: DrawRecord;
  /** Unix time in milliseconds, shared by both windows. */
  startedAt: number;
  durationMs: number;
}

export interface Snapshot {
  revision: number;
  sessionId: string;
  config: Config;
  presentation: Presentation;
  /** Newest draw first; winners are committed before their animation starts. */
  history: DrawRecord[];
  activeDraw: ActiveDraw | null;
}
