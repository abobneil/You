import type { FormatId } from './formats';
import type { AreaId } from './types';

export interface Area {
  id: AreaId;
  title: string;
  hint: string;
  /** Inner SVG markup for a 24×24 stroke icon. */
  icon: string;
  /** Suggested kinds of card. */
  kinds: Kind[];
}

export interface Kind {
  name: string;
  /** Kinds you can have several of (Allergy, Friend…) are added alongside by default; others replace. */
  many?: boolean;
  /**
   * false for facts about you rather than things that start on a date (Full name, Birthplace).
   * Their first card has no "since" date; replacing one asks when it changed.
   */
  dated?: boolean;
  /** 'date' when the value itself is a date (Birthday). It also becomes the card's since-date. */
  value?: 'text' | 'date';
  /** Formatting applied while typing (Phone → (919) 449-8524). See formats.ts. */
  format?: FormatId;
  /** Quick picks shown under the value; typing anything else still works. */
  choices?: string[];
  /** Hidden as •••-••-6789 everywhere, while typing too. Press and hold the eye icon to show it. */
  sensitive?: boolean;
}

const k = (name: string, many = false, extra: Partial<Kind> = {}): Kind => ({ name, many, ...extra });
/** A fact about you, not dated. */
const fact = (name: string, extra: Partial<Kind> = {}): Kind => ({ name, dated: false, ...extra });

export const AREAS: Area[] = [
  { id: 'about', title: 'About', hint: 'Birthday, contact, IDs',
    icon: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    kinds: [fact('Full name'), fact('Preferred name'), fact('Pronouns', { choices: ['she/her', 'he/him', 'they/them'] }),
      fact('Birthday', { value: 'date' }), fact('Birthplace'),
      k('Phone', true, { format: 'phone' }), k('Email', true, { format: 'email' }), k('Citizenship', true), fact('Language', { many: true }),
      k("Driver's license", false, { format: 'upper', sensitive: true }), k('Passport', false, { format: 'upper', sensitive: true }),
      fact('Social Security number', { format: 'ssn', sensitive: true })] },
  { id: 'health', title: 'Health', hint: 'Doctors, meds, records',
    icon: '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>',
    kinds: [k('Doctor'), k('Dentist'), fact('Blood type', { choices: ['A+', 'A−', 'B+', 'B−', 'AB+', 'AB−', 'O+', 'O−'] }), k('Allergy', true), k('Medication', true), k('Condition', true), k('Health insurance'), k('Emergency contact')] },
  { id: 'work', title: 'Work', hint: 'Jobs, skills, résumé',
    icon: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5h6v2M3 12h18"/>',
    kinds: [k('Job'), k('Skill', true), k('Education', true), k('Certification', true), k('Award', true), k('Profile link', true)] },
  { id: 'money', title: 'Money', hint: 'Accounts, bills, taxes',
    icon: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M16 14.5h2"/>',
    kinds: [k('Bank account', true), k('Credit card', true), k('Bill', true), k('Retirement account', true), k('Investment', true), k('Insurance policy', true), k('Tax preparer'), k('Saving for', true)] },
  { id: 'home', title: 'Home', hint: 'Addresses, lease, utilities',
    icon: '<path d="M4 11l8-7 8 7v9H4z"/><path d="M10 20v-5h4v5"/>',
    kinds: [k('Address'), k('Lease or mortgage'), k('Utility', true), k('Internet'), k('Home insurance'), k('Vehicle', true)] },
  { id: 'people', title: 'People', hint: 'Family, friends, contacts',
    icon: '<circle cx="9" cy="8" r="3.5"/><path d="M3 20a6 6 0 0 1 12 0"/><circle cx="17" cy="9" r="2.5"/><path d="M15.5 14.4A5 5 0 0 1 21 19"/>',
    kinds: [k('Partner'), k('Family member', true), k('Child', true), k('Friend', true), k('Pet', true), k('Mentor', true)] },
  { id: 'interests', title: 'Interests', hint: 'Books, music, places',
    icon: '<path d="M12 4l2.5 5 5.5.8-4 3.9.9 5.5L12 16.6l-4.9 2.6.9-5.5-4-3.9 5.5-.8z"/>',
    kinds: [k('Book', true), k('Music', true), k('Movie or show', true), k('Food', true), k('Hobby', true), k('Sport', true), k('Place visited', true), k('Place to go', true)] },
  { id: 'goals', title: 'Goals', hint: 'Plans, habits, someday',
    icon: '<path d="M5 21V4"/><path d="M5 4h12l-2.5 4L17 12H5"/>',
    kinds: [k('Goal', true), k('Habit', true), k('Learning', true), k('Someday', true), k('Bucket list', true), k('Value', true)] },
];

export const areaById = (id: string): Area | undefined => AREAS.find(a => a.id === id);
export const isAreaId = (id: string): id is AreaId => AREAS.some(a => a.id === id);

/** A kind's settings. Kinds the person invents are dated, text, and added alongside. */
export type KindInfo = Kind & { many: boolean; dated: boolean; value: 'text' | 'date' };
export function kindOf(area: AreaId, kind: string): KindInfo {
  const found = areaById(area)?.kinds.find(x => x.name === kind);
  return { ...found, name: kind, many: found ? !!found.many : true, dated: found?.dated ?? true, value: found?.value ?? 'text' };
}

export const isMany = (area: AreaId, kind: string) => kindOf(area, kind).many;
