// What you've watched and listened to, from the history files streaming services let you download:
// Netflix (viewing activity), Spotify (account data or extended streaming history), Apple Music
// (privacy.apple.com) and YouTube Music (Google Takeout). None of them need an app registration.
//
// A life record wants "I watched The Crown in 2021" and "Radiohead was my most played artist",
// not one card per play. So plays are rolled up: one card per movie, show, artist or podcast,
// dated from the first play, with counts and the last play as details. Every card remembers where
// it came from, so importing a newer export refreshes the counts instead of adding duplicates.
import { unzipSync } from 'fflate';
import type { FuzzyDate } from '../types';
import { col, csvObjects, looseDate, rowId } from './parse';
import type { ImportResult, ImportRow, Proposal } from './types';

export type Service = 'Netflix' | 'Spotify' | 'Apple Music' | 'YouTube Music';
type What = 'show' | 'movie' | 'artist' | 'podcast';

/** One play, as each file describes it. */
interface Play {
  service: Service;
  what: What;
  name: string;
  /** The episode or song, used to count distinct episodes. */
  item?: string;
  day: FuzzyDate;
  ms?: number;
  count?: number;
  profile?: string;
}

/** Everything played of one movie, show, artist or podcast. */
interface Tally {
  service: Service;
  what: What;
  name: string;
  profile?: string;
  first: string;
  last: string;
  plays: number;
  ms: number;
  items: Set<string>;
}

const obj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);
const norm = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

// ---------- reading each service's files ----------

/** Netflix's "0:42:10" durations. */
function hms(s: string): number {
  const p = s.split(':').map(Number);
  if (p.some(n => !Number.isFinite(n))) return 0;
  return p.reduce((t, n) => t * 60 + n, 0) * 1000;
}

const EPISODE_MARK = /: (?:Season|Series|Part|Volume|Vol\.|Chapter|Book|Collection|Limited Series|Miniseries|Episode)\b|\(Episode \d+\)/i;

/**
 * Netflix titles episodes "Show: Season 1: Episode". Anything with a season-like marker, or with
 * two or more colons, is an episode of the show named before it; anything else is a movie
 * ("Glass Onion: A Knives Out Mystery" has one colon and stays a movie).
 */
export function netflixTitle(title: string): { what: 'show' | 'movie'; name: string; item?: string } {
  const t = title.trim();
  const mark = t.match(EPISODE_MARK);
  if (mark && mark.index! > 0) {
    let name = t.slice(0, mark.index).trim();
    // "Stranger Things: Stranger Things 2: Chapter One" → the show is "Stranger Things".
    const [head, ...rest] = name.split(': ');
    if (rest.length && rest.join(': ').toLowerCase().startsWith(head.toLowerCase())) name = head;
    return { what: 'show', name, item: t };
  }
  const parts = t.split(': ');
  if (parts.length >= 3) return { what: 'show', name: parts[0], item: t };
  return { what: 'movie', name: t };
}

// Trailers, previews and recaps that autoplay aren't things you watched.
const NOT_WATCHED = /trailer|hook|teaser|preview|recap|bumper/i;

/**
 * Limited series often title episodes just "Show: Episode", which reads like a movie on its own.
 * Within one export, titles sharing what comes before the colon are episodes of that show, unless
 * what follows all starts with the same word, as in a film series ("Mission: Impossible – Fallout",
 * "Mission: Impossible – Dead Reckoning"). A title whose start matches a known show is an episode too.
 */
