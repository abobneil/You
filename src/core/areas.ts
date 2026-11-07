import type { AreaId } from './types';

export interface Area {
  id: AreaId;
  title: string;
  hint: string;
  /** Inner SVG markup for a 24×24 stroke icon. */
  icon: string;
  /**
   * Suggested kinds of card. `many: true` kinds (Allergy, Friend…) are added alongside by default;
   * the rest (Doctor, Address…) replace the current card by default.
   */
  kinds: { name: string; many?: boolean }[];
}

const k = (name: string, many = false) => ({ name, many });

export const AREAS: Area[] = [
  { id: 'about', title: 'About', hint: 'Birthday, contact, IDs',
    icon: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    kinds: [k('Full name'), k('Preferred name'), k('Birthday'), k('Birthplace'), k('Phone', true), k('Email', true), k("Driver's license"), k('Passport')] },
  { id: 'health', title: 'Health', hint: 'Doctors, meds, records',
    icon: '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>',
    kinds: [k('Doctor'), k('Dentist'), k('Blood type'), k('Allergy', true), k('Medication', true), k('Condition', true), k('Health insurance'), k('Emergency contact')] },
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

/** Kinds the person invents themselves default to "add alongside". */
export function isMany(area: AreaId, kind: string): boolean {
  const found = areaById(area)?.kinds.find(x => x.name === kind);
  return found ? !!found.many : true;
}

/**
 * Suggested link labels, phrased from each side:
 * "Aetna PPO through Acme Corp" / "Acme Corp provides Aetna PPO".
 */
export const LINK_LABELS: [fwd: string, back: string][] = [
  ['through', 'provides'], ['covers', 'covered by'], ['with', 'with'],
  ['at', 'location of'], ['part of', 'includes'], ['for', 'has'],
];
