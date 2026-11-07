// Which import sources make sense from inside each area (shown as an "Import…" button there).
export type SourceId = 'contacts' | 'linkedin' | 'license' | 'vehicle' | 'health' | 'media';

export const SOURCES_FOR_AREA: Record<string, SourceId[]> = {
  about: ['license', 'contacts', 'linkedin'], health: ['health'], work: ['linkedin'], money: [],
  home: ['vehicle', 'license'], people: ['contacts'], interests: ['media'], goals: [],
};

/** Opens the import screen. The importers load only now, keeping the app's first load small. */
export const openImport = (only?: SourceId[]) => import('./hub').then(m => m.openImportHub(only));