export function seriesFromSiblings(list: { what: 'show' | 'movie'; name: string; item?: string }[]): void {
  const head = (s: string) => { const i = s.indexOf(': '); return i > 0 ? [s.slice(0, i), s.slice(i + 2)] : null; };
  const rests = new Map<string, Set<string>>();
  for (const t of list) {
    const h = t.what === 'movie' && head(t.name);
    if (h) rests.set(h[0], (rests.get(h[0]) ?? new Set()).add(h[1]));
  }
  const shows = new Set(list.filter(t => t.what === 'show').map(t => t.name.toLowerCase()));
  const series = new Set([...rests].filter(([h, r]) => shows.has(h.toLowerCase())
    || (r.size >= 2 && new Set([...r].map(x => x.split(/\s+/)[0].toLowerCase())).size > 1)).map(([h]) => h));
  for (const t of list) {
    const h = t.what === 'movie' && head(t.name);
    if (h && series.has(h[0])) Object.assign(t, { what: 'show', name: h[0], item: t.name });
  }
}

function netflix(text: string, notes: string[]): Play[] | null {
  const activity = csvObjects(text, ['Profile Name', 'Start Time', 'Title']);
  if (activity.length) {
    const plays = activity.flatMap(r => {
      if (NOT_WATCHED.test(col(r, 'Supplemental Video Type'))) { notes.push('1 Netflix trailer or preview skipped.'); return []; }
      const t = netflixTitle(col(r, 'Title'));
      return t.name ? [{ service: 'Netflix', ...t, day: looseDate(col(r, 'Start Time')), ms: hms(col(r, 'Duration')), profile: col(r, 'Profile Name') } as Play] : [];
    });
    seriesFromSiblings(plays as any);
    // A couple of minutes is browsing, not watching. Movies need a real sitting.
    return plays.filter(p => { const keep = p.ms! >= (p.what === 'movie' ? 10 : 2) * 60_000; if (!keep) notes.push('1 Netflix short play skipped.'); return keep; });
  }
  // The simpler download from a profile's Viewing activity page: Title, Date.
  const simple = csvObjects(text, ['Title', 'Date']);
  if (simple.length && simple.every(r => Object.keys(r).length <= 3)) {
    const plays = simple.flatMap(r => {
      const t = netflixTitle(col(r, 'Title'));
      return t.name ? [{ service: 'Netflix', ...t, day: looseDate(col(r, 'Date')) } as Play] : [];
    });
    seriesFromSiblings(plays as any);
    return plays;
  }
  return null;
}

/** Spotify's JSON files, in any of the shapes it has used. */
function spotify(data: unknown[], notes: string[]): Play[] | null {
  const first = data.find(obj);
  if (!first) return null;
  const plays: Play[] = [];
  // Spotify counts a stream after 30 seconds; shorter is a skip.
  const counted = (ms: number) => ms >= 30_000;
  if ('ms_played' in first && 'ts' in first) {
    // Extended streaming history (and the older endsong_*.json).
    for (const r of data) {
      if (!obj(r) || !counted(num(r.ms_played))) { notes.push('1 Spotify short play skipped.'); continue; }
      const day = looseDate(str(r.ts)), ms = num(r.ms_played);
      const artist = str(r.master_metadata_album_artist_name), show = str(r.episode_show_name);
      if (artist) plays.push({ service: 'Spotify', what: 'artist', name: artist, item: str(r.master_metadata_track_name), day, ms });
      else if (show) plays.push({ service: 'Spotify', what: 'podcast', name: show, item: str(r.episode_name), day, ms });
      // Audiobook chapters are left for a books import.
    }
    return plays;
  }
  if ('msPlayed' in first && 'endTime' in first) {
    // Account data: StreamingHistory_music_0.json, StreamingHistory_podcast_0.json, or the older StreamingHistory0.json.
    for (const r of data) {
      if (!obj(r) || !counted(num(r.msPlayed))) { notes.push('1 Spotify short play skipped.'); continue; }
      const day = looseDate(str(r.endTime)), ms = num(r.msPlayed);
      if (str(r.podcastName)) plays.push({ service: 'Spotify', what: 'podcast', name: str(r.podcastName), item: str(r.episodeName), day, ms });
      else if (str(r.artistName)) plays.push({ service: 'Spotify', what: 'artist', name: str(r.artistName), item: str(r.trackName), day, ms });
    }
    return plays;
  }
  return null;
}

