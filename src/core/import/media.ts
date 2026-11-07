// Books and movies from Goodreads (My Books → Export), Letterboxd (Settings → Data → Export)
// and IMDb (Your ratings → Export). The file type is worked out from its columns.
import { col, csvObjects, looseDate, rowId } from './parse';
import type { ImportResult, ImportRow } from './types';

const stars = (n: number) => (n > 0 ? '★'.repeat(Math.max(1, Math.min(5, Math.round(n)))) : '');
const keep = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v));

export function mediaRows(text: string): ImportResult & { source: string } {
  const goodreads = csvObjects(text, ['Title', 'Author', 'Exclusive Shelf']);
  if (goodreads.length) {
    const status: Record<string, string> = { read: 'Read', 'currently-reading': 'Reading', 'to-read': 'Want to read' };
    const rows: ImportRow[] = goodreads.filter(r => col(r, 'Title')).map(r => {
      const title = col(r, 'Title'), author = col(r, 'Author');
      const shelf = status[col(r, 'Exclusive Shelf')] ?? '';
      const since = looseDate(col(r, 'Date Read')) || looseDate(col(r, 'Date Added'));
      return { id: rowId('gr'), group: shelf || 'Books', label: title, sub: author,
        build: () => [{ area: 'interests', kind: 'Book', value: title, since, fields: keep({ author, status: shelf, rating: stars(+col(r, 'My Rating')) }) }] };
    });
    return { rows, source: 'Goodreads' };
  }

  const imdb = csvObjects(text, ['Const', 'Your Rating', 'Title']);
  if (imdb.length) {
    const rows: ImportRow[] = imdb.filter(r => col(r, 'Title')).map(r => {
      const tv = /tv/i.test(col(r, 'Title Type'));
      return { id: rowId('imdb'), group: tv ? 'Shows' : 'Movies', label: col(r, 'Title'), sub: col(r, 'Year'),
        build: () => [{ area: 'interests', kind: 'Movie or show', value: col(r, 'Title'), since: looseDate(col(r, 'Date Rated')),
          fields: keep({ type: tv ? 'Show' : 'Movie', year: col(r, 'Year'), status: 'Watched', rating: stars(+col(r, 'Your Rating') / 2) }) }] };
    });
    return { rows, source: 'IMDb' };
  }

  const letterboxd = csvObjects(text, ['Name', 'Year', 'Letterboxd URI']);
  if (letterboxd.length) {
    const rows: ImportRow[] = letterboxd.filter(r => col(r, 'Name')).map(r => ({
      id: rowId('lb'), group: 'Movies', label: col(r, 'Name'), sub: col(r, 'Year'),
      build: () => [{ area: 'interests', kind: 'Movie or show', value: col(r, 'Name'), since: looseDate(col(r, 'Watched Date', 'Date')),
        fields: keep({ type: 'Movie', year: col(r, 'Year'), status: 'Watched', rating: stars(+col(r, 'Rating')) }) }],
    }));
    return { rows, source: 'Letterboxd' };
  }

  return { rows: [], source: '', notes: ['That file wasn’t recognized. Use the CSV export from Goodreads, Letterboxd or IMDb.'] };
}
