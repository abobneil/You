import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { addCard, endCard } from '../cards';
import { emptyProfile } from '../profile';
import { absorbable, applyProposals, needsTimeReview, planFor } from './match';
import { isStreamingFile, listened, netflixTitle, streamingRows, streamingZip } from './streaming';

const NOW = '2026-11-07T12:00:00.000Z';
const build = (r: ReturnType<typeof streamingRows>) => r.rows.map(row => row.build()[0]);

describe('Netflix titles', () => {
  it('splits episodes from movies', () => {
    expect(netflixTitle('The Crown: Season 1: Wolferton Splash')).toMatchObject({ what: 'show', name: 'The Crown' });
    expect(netflixTitle('Stranger Things: Stranger Things 2: Chapter One: MADMAX')).toMatchObject({ what: 'show', name: 'Stranger Things' });
    expect(netflixTitle('Avatar: The Last Airbender: Book 1: Water: The Boy in the Iceberg')).toMatchObject({ what: 'show', name: 'Avatar: The Last Airbender' });
    expect(netflixTitle('Glass Onion: A Knives Out Mystery')).toEqual({ what: 'movie', name: 'Glass Onion: A Knives Out Mystery' });
    expect(netflixTitle('Roma')).toEqual({ what: 'movie', name: 'Roma' });
  });
});