/** Google Takeout's watch-history.json. Only YouTube Music is kept; ordinary YouTube videos aren't music. */
function youtubeMusic(data: unknown[]): { plays: Play[]; videos: number } | null {
  const first = data.find(obj);
  if (!first || !('header' in first) || !('title' in first)) return null;
  const plays: Play[] = [];
  let videos = 0;
  for (const r of data) {
    if (!obj(r)) continue;
    if (r.header !== 'YouTube Music') { videos++; continue; }
    const channel = Array.isArray(r.subtitles) && obj(r.subtitles[0]) ? str(r.subtitles[0].name) : '';
    const artist = channel.replace(/\s+-\s+Topic$/i, '').replace(/VEVO$/, '').trim();
    if (!artist) continue;
    plays.push({ service: 'YouTube Music', what: 'artist', name: artist, item: str(r.title).replace(/^Watched\s+/, ''), day: looseDate(str(r.time)) });
  }
  return { plays, videos };
}

/** Apple Music from privacy.apple.com: the daily tracks summary, or the play-by-play activity file. */
function appleMusic(text: string, notes: string[]): Play[] | null {
  const daily = csvObjects(text, ['Track Description', 'Date Played']);
  if (daily.length) {
    return daily.flatMap(r => {
      if (/video/i.test(col(r, 'Media type'))) { notes.push('1 Apple video skipped.'); return []; }
      const [artist, ...song] = col(r, 'Track Description').split(' - ');
      if (!artist || !song.length) return [];
      return [{ service: 'Apple Music', what: 'artist', name: artist.trim(), item: song.join(' - ').trim(),
        day: looseDate(col(r, 'Date Played')), ms: +col(r, 'Play Duration Milliseconds') || 0, count: Math.max(1, +col(r, 'Play Count') || 1) } as Play];
    });
  }
  const activity = csvObjects(text, ['Song Name', 'Play Duration Milliseconds']);
  if (activity.length) {
    return activity.flatMap(r => {
      const artist = col(r, 'Artist Name', 'Container Artist Name');
      const ms = +col(r, 'Play Duration Milliseconds') || 0;
      if (!artist || ms < 30_000) { notes.push('1 Apple short or unidentifiable play skipped.'); return []; }
      return [{ service: 'Apple Music', what: 'artist', name: artist, item: col(r, 'Song Name'),
        day: looseDate(col(r, 'Event Start Timestamp', 'Event Received Timestamp')), ms } as Play];
    });
  }
  return null;
}

// ---------- rolling plays up into cards ----------

function tally(plays: Play[]): Tally[] {
  const by = new Map<string, Tally>();
  for (const p of plays) {
    if (!p.day) continue;
    const key = [p.service, p.profile ?? '', p.what, norm(p.name)].join('|');
    let t = by.get(key);
    if (!t) by.set(key, t = { service: p.service, what: p.what, name: p.name, profile: p.profile, first: p.day, last: p.day, plays: 0, ms: 0, items: new Set() });
    if (p.day < t.first) t.first = p.day;
    if (p.day > t.last) t.last = p.day;
    t.plays += p.count ?? 1;
    t.ms += p.ms ?? 0;
    if (p.item) t.items.add(norm(p.item));
  }
  return [...by.values()];
}

