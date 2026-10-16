export interface PlaygroundBand {
  id: string;
  name: string;
  classes: readonly number[];
  feel: string;
}

export interface PlaygroundPage {
  band: string;
  title: string;
  blurb: string | null;
  path: string;
}

export interface PlaygroundThread {
  id: string;
  name: string;
  subject: string | null;
  tagline: string | null;
  pages: readonly PlaygroundPage[];
}

export interface PlaygroundTool {
  id: string;
  title: string;
  path: string;
  kind: string;
  subjects: readonly string[];
  classes: readonly number[];
  description: string | null;
}

export interface PlaygroundManifest {
  hub: string;
  bands: readonly PlaygroundBand[];
  threads: readonly PlaygroundThread[];
  tools: readonly PlaygroundTool[];
}

export type PlaygroundView = 'threads' | 'tools';

export type PlaygroundSpot =
  | { kind: 'hub' }
  | { kind: 'thread'; threadId: string; band: string }
  | { kind: 'tool'; toolId: string };
