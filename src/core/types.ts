export type AreaId = 'about' | 'health' | 'work' | 'money' | 'home' | 'people' | 'interests' | 'goals';

/**
 * A date as precise as the person remembers it: "2009", "2021-03" or "2021-03-14".
 * Empty string means unknown.
 */
export type FuzzyDate = string;

export interface Revision {
  /** Which detail changed, or absent for the card's main value. */
  field?: string;
  value: string;
  /** ISO timestamp of when the old wording was replaced. */
  at: string;
}

/** One piece of information about a person. Cards are never overwritten, only replaced or ended. */
export interface Card {
  id: string;
  area: AreaId;
  kind: string;
  value: string;
  /** A sub-type picked from the kind's tags, e.g. a phone's "cell", "home" or "work". */
  tag?: string;
  /** Structured details, keyed by Field id (a vehicle's year, make, vin…). */
  fields?: Record<string, string>;
  /** When this became true in the person's life. */
  since: FuzzyDate;
  /** When it stopped being true. Only set once the card is in history. */
  until?: FuzzyDate;
  status: 'active' | 'past';
  /** ISO timestamp of when the card was added to You. */
  recordedAt: string;
  /** The card this one took over from. */
  replaces?: string;
  /** The card that took over from this one. */
  replacedBy?: string;
  /** Where the card came from when it was imported ("LinkedIn"), and when. */
  source?: { from: string; at: string };
  /** Earlier wording, kept when a typo is corrected. */
  revisions: Revision[];
}

/** A connection between two cards. `fwd` reads from card a, `back` reads from card b. */
export interface Link {
  id: string;
  a: string;
  b: string;
  fwd: string;
  back: string;
}

export interface Profile {
  /** Stable id for this You, so a file loaded later matches the same You in the browser. */
  id?: string;
  name: string;
  cards: Card[];
  links: Link[];
  updatedAt?: string;
}