describe('streaming imports', () => {
  const activity = [
    'Profile Name,Start Time,Duration,Attributes,Title,Supplemental Video Type,Device Type,Bookmark,Latest Bookmark,Country',
    'Sam,2021-03-02 20:00:00,0:50:00,,The Crown: Season 1: Wolferton Splash,,TV,0:50:00,0:50:00,US',
    'Sam,2021-03-09 20:00:00,0:55:00,,The Crown: Season 1: Hyde Park Corner,,TV,0:55:00,0:55:00,US',
    'Sam,2021-03-09 21:00:00,0:01:00,,The Crown: Season 1: Windsor,,TV,0:01:00,0:01:00,US',
    'Sam,2021-03-10 20:00:00,0:02:00,,The Crown: Season 2,TRAILER,TV,0:02:00,0:02:00,US',
    'Sam,2022-12-24 20:00:00,2:10:00,,Glass Onion: A Knives Out Mystery,,TV,2:10:00,2:10:00,US',
    'Kids,2022-01-01 09:00:00,0:20:00,,Bluey: Season 1: Magic Xylophone,,TV,0:20:00,0:20:00,US',
  ].join('\n');

  it('rolls Netflix viewing activity up into shows and movies, skipping trailers and quick looks', () => {
    const r = streamingRows({ 'ViewingActivity.csv': activity }, 'Sam Rivera');
    expect(r.source).toBe('Netflix');
    const crown = r.rows.find(x => x.label === 'The Crown')!;
    expect(crown.on).toBe(true);
    expect(crown.build()[0]).toMatchObject({ kind: 'Movie or show', since: '2021-03-02',
      fields: { type: 'Show', service: 'Netflix', episodes: '2', lastWatched: '2021-03-09' } });
    expect(r.rows.find(x => x.label === 'Glass Onion: A Knives Out Mystery')!.build()[0].fields).toMatchObject({ type: 'Movie', status: 'Watched' });
    // Another profile on the account starts unticked when one profile matches the person's name.
    expect(r.rows.find(x => x.label === 'Bluey')!.on).toBe(false);
    expect(r.notes!.join(' ')).toMatch(/2 profiles/);
  });

  it('reads the simple Title,Date download', () => {
    const r = streamingRows({ 'NetflixViewingHistory.csv': 'Title,Date\n"The Crown: Season 1: Windsor",3/9/21\n"Roma",1/5/19' });
    expect(build(r).map(p => [p.value, p.since])).toEqual([['The Crown', '2021-03-09'], ['Roma', '2019-01-05']]);
  });

  it('reads Spotify account data and extended history, ignoring skips', () => {
    const music = JSON.stringify([
      ...Array.from({ length: 6 }, (_, i) => ({ endTime: `2023-0${i + 1}-01 10:00`, artistName: 'Radiohead', trackName: `Song ${i}`, msPlayed: 240000 })),
      { endTime: '2023-02-01 10:00', artistName: 'Radiohead', trackName: 'Skipped', msPlayed: 5000 },
      { endTime: '2023-02-01 10:00', artistName: 'Once Only', trackName: 'Hit', msPlayed: 200000 },
    ]);
    const podcasts = JSON.stringify([{ endTime: '2023-04-01 08:00', podcastName: 'The Daily', episodeName: 'Ep 1', msPlayed: 1800000 }]);
    const r = streamingRows({ 'StreamingHistory_music_0.json': music, 'StreamingHistory_podcast_0.json': podcasts });
    expect(r.source).toBe('Spotify');
    expect(build(r)).toEqual([
      expect.objectContaining({ kind: 'Music', value: 'Radiohead', since: '2023-01-01', fields: expect.objectContaining({ plays: '6', time: '24 min', lastPlayed: '2023-06-01' }) }),
      expect.objectContaining({ kind: 'Podcast', value: 'The Daily', fields: expect.objectContaining({ episodes: '1', time: '30 min' }) }),
    ]);
    expect(r.notes!.join(' ')).toMatch(/1 artist you played only a few times/);

    const extended = JSON.stringify(Array.from({ length: 5 }, () => ({ ts: '2015-06-01T12:00:00Z', ms_played: 200000,
      master_metadata_track_name: 'Hey', master_metadata_album_artist_name: 'Pixies', episode_name: null, episode_show_name: null })));
    expect(build(streamingRows({ 'Streaming_History_Audio_2015.json': extended }))[0]).toMatchObject({ value: 'Pixies', since: '2015-06-01' });
  });

  it('reads Apple Music daily tracks and YouTube Music history', () => {
    const apple = 'Country,Track Identifier,Media type,Date Played,Hours,Play Duration Milliseconds,Source Type,Play Count,Skip Count,Track Description\n'
      + 'US,1,AUDIO,20220105,10,1200000,IPHONE,5,0,Phoebe Bridgers - Motion Sickness\nUS,2,VIDEO,20220105,10,1200000,IPHONE,9,0,Some - Video';
    expect(build(streamingRows({ 'Apple Music - Play History Daily Tracks.csv': apple }))).toEqual([
      expect.objectContaining({ value: 'Phoebe Bridgers', since: '2022-01-05', fields: expect.objectContaining({ service: 'Apple Music', plays: '5' }) })]);

    const yt = JSON.stringify([
      ...Array.from({ length: 5 }, () => ({ header: 'YouTube Music', title: 'Watched Clair de Lune', subtitles: [{ name: 'Claude Debussy - Topic' }], time: '2024-02-03T10:00:00Z' })),
      { header: 'YouTube', title: 'Watched a cat video', subtitles: [{ name: 'Cats' }], time: '2024-02-03T10:00:00Z' },
    ]);
    const r = streamingRows({ 'Takeout/YouTube and YouTube Music/history/watch-history.json': yt });
    expect(build(r)[0]).toMatchObject({ value: 'Claude Debussy', fields: { service: 'YouTube Music', plays: '5' } });
    expect(r.notes!.join(' ')).toMatch(/1 ordinary YouTube video/);
  });

  it('a newer export refreshes counts; the same export again changes nothing', () => {
    const p = { ...emptyProfile(), name: 'Sam' };
    applyProposals(p, build(streamingRows({ 'ViewingActivity.csv': activity }, 'Sam')), 'Netflix', NOW);
    expect(p.cards.find(c => c.value === 'The Crown')!.fields).toMatchObject({ episodes: '2' });
    expect(build(streamingRows({ 'ViewingActivity.csv': activity }, 'Sam')).every(x => planFor(p, x) === 'have')).toBe(true);

    const v2 = streamingRows({ 'ViewingActivity.csv': activity + '\nSam,2023-01-02 20:00:00,0:50:00,,The Crown: Season 2: Misadventure,,TV,0:50:00,0:50:00,US' }, 'Sam');
    const crown = build(v2).find(x => x.value === 'The Crown')!;
    expect(planFor(p, crown)).toBe('update');
    expect(needsTimeReview(p.cards.find(c => c.value === 'The Crown')!, crown)).toBe(true);
    applyProposals(p, [{ ...crown, useIncoming: true }], 'Netflix', NOW);
    expect(p.cards.filter(c => c.value === 'The Crown')).toHaveLength(1);
    expect(p.cards.find(c => c.value === 'The Crown')!.fields).toMatchObject({ episodes: '3', lastWatched: '2023-01-02' });
  });

  it('keeps a yearless title separate pending explicit match review', () => {
    const p = { ...emptyProfile(), name: 'Sam' };
    addCard(p, { area: 'interests', kind: 'Movie or show', value: 'The Crown', since: '' }, undefined, NOW);
    const crown = build(streamingRows({ 'ViewingActivity.csv': activity }, 'Sam')).find(x => x.value === 'The Crown')!;
    expect(planFor(p, crown)).toBe('new');
  });

  it('opens export zips, including Apple’s zip inside a zip, and reads only history files', () => {
    const apple = zipSync({ 'Apple Music Activity/Apple Music - Play History Daily Tracks.csv': strToU8('Track Description,Date Played\nA - B,20220105'),
      'Apple Music Activity/Apple Music Library Tracks.json': strToU8('[]') });
    const outer = zipSync({ 'Apple Media Services information/Apple_Media_Services.zip': apple, 'Apple Media Services information/README.txt': strToU8('hi'),
      'Spotify Account Data/StreamingHistory_music_0.json': strToU8('[]'), 'Spotify Account Data/Userdata.json': strToU8('{}') });
    expect(Object.keys(streamingZip(outer)).sort()).toEqual([
      'Apple Music Activity/Apple Music - Play History Daily Tracks.csv', 'Spotify Account Data/StreamingHistory_music_0.json']);
  });

  it('treats "Show: Episode" titles that share a show name as episodes, not movies', () => {
    const csv = 'Title,Date\n'
      + '"How To Get To Heaven From Belfast: Anagnorisis",8/31/26\n"How To Get To Heaven From Belfast: The Box",8/31/26\n'
      + '"Mission: Impossible – Fallout",1/1/20\n"Mission: Impossible – Dead Reckoning",1/1/24\n'
      + '"The Diplomat: Season 1: The Cinderella Thing",1/1/23\n"The Diplomat: Special Look",1/2/23\n'
      + '"Glass Onion: A Knives Out Mystery",12/24/22';
    const out = build(streamingRows({ 'NetflixViewingHistory.csv': csv })).map(p => [p.value, p.fields!.type]);
    expect(out).toEqual(expect.arrayContaining([
      ['How To Get To Heaven From Belfast', 'Show'], ['The Diplomat', 'Show'],
      ['Mission: Impossible – Fallout', 'Movie'], ['Mission: Impossible – Dead Reckoning', 'Movie'], ['Glass Onion: A Knives Out Mystery', 'Movie']]));
    expect(out).toHaveLength(5);
  });

  it('folds episode cards an earlier import filed as movies into the show, unless they were edited', () => {
    const p = { ...emptyProfile(), name: 'Sam' };
    const ep = (title: string) => {
      const c = addCard(p, { area: 'interests', kind: 'Movie or show', value: title, since: '2026-08-31', fields: { type: 'Movie', status: 'Watched', service: 'Netflix' } }, undefined, NOW);
      c.imports = { Netflix: { id: `movie:${title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}`, at: '2026-08-31T00:00:00.000Z', fields: { ...c.fields! } } };
      return c;
    };
    ep('Belfast: Anagnorisis'); ep('Belfast: The Box');
    const kept = ep('Belfast: The Ghost');
    kept.fields!.rating = '★★★★';
    const show = build(streamingRows({ 'NetflixViewingHistory.csv': 'Title,Date\n"Belfast: Anagnorisis",8/31/26\n"Belfast: The Box",8/31/26\n"Belfast: The Ghost",8/31/26' }))[0];
    expect(planFor(p, show)).toBe('new');
    expect(applyProposals(p, [show], 'Netflix', NOW)).toMatchObject({ added: 1, merged: 2 });
    expect(p.cards.filter(c => c.status === 'active').map(c => c.value).sort()).toEqual(['Belfast', 'Belfast: The Ghost']);
    // Folded cards are kept in history with a note, never deleted.
    const folded = p.cards.filter(c => c.status === 'past');
    expect(folded.map(c => c.value).sort()).toEqual(['Belfast: Anagnorisis', 'Belfast: The Box']);
    expect(folded.every(c => c.note === 'Folded into Belfast')).toBe(true);
    // Importing the same file again doesn't fold them a second time or delete them.
    applyProposals(p, [show], 'Netflix', NOW);
    expect(p.cards).toHaveLength(4);
  });

  it('never folds away an earlier-import card the person annotated (note, keepsake, tag, ended)', () => {
    const p = { ...emptyProfile(), name: 'Sam' };
    const ep = (title: string) => {
      const c = addCard(p, { area: 'interests', kind: 'Movie or show', value: title, since: '2026-08-31', fields: { type: 'Movie', status: 'Watched', service: 'Netflix' } }, undefined, NOW);
      c.imports = { Netflix: { id: `movie:${title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}`, at: '2026-08-31T00:00:00.000Z', fields: { ...c.fields!, $value: title, $until: '', $status: 'current' } } };
      return c;
    };
    ep('The Crown: Gold Stick').note = 'Watched with Gran';
    ep('The Crown: Smoke and Mirrors').keepsakes = [{ id: 'k1', name: 'p.jpg', type: 'image/jpeg', size: 1, addedAt: NOW } as never];
    ep('The Crown: Wolferton Splash').tag = 'favourite';
    endCard(p, ep('The Crown: Hyde Park Corner').id, '2026-09', NOW);
    ep('The Crown: Act of God').value = 'The Crown: Act of God (S1)';
    const before = structuredClone(p.cards);
    const csv = ['Title,Date', ...before.map(c => `"${c.imports!.Netflix.fields.$value}",8/31/26`), '"The Crown: Windsor",9/1/26'].join('\n');
    const show = build(streamingRows({ 'NetflixViewingHistory.csv': csv })).find(x => x.value === 'The Crown')!;
    expect(absorbable(p, show)).toEqual([]);
    expect(applyProposals(p, [show], 'Netflix', NOW)).toMatchObject({ added: 1, merged: 0 });
    for (const c of before) expect(p.cards.find(x => x.id === c.id)).toEqual(c);
  });

  it('helpers', () => {
    expect(listened(45 * 60_000)).toBe('45 min');
    expect(listened(42 * 3_600_000)).toBe('42 hours');
    expect(isStreamingFile('Spotify Extended Streaming History/Streaming_History_Audio_2019-2021_0.json')).toBe(true);
    expect(isStreamingFile('netflix-report/CONTENT_INTERACTION/ViewingActivity.csv')).toBe(true);
    expect(isStreamingFile('Spotify Account Data/Userdata.json')).toBe(false);
    expect(streamingRows({ 'x.csv': 'a,b\n1,2' }).notes![0]).toMatch(/weren’t recognized/);
  });
});
