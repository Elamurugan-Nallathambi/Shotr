import type {
  ActionInput,
  BrowserName,
  CaptureMode,
  ImageType,
  WaitUntil,
} from '../config/schema.js';

export type Action = ActionInput;

/** A profile with its name attached and defaults applied. */
export interface ResolvedProfile {
  name: string;
  width: number;
  height: number;
  deviceScaleFactor: number;
  isMobile: boolean;
  hasTouch?: boolean;
  userAgent?: string;
}

export interface ResolvedCapture {
  mode: CaptureMode;
  /** Scroll the full page before capture so lazy-loaded content renders. */
  autoScroll: boolean;
  selector?: string;
  waitForSelector?: string;
  scrollTo?: number | string;
  delayMs?: number;
  type: ImageType;
  quality?: number;
}

export type Platform = 'macos' | 'windows' | 'linux';

export interface ResolvedHeader {
  enabled: boolean;
  height: number;
  /** Window-control style for the fake URL bar (macOS dots, Windows/Linux controls). */
  os: Platform;
  includeProjectName: boolean;
  includeEnvironment: boolean;
  includePageTitle: boolean;
  includeUrl: boolean;
  includeTimestamp: boolean;
  includeViewport: boolean;
  includeBrowser: boolean;
  includeUrlBar: boolean;
  includeUser: boolean;
  notes: string;
  background: string;
  textColor: string;
}

export interface ResolvedBackground {
  type: 'gradient' | 'solid';
  color: string;
  from: string;
  to: string;
  angle: number;
  colors?: string[];
}

/** "Floating" backdrop placed around the captured card (gradient + shadow). */
export interface ResolvedFrame {
  enabled: boolean;
  padding: number;
  radius: number;
  shadow: boolean;
  shadowBlur: number;
  shadowOpacity: number;
  background: ResolvedBackground;
}

export interface ResolvedAuth {
  enabled: boolean;
  storageState?: string;
  loginUrl?: string;
  loginScript: Action[];
}

/** A page with URL resolved and capture/wait settings merged from defaults. */
export interface ResolvedPage {
  id: string;
  title: string;
  url: string;
  fileName?: string;
  tags: string[];
  actions: Action[];
  capture: ResolvedCapture;
  waitUntil: WaitUntil;
  /** Optional per-page profile override (name must exist in profiles). */
  profile?: string;
}

export interface ResolvedConfig {
  projectName: string;
  environment: string;
  baseUrl?: string;
  profiles: Record<string, ResolvedProfile>;
  defaultProfile?: string;
  browser: BrowserName;
  header: ResolvedHeader;
  frame: ResolvedFrame;
  auth: ResolvedAuth;
  fileNamePattern: string;
  outputDir: string;
  timestampFormat: string;
  pages: ResolvedPage[];
}

/** Tokens available to fileNamePattern and header text. */
export interface NamingContext {
  projectName: string;
  environment: string;
  profile: string;
  pageId: string;
  title: string;
  date: string;
  timestamp: string;
  counter: string;
  browser: string;
}

export type CaptureStatus = 'success' | 'failed' | 'skipped';

export interface CaptureResult {
  pageId: string;
  title: string;
  url: string;
  profile: string;
  viewport: string;
  browser: string;
  filePath?: string;
  status: CaptureStatus;
  error?: string;
  startedAt: string;
  durationMs: number;
}

export interface RunManifest {
  projectName: string;
  environment: string;
  startedAt: string;
  finishedAt: string;
  outputDir: string;
  total: number;
  successful: number;
  failed: number;
  results: CaptureResult[];
}
