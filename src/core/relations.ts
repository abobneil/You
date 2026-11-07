// Suggested link labels, chosen by what the two cards are.
// Each label has two phrasings so it reads right from both cards:
//   "Health insurance Aetna PPO — provided through — Job Acme Corp"
//   "Job Acme Corp — provides — Health insurance Aetna PPO"
import type { AreaId } from './types';

/** [read from card A, read from card B] */
export type Label = [fwd: string, back: string];

/** A side matches a kind name ("Doctor") or a whole area ("area:people"). */
interface Rule { a: string[]; b: string[]; labels: Label[] }

const PEOPLE = 'area:people';
const GOALS = 'area:goals';

const RULES: Rule[] = [
  // Health
  { a: ['Health insurance'], b: ['Job'], labels: [['provided through', 'provides']] },
  { a: ['Doctor', 'Dentist'], b: ['Health insurance'], labels: [['covered by', 'covers']] },
  { a: ['Medication'], b: ['Condition'], labels: [['treats', 'treated with']] },
  { a: ['Medication'], b: ['Doctor', 'Dentist'], labels: [['prescribed by', 'prescribed']] },
  { a: ['Condition'], b: ['Doctor', 'Dentist'], labels: [['treated by', 'treats']] },
  { a: ['Emergency contact'], b: [PEOPLE], labels: [['is', 'is my emergency contact']] },
  // Home
  { a: ['Lease', 'Lease or mortgage'], b: ['Address'], labels: [['for', 'held under']] },
  { a: ['Mortgage', 'Lease or mortgage'], b: ['Property'], labels: [['on', 'financed by']] },
  { a: ['Address'], b: ['Property'], labels: [['owned as', 'lived in']] },
  { a: ['Utility', 'Internet'], b: ['Address', 'Property'], labels: [['at', 'has']] },
  { a: ['Home insurance'], b: ['Address', 'Property'], labels: [['insures', 'insured by']] },
  { a: [PEOPLE], b: ['Property', 'Mortgage'], labels: [['co-owns', 'co-owned with']] },
  { a: ['Vehicle'], b: ['Insurance policy'], labels: [['insured by', 'insures']] },
  // Money
  { a: ['Bill'], b: ['Bank account', 'Credit card'], labels: [['paid from', 'pays']] },
  { a: ['Bill'], b: ['Utility', 'Internet', 'Health insurance', 'Home insurance', 'Insurance policy', 'Lease', 'Mortgage', 'Lease or mortgage', 'Vehicle'],
    labels: [['for', 'paid with']] },
  { a: ['Retirement account', 'Investment', 'Insurance policy'], b: ['Job'], labels: [['through', 'provides']] },
  { a: ['Saving for'], b: ['Bank account', 'Investment', 'Retirement account'], labels: [['held in', 'holds savings for']] },
  // Work
  { a: ['Skill'], b: ['Job'], labels: [['used at', 'uses']] },
  { a: ['Skill'], b: ['Education', 'Certification'], labels: [['learned through', 'taught']] },
  { a: ['Certification'], b: ['Job'], labels: [['for', 'requires']] },
  { a: ['Mentor'], b: ['Job', 'Skill', 'Education'], labels: [['helped with', 'helped by']] },
  // People and the rest of life
  { a: [PEOPLE], b: ['Place visited'], labels: [['went to', 'with']] },
  { a: [PEOPLE], b: ['Place to go'], labels: [['wants to go to', 'with']] },
  { a: [PEOPLE], b: ['Hobby', 'Sport'], labels: [['enjoys', 'enjoyed with']] },
  { a: [PEOPLE], b: ['Book', 'Music', 'Movie or show', 'Food'], labels: [['recommended', 'recommended by'], ['shares', 'shared with']] },
  { a: [PEOPLE], b: ['Address'], labels: [['lives at', 'home of']] },
  { a: [PEOPLE], b: ['Job', 'Education'], labels: [['met at', 'where I met']] },
  { a: [PEOPLE], b: [PEOPLE], labels: [['related to', 'related to'], ['introduced me to', 'introduced by']] },
  // Goals
  { a: [GOALS], b: ['Skill', 'Education', 'Certification', 'Saving for', 'Place to go', 'Hobby', 'Sport', 'Book'],
    labels: [['supported by', 'supports']] },
  { a: ['Place to go'], b: ['Bucket list'], labels: [['on', 'includes']] },
];

export const FALLBACK: Label = ['related to', 'related to'];

const matches = (side: string[], area: AreaId, kind: string) => side.includes(kind) || side.includes(`area:${area}`);

/**
 * Labels that fit a link from card A (area, kind) to card B, read from A's side.
 * Always ends with the neutral "related to".
 */
export function suggestLabels(aArea: AreaId, aKind: string, bArea: AreaId, bKind: string): Label[] {
  const out: Label[] = [];
  const add = (l: Label) => { if (!out.some(x => x[0] === l[0] && x[1] === l[1])) out.push(l); };
  for (const r of RULES) {
    if (matches(r.a, aArea, aKind) && matches(r.b, bArea, bKind)) r.labels.forEach(add);
    if (matches(r.b, aArea, aKind) && matches(r.a, bArea, bKind)) r.labels.forEach(([f, b]) => add([b, f]));
  }
  add(FALLBACK);
  return out;
}

/** Facts about you (About) are already connected through you; linking two of them adds nothing. */
export const pointlessLink = (aArea: AreaId, bArea: AreaId) => aArea === 'about' && bArea === 'about';
