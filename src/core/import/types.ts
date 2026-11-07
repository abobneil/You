// Shared shapes for importing. Every source turns its file into rows; each row builds the cards it
// would add. Nothing is added until the person reviews the rows and confirms.
import type { AreaId, FuzzyDate } from '../types';

/** A card an import would like to add (or use to fill in an existing card). */
export interface Proposal {
  area: AreaId;
  kind: string;
  value: string;
  since?: FuzzyDate;
  /** Set for things that are over (a past job): the card goes straight into history. */
  until?: FuzzyDate;
  past?: boolean;
  tag?: string;
  fields?: Record<string, string>;
  /** Stable source identity and snapshot time for a reviewed, repeatable sync. */
  sync?: { source: string; id: string; at: string };
}

/** One line in the review list. A contact is one row even if it becomes several cards. */
export interface ImportRow {
  id: string;
  /** Heading the row is listed under ("Jobs", "Contacts"). */
  group: string;
  label: string;
  /** Small text under the label (dates, a phone number). */
  sub?: string;
  /** Alternatives the person can pick between, like which kind of person a contact is. */
  options?: { id: string; label: string }[];
  choice?: string;
  /** Starts unticked when false (an artist you rarely played). New rows are ticked by default. */
  on?: boolean;
  build: (choice?: string) => Proposal[];
}

export interface ImportResult {
  rows: ImportRow[];
  /** Shown above the list when something in the file couldn't be used. */
  notes?: string[];
}
