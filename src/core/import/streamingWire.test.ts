import { expect, it, vi } from 'vitest';
import { streamingRows } from './streaming';
import { restoreStreaming, streamingWire } from './streamingWire';

it('carries every streaming proposal and note through the worker clone boundary', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-08T12:00:00Z'));
  const texts = { 'StreamingHistory_music_0.json': JSON.stringify(Array.from({ length: 6 }, () => ({ endTime: '2024-01-01 12:00', artistName: 'Artist', trackName: 'Song', msPlayed: 180000 }))) };
  const expected = streamingRows(texts, 'Alex');
  expect(expected.rows.length).toBeGreaterThan(0);
  const actual = restoreStreaming(structuredClone(streamingWire(texts, 'Alex')));
  expect(actual.rows.map(({ id, ...r }) => ({ ...r, build: r.build() }))).toEqual(expected.rows.map(({ id, ...r }) => ({ ...r, build: r.build() })));
  expect(actual.notes).toEqual(expected.notes);
  vi.useRealTimers();
});

