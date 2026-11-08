import { streamingRows } from './streaming';
import type { ImportRow, Proposal } from './types';

// Workers cannot clone row builder functions. Streaming rows have no choice-dependent builders;
// carry their complete proposals as data and restore the review interface on the UI thread.
export interface StreamingWire {
  source: string;
  notes?: string[];
  rows: Array<Omit<ImportRow, 'build'> & { proposals: Proposal[] }>;
}
export function streamingWire(texts: Record<string, string>, name: string): StreamingWire {
  const result = streamingRows(texts, name);
  return { ...result, rows: result.rows.map(({ build, ...row }) => ({ ...row, proposals: build() })) };
}
export function restoreStreaming(result: StreamingWire) {
  return { ...result, rows: result.rows.map(({ proposals, ...row }) => ({ ...row, build: () => proposals })) };
}