/** "42 hours", "35 min". */
export function listened(ms: number): string {
  if (ms <= 0) return '';
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${Math.max(1, min)} min`;
  const h = Math.round(min / 60);
  return `${h} hour${h === 1 ? '' : 's'}`;
}

const plural = (n: number, one: string, many = one + 's') => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

function proposal(t: Tally, at: string): Proposal {
  const sync = { source: t.service, id: `${t.what}:${norm(t.name)}`, at };
  const keep = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v));
  if (t.what === 'show' || t.what === 'movie') {
    // An earlier import may have filed this show's episodes as movies; those cards fold into this one.
    const absorbs = t.what === 'show' ? { source: t.service, ids: [...t.items].map(i => `movie:${i}`) } : undefined;
    return { area: 'interests', kind: 'Movie or show', value: t.name, since: t.first, sync, absorbs,
      fields: keep({ type: t.what === 'show' ? 'Show' : 'Movie', status: 'Watched', service: t.service,
        episodes: t.what === 'show' ? String(t.items.size || t.plays) : '', lastWatched: t.last !== t.first ? t.last : '' }) };
  }
  if (t.what === 'podcast') {
    return { area: 'interests', kind: 'Podcast', value: t.name, since: t.first, sync,
      fields: keep({ service: t.service, episodes: String(t.items.size || t.plays), time: listened(t.ms), lastPlayed: t.last }) };
  }
  return { area: 'interests', kind: 'Music', value: t.name, since: t.first, sync,
    fields: keep({ type: 'Artist', service: t.service, plays: String(t.plays), time: listened(t.ms), lastPlayed: t.last }) };
}

const GROUP: Record<What, string> = { show: 'Shows', movie: 'Movies', artist: 'Artists', podcast: 'Podcasts' };

// Artists you played only a handful of times are noise in a life record; the rest are listed,
// and only the ones you played most start out ticked.
const MIN_ARTIST_PLAYS = 5;
const MIN_ARTIST_MS = 30 * 60_000;
const TOP_ARTISTS = 50;

/**
 * Review rows for a set of files (name → text). `me` is the person's name: when a Netflix account
 * has several profiles, only the profile that looks like theirs starts out ticked.
 */
export function streamingRows(files: Record<string, string>, me = ''): ImportResult & { source: string } {
  const plays: Play[] = [];
  const notes: string[] = [];
  let unknown = 0, videos = 0;
  for (const [name, text] of Object.entries(files)) {
    let found: Play[] | null = null;
    if (/\.json$/i.test(name) || /^\s*[[{]/.test(text)) {
      let data: unknown;
      try { data = JSON.parse(text); } catch { data = null; }
      if (Array.isArray(data)) {
        found = spotify(data, notes);
        if (!found) { const yt = youtubeMusic(data); if (yt) { found = yt.plays; videos += yt.videos; } }
      }
    } else {
      found = netflix(text, notes) ?? appleMusic(text, notes);
    }
    if (found) plays.push(...found); else unknown++;
  }

  const services = [...new Set(plays.map(p => p.service))];
  const source = services.join(' & ');
  if (!plays.length) {
    return { rows: [], source, notes: [...notes, unknown
      ? 'Those files weren’t recognized. Use Netflix’s viewing activity CSV, Spotify’s data zip, Apple’s Media Services zip, or YouTube Music’s watch-history.json from Google Takeout.'
      : 'No plays were found in that file.'] };
  }

  // A newer export of the same history refreshes counts; the same export again changes nothing.
  const lastDay = new Map<Service, string>();
  for (const p of plays) if (p.day > (lastDay.get(p.service) ?? '')) lastDay.set(p.service, p.day);
  const at = (s: Service) => `${(lastDay.get(s)! + '-01-01').slice(0, 10)}T00:00:00.000Z`;

  const profiles = [...new Set(plays.filter(p => p.profile).map(p => p.profile!))];
  const first = norm(me).split(' ')[0];
  const mine = profiles.length > 1 ? profiles.find(p => first && norm(p).split(' ')[0] === first) : undefined;
  if (profiles.length > 1) {
    notes.push(mine
      ? `This Netflix account has ${profiles.length} profiles. Only ${mine}’s are ticked; tick others if they were you too.`
      : `This Netflix account has ${profiles.length} profiles (${profiles.join(', ')}). Untick the ones that weren’t you.`);
  }

  const tallies = tally(plays);
  const artists = tallies.filter(t => t.what === 'artist');
  const keptArtists = new Set(artists.filter(t => t.plays >= MIN_ARTIST_PLAYS || t.ms >= MIN_ARTIST_MS)
    .sort((a, b) => b.ms - a.ms || b.plays - a.plays));
  const topArtists = new Set([...keptArtists].slice(0, TOP_ARTISTS));
  const dropped = artists.length - keptArtists.size;
  if (dropped) notes.push(`${plural(dropped, 'artist')} you played only a few times ${dropped === 1 ? 'was' : 'were'} left out.`);
  if (keptArtists.size > TOP_ARTISTS) notes.push(`Your ${TOP_ARTISTS} most played artists are ticked. Tick any others you want to keep.`);
  if (videos) notes.push(`${plural(videos, 'ordinary YouTube video')} ${videos === 1 ? 'was' : 'were'} skipped; only YouTube Music is imported.`);
  if (unknown) notes.push(`${plural(unknown, 'file')} in the export ${unknown === 1 ? 'wasn’t' : 'weren’t'} viewing or listening history and ${unknown === 1 ? 'was' : 'were'} skipped.`);

  const order: What[] = ['show', 'movie', 'artist', 'podcast'];
  const sorted = tallies
    .filter(t => t.what !== 'artist' || keptArtists.has(t))
    .sort((a, b) => order.indexOf(a.what) - order.indexOf(b.what)
      || (a.what === 'artist' ? b.ms - a.ms || b.plays - a.plays : b.last.localeCompare(a.last)));

  const rows: ImportRow[] = sorted.map(t => {
    const group = [services.length > 1 ? t.service : '', GROUP[t.what], profiles.length > 1 ? t.profile : ''].filter(Boolean).join(' · ');
    const count = t.what === 'show' ? plural(t.items.size || t.plays, 'episode')
      : t.what === 'podcast' ? plural(t.items.size || t.plays, 'episode')
      : t.what === 'artist' ? [plural(t.plays, 'play'), listened(t.ms)].filter(Boolean).join(', ') : '';
    const when = t.first === t.last ? t.first : `${t.first} to ${t.last}`;
    const ticked = (t.what !== 'artist' || topArtists.has(t)) && (!mine || !t.profile || t.profile === mine);
    const p = proposal(t, at(t.service));
    return { id: rowId('stream'), group, label: t.name, sub: [count, when].filter(Boolean).join(' · '), on: ticked, build: () => [p] };
  });
  const reasons = new Map<string, number>();
  for (const note of notes) reasons.set(note, (reasons.get(note) ?? 0) + 1);
  return { rows, source, notes: [...reasons].map(([note, count]) => count > 1 && note.startsWith('1 ') ? `${count} ${note.slice(2)}` : note) };
}

/** Which files inside an export zip are worth reading. Everything else is skipped unread. */
export const isStreamingFile = (name: string) =>
  /(StreamingHistory|Streaming_History|endsong).*\.json$|ViewingActivity\.csv$|NetflixViewingHistory.*\.csv$|Play History Daily Tracks.*\.csv$|Play Activity.*\.csv$|watch-history\.json$/i.test(name);

/**
 * The history files inside an export zip, as text. Apple wraps its zip inside another zip, so zips
 * are opened one level deep. Only history files are decompressed; everything else stays unread.
 */
export function streamingZip(bytes: Uint8Array, depth = 0): Record<string, string> {
  const out: Record<string, string> = {};
  const entries = unzipSync(bytes, { filter: e => isStreamingFile(e.name) || (depth === 0 && /\.zip$/i.test(e.name)) });
  for (const [name, data] of Object.entries(entries)) {
    if (/\.zip$/i.test(name)) Object.assign(out, streamingZip(data, depth + 1));
    else out[name] = new TextDecoder().decode(data);
  }
  return out;
}
