import { z } from 'zod';

/**
 * Input schemas validate the raw config file. Most fields are optional here;
 * concrete defaults are applied during resolution in `loader.ts`. This keeps
 * validation lenient and merge precedence (defaults < profile < page < CLI)
 * fully under our control in code.
 */

export const waitUntilSchema = z.enum(['load', 'domcontentloaded', 'networkidle', 'commit']);
export const captureModeSchema = z.enum(['viewport', 'fullPage', 'element']);
export const imageTypeSchema = z.enum(['png', 'jpeg']);
export const osSchema = z.enum(['macos', 'windows', 'linux', 'auto']);

export const browserSchema = z.enum([
  'chromium',
  'chrome',
  'edge',
  'msedge',
  'firefox',
  'webkit',
  'safari',
]);

export const profileInputSchema = z
  .object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    deviceScaleFactor: z.number().positive().optional(),
    isMobile: z.boolean().optional(),
    hasTouch: z.boolean().optional(),
    userAgent: z.string().optional(),
  })
  .strict();

export const captureInputSchema = z
  .object({
    mode: captureModeSchema.optional(),
    /** Convenience boolean: true → full-page (scrolled) capture, false → viewport. */
    fullPage: z.boolean().optional(),
    /** Scroll through the whole page before capture to trigger lazy-loaded content. */
    autoScroll: z.boolean().optional(),
    selector: z.string().optional(),
    waitForSelector: z.string().optional(),
    scrollTo: z.union([z.number(), z.string()]).optional(),
    delayMs: z.number().int().nonnegative().optional(),
    type: imageTypeSchema.optional(),
    quality: z.number().int().min(1).max(100).optional(),
  })
  .strict();

/** Each action is a single-key object, e.g. `{ click: "#btn" }`. */
export const actionInputSchema = z.union([
  z.object({ wait: z.number().int().nonnegative() }).strict(),
  z.object({ waitForSelector: z.string() }).strict(),
  z.object({ click: z.string() }).strict(),
  z
    .object({ fill: z.object({ selector: z.string(), value: z.string() }).strict() })
    .strict(),
  z
    .object({
      select: z
        .object({ selector: z.string(), value: z.union([z.string(), z.array(z.string())]) })
        .strict(),
    })
    .strict(),
  z.object({ scroll: z.union([z.number(), z.string()]) }).strict(),
  z.object({ hover: z.string() }).strict(),
  z.object({ press: z.string() }).strict(),
]);

export const headerInputSchema = z
  .object({
    enabled: z.boolean().optional(),
    height: z.number().int().positive().optional(),
    includeProjectName: z.boolean().optional(),
    includeEnvironment: z.boolean().optional(),
    includePageTitle: z.boolean().optional(),
    includeUrl: z.boolean().optional(),
    includeTimestamp: z.boolean().optional(),
    includeViewport: z.boolean().optional(),
    includeBrowser: z.boolean().optional(),
    includeUrlBar: z.boolean().optional(),
    includeUser: z.boolean().optional(),
    os: osSchema.optional(),
    notes: z.string().optional(),
    background: z.string().optional(),
    textColor: z.string().optional(),
  })
  .strict();

export const backgroundInputSchema = z
  .object({
    type: z.enum(['gradient', 'solid']).optional(),
    color: z.string().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    angle: z.number().optional(),
    colors: z.array(z.string()).min(2).optional(),
  })
  .strict();

export const frameInputSchema = z
  .object({
    enabled: z.boolean().optional(),
    padding: z.number().int().nonnegative().optional(),
    radius: z.number().int().nonnegative().optional(),
    shadow: z.boolean().optional(),
    shadowBlur: z.number().nonnegative().optional(),
    shadowOpacity: z.number().min(0).max(1).optional(),
    background: backgroundInputSchema.optional(),
  })
  .strict();

export const authInputSchema = z
  .object({
    enabled: z.boolean().optional(),
    storageState: z.string().optional(),
    loginUrl: z.string().optional(),
    loginScript: z.array(actionInputSchema).optional(),
  })
  .strict();

export const defaultsInputSchema = z
  .object({
    profile: z.string().optional(),
    browser: browserSchema.optional(),
    waitUntil: waitUntilSchema.optional(),
    capture: captureInputSchema.optional(),
    outputDir: z.string().optional(),
    timestampFormat: z.string().optional(),
  })
  .strict();

export const pageInputSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().optional(),
    path: z.string().optional(),
    url: z.string().url().optional(),
    fileName: z.string().optional(),
    tags: z.array(z.string()).optional(),
    actions: z.array(actionInputSchema).optional(),
    capture: captureInputSchema.optional(),
    profile: z.string().optional(),
    waitUntil: waitUntilSchema.optional(),
  })
  .strict()
  .refine((p) => p.path !== undefined || p.url !== undefined, {
    message: 'Each page must define either `path` (with a top-level baseUrl) or an absolute `url`.',
  });

export const configInputSchema = z
  .object({
    projectName: z.string().optional(),
    environment: z.string().optional(),
    baseUrl: z.string().url().optional(),
    profiles: z.record(z.string(), profileInputSchema).optional(),
    defaults: defaultsInputSchema.optional(),
    header: headerInputSchema.optional(),
    frame: frameInputSchema.optional(),
    auth: authInputSchema.optional(),
    fileNamePattern: z.string().optional(),
    pages: z.array(pageInputSchema).min(1),
  })
  .strict();

export type ConfigInput = z.infer<typeof configInputSchema>;
export type ProfileInput = z.infer<typeof profileInputSchema>;
export type CaptureInput = z.infer<typeof captureInputSchema>;
export type ActionInput = z.infer<typeof actionInputSchema>;
export type HeaderInput = z.infer<typeof headerInputSchema>;
export type PageInput = z.infer<typeof pageInputSchema>;
export type OsInput = z.infer<typeof osSchema>;
export type WaitUntil = z.infer<typeof waitUntilSchema>;
export type CaptureMode = z.infer<typeof captureModeSchema>;
export type ImageType = z.infer<typeof imageTypeSchema>;
export type BrowserName = z.infer<typeof browserSchema>;
