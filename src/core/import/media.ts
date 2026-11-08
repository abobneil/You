// Books and movies from Goodreads (My Books → Export), Letterboxd (Settings → Data → Export)
// and IMDb (Your ratings → Export). The file type is worked out from its columns.
import { col, csvObjects, looseDate, rowId } from './parse';
import type { ImportResult, ImportRow } from './types';

const stars = (n: number) => (n > 0 ? '★'.repeat(Math.max(1, Math.min(5, Math.round(n)))) : '');
const keep = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v));

export function mediaRows(text: string, at = new Date().toISOString()): ImportResult & { source: string } {
  const goodreads = csvObjects(text, ['Title', 'Author', 'Exclusive Shelf']);
  if (goodreads.length) {
    const status: Record<string, string> = { read: 'Read', 'currently-reading': 'Reading', 'to-read': 'Want to read' };
    const rows: ImportRow[] = goodreads.filter(r => col(r, 'Title')).map(r => {
      const title = col(r, 'Title'), author = col(r, 'Author');
      const shelf = status[col(r, 'Exclusive Shelf')] ?? '';
      const since = looseDate(col(r, 'Date Read')) || looseDate(col(r, 'Date Added'));
      return { id: rowId('gr'), group: shelf || 'Books', label: title, sub: `${author} · date from the export's '${col(r, 'Date Read') ? 'Date Read' : 'Date Added'}' column`,
        build: () => [{ area: 'interests', kind: 'Book', value: title, since, sync: { source: 'goodreads', id: col(r, 'Book Id', 'ISBN13', 'ISBN') || author + ':' + title, at }, fields: keep({ author, status: shelf, rating: stars(+col(r, 'My Rating')), sourceRating: +col(r, 'My Rating') > 0 ? `${col(r, 'My Rating')}/5` : '' /* Goodreads writes 0 for unrated */, edition: col(r, 'ISBN13', 'ISBN', 'Book Id') }) }] };
    });
    return { rows, source: 'Goodreads', notes: goodreads.length > rows.length ? [`${goodreads.length - rows.length} rows skipped: blank title.`] : [] };
  }

  const imdb = csvObjects(text, ['Const', 'Your Rating', 'Title']);
  if (imdb.length) {
    const rows: ImportRow[] = imdb.filter(r => col(r, 'Title')).map(r => {
      const tv = /tv/i.test(col(r, 'Title Type'));
      return { id: rowId('imdb'), group: tv ? 'Shows' : 'Movies', label: col(r, 'Title'), sub: col(r, 'Year'),
        build: () => [{ area: 'interests', kind: 'Movie or show', value: col(r, 'Title'), sync: { source: 'imdb', id: col(r, 'Const'), at }, since: looseDate(col(r, 'Date Rated')),
          fields: keep({ type: tv ? 'Show' : 'Movie', year: col(r, 'Year'), status: 'Watched', rating: stars(+col(r, 'Your Rating') / 2), sourceRating: `${col(r, 'Your Rating')}/10`, creator: col(r, 'Directors') }) }] };
    });
    return { rows, source: 'IMDb' };
  }

  const letterboxd = csvObjects(text, ['Name', 'Year', 'Letterboxd URI']);
  if (letterboxd.length) {
    const rows: ImportRow[] = letterboxd.filter(r => col(r, 'Name')).map(r => ({
      id: rowId('lb'), group: 'Movies', label: col(r, 'Name'), sub: col(r, 'Year'),
      build: () => [{ area: 'interests', kind: 'Movie or show', value: col(r, 'Name'), sync: { source: 'letterboxd', id: col(r, 'Letterboxd URI') || col(r, 'Name') + ':' + col(r, 'Year'), at }, since: looseDate(col(r, 'Watched Date', 'Date')),
        fields: keep({ type: 'Movie', year: col(r, 'Year'), status: 'Watched', rating: stars(+col(r, 'Rating')), sourceRating: col(r, 'Rating') ? `${col(r, 'Rating')}/5` : '' }) }],
    }));
    return { rows, source: 'Letterboxd' };
  }

  return { rows: [], source: '', notes: ['That file wasn’t recognized. Use the CSV export from Goodreads, Letterboxd or IMDb.'] };
}
