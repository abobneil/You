// The .you.json file. Version 1 is plain JSON; encryption will be version 2.
import { normalize } from '../core/profile';
import type { Profile } from '../core/types';

export const FILE_EXT = '.you.json';

export function serialize(p: Profile, now = new Date().toISOString()): string {
  return JSON.stringify({ app: 'you', version: 1, savedAt: now, profile: p }, null, 2);
}

/** Reads our file format, or a bare profile object. Throws if it isn't You data. */
export function parse(text: string): Profile {
  const data = JSON.parse(text);
  const raw = data && data.app === 'you' ? data.profile : data;
  if (!raw || typeof raw.name !== 'string' || !raw.name) throw new Error('Not You data');
  return normalize(raw);
}

/** "Alex Kim" → "alex-kim.you.json" */
export function fileNameFor(name: string): string {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return (slug || 'you') + FILE_EXT;
}
