/**
 * Per-library progress reporter for stdout.
 * All output goes to stdout (Fetcher logging contract).
 */

function pad(index: number, total: number): string {
  const width = String(total).length;
  return String(index).padStart(width);
}

function prefix(index: number, total: number, libraryId: string): string {
  return `[${pad(index, total)}/${total}] ${libraryId}`;
}

export function reportStart(index: number, total: number, libraryId: string): void {
  process.stdout.write(`${prefix(index, total, libraryId)} ... fetching`);
}

export function reportDone(index: number, total: number, libraryId: string, chunkCount: number): void {
  console.log(`\r${prefix(index, total, libraryId)} ... done (${chunkCount} chunks)`);
}

export function reportFailed(index: number, total: number, libraryId: string, errorCode: string): void {
  console.log(`\r${prefix(index, total, libraryId)} ... FAILED (${errorCode}) -- skipped`);
}

export function reportSkipped(index: number, total: number, libraryId: string): void {
  console.log(`\r${prefix(index, total, libraryId)} ... skipped (unchanged)`);
}

export function formatDuration(durationMs: number): string {
  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

export function reportSummary(fetched: number, failed: number, skipped: number, durationMs: number): void {
  console.log(`Fetched: ${fetched} | Failed: ${failed} | Skipped (unchanged): ${skipped} | Duration: ${formatDuration(durationMs)}`);
}
