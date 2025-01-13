import type { CaptureResult, RunManifest } from '../core/types.js';

export interface ManifestMeta {
  projectName: string;
  environment: string;
  outputDir: string;
}

/** Build a run manifest from collected results, computing totals. */
export function finalizeManifest(
  meta: ManifestMeta,
  results: CaptureResult[],
  startedAt: Date,
  finishedAt: Date,
): RunManifest {
  return {
    projectName: meta.projectName,
    environment: meta.environment,
    outputDir: meta.outputDir,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    total: results.length,
    successful: results.filter((r) => r.status === 'success').length,
    failed: results.filter((r) => r.status === 'failed').length,
    results,
  };
}
