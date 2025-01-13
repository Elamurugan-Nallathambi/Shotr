import type { RunManifest } from '../core/types.js';

/** Render the end-of-run console summary (Spec §10). */
export function formatSummary(manifest: RunManifest): string {
  const lines = [
    'Screenshot Capture Completed',
    '',
    `Project: ${manifest.projectName}`,
    `Environment: ${manifest.environment}`,
    `Total Pages: ${manifest.total}`,
    `Successful Captures: ${manifest.successful}`,
    `Failed Captures: ${manifest.failed}`,
    `Output Folder: ${manifest.outputDir}`,
  ];
  if (manifest.failed > 0) {
    lines.push('', 'Failures:');
    for (const r of manifest.results.filter((x) => x.status === 'failed')) {
      lines.push(`  - [${r.profile}] ${r.pageId}: ${r.error ?? 'unknown error'}`);
    }
  }
  return lines.join('\n');
}
