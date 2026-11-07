import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { addCard } from '../cards';
import { emptyProfile } from '../profile';
import { applyProposals, planFor } from './match';
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
    applyProposals(p, [crown], 'Netflix', NOW);
    expect(p.cards.filter(c => c.value === 'The Crown')).toHaveLength(1);
    expect(p.cards.find(c => c.value === 'The Crown')!.fields).toMatchObject({ episodes: '3', lastWatched: '2023-01-02' });
  });

  it('fills a card you already added by hand instead of duplicating it', () => {
    const p = { ...emptyProfile(), name: 'Sam' };
    addCard(p, { area: 'interests', kind: 'Movie or show', value: 'The Crown', since: '' }, undefined, NOW);
    const crown = build(streamingRows({ 'ViewingActivity.csv': activity }, 'Sam')).find(x => x.value === 'The Crown')!;
    expect(planFor(p, crown)).toBe('fill');
  });

  it('opens export zips, including Apple’s zip inside a zip, and reads only history files', () => {
    const apple = zipSync({ 'Apple Music Activity/Apple Music - Play History Daily Tracks.csv': strToU8('Track Description,Date Played\nA - B,20220105'),
      'Apple Music Activity/Apple Music Library Tracks.json': strToU8('[]') });
    const outer = zipSync({ 'Apple Media Services information/Apple_Media_Services.zip': apple, 'Apple Media Services information/README.txt': strToU8('hi'),
      'Spotify Account Data/StreamingHistory_music_0.json': strToU8('[]'), 'Spotify Account Data/Userdata.json': strToU8('{}') });
    expect(Object.keys(streamingZip(outer)).sort()).toEqual([
      'Apple Music Activity/Apple Music - Play History Daily Tracks.csv', 'Spotify Account Data/StreamingHistory_music_0.json']);
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
