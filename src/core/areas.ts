import type { FormatId } from './formats';
import type { AreaId, Profile } from './types';

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
  /** Sub-types with icons (a phone's Cell, Home, Work…). The first is the default. */
  tags?: Tag[];
  /** One line shown when adding this kind, when its meaning needs spelling out. */
  hint?: string;
  /** Structured details (a vehicle's Year, Make, Model…). All optional. */
  primary?: string[];
  fields?: Field[];
  /** Builds the card's name from its details while the name hasn't been typed by hand. */
  titleFrom?: (f: Record<string, string>) => string;
  /** Detail ids shown under the value on the card (a vehicle's plate). */
  summary?: string[];
}

/** One detail on a card. Stored as text in card.fields[id]. */
export interface Field {
  id: string;
  label: string;
  /** 'date' uses the Month / Day / Year picker and stores a fuzzy date. */
  type?: 'text' | 'date';
  format?: FormatId;
  choices?: string[];
  sensitive?: boolean;
  placeholder?: string;
  /** Offers a "Look up" button that fills in other details (a VIN fills year, make, model…). */
  lookup?: 'vin';
}

export interface Tag {
  id: string;
  label: string;
  /** Inner SVG markup for a 24×24 stroke icon. */
  icon: string;
}

const PHONE_TAGS: Tag[] = [
  { id: 'cell', label: 'Cell', icon: '<rect x="7" y="2.5" width="10" height="19" rx="2.2"/><path d="M11 18.2h2"/>' },
  { id: 'home', label: 'Home', icon: '<path d="M4 11l8-7 8 7"/><path d="M6 9.5V20h12V9.5"/><path d="M10 20v-5h4v5"/>' },
  { id: 'work', label: 'Work', icon: '<rect x="3" y="7.5" width="18" height="12.5" rx="2"/><path d="M9 7.5V5.5h6v2M3 12.5h18"/>' },
  { id: 'workcell', label: 'Work cell', icon: '<rect x="4" y="2.5" width="9.5" height="19" rx="2"/><path d="M7.7 18.2h2"/><rect x="13.5" y="12" width="8" height="6.5" rx="1.2"/><path d="M15.8 12v-1.5h3.4V12"/>' },
  { id: 'fax', label: 'Fax', icon: '<path d="M7 8V3h10v5"/><rect x="3" y="8" width="18" height="9" rx="2"/><rect x="7" y="14" width="10" height="7" rx="1"/>' },
  { id: 'other', label: 'Other', icon: '<path d="M5 4h3l2 5-2.5 1.5a11 11 0 0 0 5 5L14 13l5 2v3a2 2 0 0 1-2 2A15 15 0 0 1 3 6a2 2 0 0 1 2-2z"/>' },
];

const k = (name: string, many = false, extra: Partial<Kind> = {}): Kind => ({ name, many, ...extra, primary: extra.primary ?? extra.fields?.slice(0, 2).map(f => f.id) });

/** Builds a Field: f('vin', 'VIN', { format: 'vin', sensitive: true }). */
const f = (id: string, label: string, extra: Partial<Field> = {}): Field => ({ id, label, ...extra });
const date = (id: string, label: string) => f(id, label, { type: 'date' });
const money = (id: string, label: string) => f(id, label, { format: 'money', placeholder: '$0' });
const phone = f('phone', 'Phone', { format: 'phone' });
const email = f('email', 'Email', { format: 'email' });
const account = (label = 'Account number') => f('account', label, { sensitive: true, format: 'upper' });
/** Joins the non-empty parts with spaces. */
const join = (...parts: (string | undefined)[]) => parts.filter(x => x && x.trim()).join(' ').trim();
/** Joins the non-empty parts with commas: "Raleigh, NC, United States". */
const joinComma = (...parts: (string | undefined)[]) => parts.filter(x => x && x.trim()).join(', ').trim();
/** Contact details shared by the people kinds. */
const CONTACT = [phone, email, date('birthday', 'Birthday'), f('address', 'Address')];
const rating = f('rating', 'Rating', { choices: ['★', '★★', '★★★', '★★★★', '★★★★★'] });
/** A fact about you, not dated. */
const fact = (name: string, extra: Partial<Kind> = {}): Kind => ({ name, dated: false, ...extra });

export const AREAS: Area[] = [
  { id: 'about', title: 'About', hint: 'Birthday, contact, IDs',
    icon: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    kinds: [
      fact('Full name', { fields: [f('first', 'First'), f('middle', 'Middle'), f('last', 'Last'), f('suffix', 'Suffix', { choices: ['Jr.', 'Sr.', 'II', 'III'] })],
        titleFrom: x => join(x.first, x.middle, x.last, x.suffix) }),
      fact('Preferred name'),
      fact('Pronouns', { choices: ['she/her', 'he/him', 'they/them'] }),
      fact('Birthday', { value: 'date', fields: [f('time', 'Time of birth', { placeholder: '7:42 AM' })] }),
      fact('Birthplace', { fields: [f('hospital', 'Hospital'), f('city', 'City'), f('state', 'State or province'), f('country', 'Country')],
        titleFrom: x => joinComma(x.city, x.state, x.country) }),
      k('Phone', true, { format: 'phone', tags: PHONE_TAGS }),
      k('Email', true, { format: 'email', fields: [f('use', 'Used for', { choices: ['Personal', 'Work', 'School', 'Shopping'] })], summary: ['use'] }),
      k('Citizenship', true, { fields: [f('how', 'How', { choices: ['By birth', 'Naturalized', 'By descent'] }),
        f('certificate', 'Certificate number', { sensitive: true, format: 'upper' })], summary: ['how'] }),
      fact('Language', { many: true, fields: [f('level', 'Level', { choices: ['Native', 'Fluent', 'Conversational', 'Learning'] })], summary: ['level'] }),
      k("Driver's license", false, { format: 'upper', sensitive: true,
        fields: [f('state', 'State', { format: 'upper', placeholder: 'NC' }), f('class', 'Class', { format: 'upper', placeholder: 'C' }),
          f('restrictions', 'Restrictions or endorsements'), date('issued', 'Issued'), date('expires', 'Expires')],
        summary: ['state', 'expires'] }),
      k('Passport', false, { format: 'upper', sensitive: true,
        fields: [f('country', 'Country', { placeholder: 'United States' }), date('issued', 'Issued'), date('expires', 'Expires'),
          f('card', 'Passport card number', { sensitive: true, format: 'upper' })],
        summary: ['country', 'expires'] }),
      fact('Social Security number', { format: 'ssn', sensitive: true })] },

  { id: 'health', title: 'Health', hint: 'Doctors, meds, records',
    icon: '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>',
    kinds: [
      k('Doctor', true, { fields: [f('specialty', 'Specialty', { choices: ['Primary care', 'Pediatrics', 'OB/GYN', 'Cardiology', 'Dermatology', 'Eye care', 'Mental health', 'Other'] }),
          f('practice', 'Practice'), phone, f('address', 'Address'), f('portal', 'Patient portal', { placeholder: 'mychart.example.org' })],
        summary: ['specialty', 'practice'] }),
      k('Dentist', false, { fields: [f('practice', 'Practice'), phone, f('address', 'Address'), f('portal', 'Patient portal')], summary: ['practice'] }),
      fact('Blood type', { choices: ['A+', 'A−', 'B+', 'B−', 'AB+', 'AB−', 'O+', 'O−'] }),
      k('Allergy', true, { fields: [f('type', 'Type', { choices: ['Medication', 'Food', 'Environmental', 'Insect', 'Other'] }),
        f('reaction', 'Reaction', { placeholder: 'Hives' }), f('severity', 'Severity', { choices: ['Mild', 'Moderate', 'Severe'] })],
        summary: ['severity', 'type'] }),
      k('Medication', true, { fields: [f('dose', 'Dose', { placeholder: '10 mg' }), f('often', 'How often', { choices: ['Daily', 'Twice a day', 'Weekly', 'As needed'] }),
        f('for', 'Taken for'), f('prescriber', 'Prescribed by'), f('pharmacy', 'Pharmacy'), f('rx', 'Rx number', { format: 'upper' })],
        summary: ['dose', 'often'] }),
      k('Immunization', true, { hint: 'Date it with when you got it.', fields: [f('dose', 'Dose', { placeholder: 'Dose 2' }), f('givenAt', 'Given at')], summary: ['dose'] }),
      k('Condition', true, { fields: [f('treatedBy', 'Treated by'), f('notes', 'Notes')], summary: ['treatedBy'] }),
      k('Health insurance', false, { fields: [f('insurer', 'Insurer', { placeholder: 'Aetna' }), f('plan', 'Plan', { placeholder: 'PPO' }),
          f('through', 'Through', { choices: ['Employer', 'Marketplace', 'Medicare', 'Medicaid', 'Private'] }),
          f('member', 'Member ID', { sensitive: true, format: 'upper' }), f('group', 'Group number', { format: 'upper' }), phone],
        titleFrom: x => join(x.insurer, x.plan), summary: ['through'] }),
      k('Emergency contact', true, { fields: [f('relationship', 'Relationship'), phone, f('altPhone', 'Other phone', { format: 'phone' }), email],
        summary: ['relationship', 'phone'] })] },

  { id: 'work', title: 'Work', hint: 'Jobs, skills, résumé',
    icon: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5h6v2M3 12h18"/>',
    kinds: [
      k('Job', true, { primary: ['employer', 'title'], fields: [f('title', 'Job title'), f('employer', 'Employer'),
          f('type', 'Type', { choices: ['Full-time', 'Part-time', 'Contract', 'Self-employed', 'Internship'] }),
          f('location', 'Location'), money('salary', 'Salary'), f('manager', 'Manager'), f('workEmail', 'Work email', { format: 'email' })],
        titleFrom: x => (x.title && x.employer ? `${x.title} at ${x.employer}` : join(x.title, x.employer)), summary: ['location', 'type'] }),
      k('Skill', true, { fields: [f('level', 'Level', { choices: ['Learning', 'Comfortable', 'Expert'] }), f('years', 'Years of experience', { format: 'number' })],
        summary: ['level'] }),
      k('Education', true, { fields: [f('school', 'School'),
          f('degree', 'Degree', { choices: ['High school', 'Associate', 'Bachelor’s', 'Master’s', 'Doctorate', 'Certificate'] }),
          f('field', 'Field of study'), f('location', 'Location'), f('honors', 'Honors')],
        titleFrom: x => (x.degree && x.school ? `${x.degree}, ${x.school}` : join(x.degree, x.school)), summary: ['field'] }),
      k('Certification', true, { fields: [f('issuer', 'Issued by'), f('number', 'Certificate number', { format: 'upper' }), date('expires', 'Expires')],
        summary: ['issuer', 'expires'] }),
      k('Award', true, { fields: [f('from', 'From'), f('for', 'For')], summary: ['from'] }),
      k('Profile link', true, { fields: [f('site', 'Site', { choices: ['LinkedIn', 'GitHub', 'Portfolio', 'Personal site', 'Other'] })], summary: ['site'] })] },

  { id: 'money', title: 'Money', hint: 'Accounts, bills, taxes',
    icon: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M16 14.5h2"/>',
    kinds: [
      k('Bank account', true, { fields: [f('bank', 'Bank'), f('type', 'Type', { choices: ['Checking', 'Savings', 'Money market', 'CD'] }),
          f('owner', 'Ownership', { choices: ['Individual', 'Joint', 'Business', 'Trust'] }), account(), f('routing', 'Routing number', { format: 'number' })],
        titleFrom: x => join(x.bank, x.type), summary: ['type', 'owner'] }),
      k('Credit card', true, { fields: [f('issuer', 'Issuer'), f('network', 'Network', { choices: ['Visa', 'Mastercard', 'American Express', 'Discover'] }),
          f('last4', 'Last 4 digits', { format: 'number' }), date('expires', 'Expires'), money('limit', 'Credit limit')],
        titleFrom: x => (x.issuer && x.last4 ? `${x.issuer} ••${x.last4}` : x.issuer ?? ''), summary: ['network', 'last4'] }),
      k('Bill', true, { fields: [f('payee', 'Paid to'), money('amount', 'Amount'), f('frequency', 'How often', { choices: ['Monthly', 'Quarterly', 'Yearly', 'Weekly'] }),
          f('due', 'Due day', { format: 'number', placeholder: '15' }), f('autopay', 'Autopay', { choices: ['Yes', 'No'] }), f('paidFrom', 'Paid from')],
        titleFrom: x => x.payee ?? '', summary: ['amount', 'frequency'] }),
      k('Retirement account', true, { fields: [f('provider', 'Provider'), f('type', 'Type', { choices: ['401(k)', '403(b)', 'IRA', 'Roth IRA', 'Pension', 'HSA'] }),
          f('employer', 'Through employer'), account(), f('beneficiary', 'Beneficiary')],
        titleFrom: x => join(x.provider, x.type), summary: ['type'] }),
      k('Investment', true, { fields: [f('provider', 'Provider'), f('type', 'Type', { choices: ['Brokerage', '529', 'Crypto', 'Real estate', 'Other'] }),
          account(), f('beneficiary', 'Beneficiary')],
        titleFrom: x => join(x.provider, x.type), summary: ['type'] }),
      k('Insurance policy', true, { fields: [f('insurer', 'Insurer'), f('type', 'Type', { choices: ['Auto', 'Life', 'Umbrella', 'Disability', 'Pet', 'Other'] }),
          account('Policy number'), money('premium', 'Premium'), money('coverage', 'Coverage amount'), f('beneficiary', 'Beneficiary'), date('renews', 'Renews')],
        titleFrom: x => join(x.insurer, x.type), summary: ['type', 'renews'] }),
      k('Tax preparer', false, { fields: [f('firm', 'Firm'), phone, email, f('address', 'Address'), money('fee', 'Fee')], summary: ['firm'] }),
      k('Saving for', true, { fields: [money('target', 'Goal amount'), money('saved', 'Saved so far'), date('by', 'Target date'), f('account', 'Kept in')],
        summary: ['saved', 'target'] })] },

  { id: 'home', title: 'Home', hint: 'Where you live, what you own',
    icon: '<path d="M4 11l8-7 8 7v9H4z"/><path d="M10 20v-5h4v5"/>',
    kinds: [
      k('Address', false, { primary: ['street', 'city'], hint: 'Where you live. Moving replaces it, so the places you’ve lived stay in your history.',
        fields: [f('street', 'Street', { placeholder: 'e.g. 12 Elm St' }), f('unit', 'Apt / unit'), f('city', 'City'),
          f('state', 'State', { format: 'upper', placeholder: 'NC' }), f('zip', 'ZIP', { format: 'zip' }), f('country', 'Country')],
        titleFrom: x => join(x.street, x.unit), summary: ['city', 'state'] }),
      k('Property', true, { hint: 'A place you own. Add it when you buy; end it when you sell. It doesn’t have to be where you live.',
        fields: [f('street', 'Street', { placeholder: 'e.g. 48 Oak Ave' }), f('unit', 'Apt / unit'), f('city', 'City'),
          f('state', 'State', { format: 'upper', placeholder: 'NC' }), f('zip', 'ZIP', { format: 'zip' }), f('country', 'Country'),
          f('use', 'Used as', { choices: ['Primary home', 'Rental', 'Vacation home', 'Land', 'Other'] }),
          f('type', 'Type', { choices: ['House', 'Condo', 'Townhouse', 'Land', 'Other'] }), money('price', 'Purchase price'),
          f('parcel', 'Parcel ID', { format: 'upper' }), f('built', 'Year built', { format: 'year' }), f('sqft', 'Square feet', { format: 'number' }),
          f('lot', 'Lot size (acres)', { format: 'number' }), f('beds', 'Bedrooms', { format: 'number' }), f('baths', 'Bathrooms', { format: 'number' }),
          money('tax', 'Property tax (yearly)')],
        titleFrom: x => join(x.street, x.unit), summary: ['city', 'use'] }),
      k('Mortgage', true, { hint: 'The loan itself, like the lender and terms. Link it to the property it’s for.',
        fields: [f('lender', 'Lender'), f('type', 'Type', { choices: ['Fixed', 'Adjustable', 'FHA', 'VA', 'HELOC'] }), account('Loan number'),
          money('amount', 'Original amount'), f('rate', 'Rate (%)', { format: 'number', placeholder: '6.25' }),
          f('term', 'Term (years)', { format: 'number', placeholder: '30' }), money('payment', 'Monthly payment'), f('escrow', 'Escrow', { choices: ['Yes', 'No'] })],
        titleFrom: x => (x.lender && x.term ? `${x.lender} ${x.term}-yr` : x.lender ?? ''), summary: ['payment'] }),
      k('Lease', false, { hint: 'Your rental agreement. Link it to the address it’s for.',
        fields: [f('landlord', 'Landlord'), phone, money('rent', 'Monthly rent'), f('due', 'Rent due day', { format: 'number', placeholder: '1' }),
          money('deposit', 'Deposit'), date('ends', 'Lease ends')],
        summary: ['rent', 'ends'] }),
      k('Utility', true, { fields: [f('service', 'Service', { choices: ['Electric', 'Water', 'Gas', 'Trash', 'Sewer'] }), f('provider', 'Provider'),
          account(), phone],
        titleFrom: x => join(x.provider, x.service), summary: ['service'] }),
      k('Internet', false, { fields: [f('provider', 'Provider'), f('plan', 'Plan'), account(), f('wifi', 'Wi‑Fi name'),
          f('wifiPassword', 'Wi‑Fi password', { sensitive: true })],
        titleFrom: x => join(x.provider, x.plan), summary: ['plan'] }),
      k('Home insurance', true, { fields: [f('insurer', 'Insurer'), account('Policy number'), money('premium', 'Yearly premium'),
          money('coverage', 'Dwelling coverage'), money('deductible', 'Deductible'), f('agent', 'Agent phone', { format: 'phone' }), date('renews', 'Renews')],
        titleFrom: x => x.insurer ?? '', summary: ['premium', 'renews'] }),
      k('Vehicle', true, {
        fields: [f('year', 'Year', { format: 'year' }), f('make', 'Make', { placeholder: 'Kia' }), f('model', 'Model', { placeholder: 'Niro' }),
          f('trim', 'Trim', { placeholder: 'PHEV' }), f('color', 'Color'),
          f('fuel', 'Fuel', { choices: ['Gas', 'Hybrid', 'Plug-in hybrid', 'Electric', 'Diesel'] }),
          f('vin', 'VIN', { format: 'vin', sensitive: true, lookup: 'vin' }), f('plate', 'License plate', { format: 'upper' }),
          f('plateState', 'Plate state', { format: 'upper', placeholder: 'NC' }), date('registration', 'Registration expires'),
          money('price', 'Purchase price'), f('mileage', 'Mileage at purchase', { format: 'number' })],
        titleFrom: x => join(x.year, x.color, x.make, x.model, x.trim), summary: ['plate'] })] },

  { id: 'people', title: 'People', hint: 'Family, friends, contacts',
    icon: '<circle cx="9" cy="8" r="3.5"/><path d="M3 20a6 6 0 0 1 12 0"/><circle cx="17" cy="9" r="2.5"/><path d="M15.5 14.4A5 5 0 0 1 21 19"/>',
    kinds: [
      k('Partner', false, { fields: [...CONTACT, date('anniversary', 'Anniversary')], summary: ['phone'] }),
      k('Family member', true, { fields: [f('relationship', 'Relationship',
          { choices: ['Mother', 'Father', 'Sister', 'Brother', 'Grandparent', 'Aunt', 'Uncle', 'Cousin', 'In-law', 'Other'] }), ...CONTACT],
        summary: ['relationship'] }),
      k('Child', true, { fields: [...CONTACT, f('school', 'School')], summary: ['birthday'] }),
      k('Friend', true, { fields: [...CONTACT, f('met', 'How we met')], summary: ['phone'] }),
      k('Pet', true, { fields: [f('species', 'Species', { choices: ['Dog', 'Cat', 'Bird', 'Fish', 'Other'] }), f('breed', 'Breed'), f('color', 'Color'),
          date('birthday', 'Birthday'), f('vet', 'Vet'), f('microchip', 'Microchip number', { format: 'upper' }), f('from', 'Adopted from')],
        summary: ['species', 'breed'] }),
      k('Mentor', true, { fields: [f('field', 'Helps with'), f('organization', 'Organization'), phone, email], summary: ['field'] })] },

  { id: 'interests', title: 'Interests', hint: 'Books, music, places',
    icon: '<path d="M12 4l2.5 5 5.5.8-4 3.9.9 5.5L12 16.6l-4.9 2.6.9-5.5-4-3.9 5.5-.8z"/>',
    kinds: [
      k('Book', true, { fields: [f('author', 'Author'), f('status', 'Status', { choices: ['Want to read', 'Reading', 'Read'] }), rating,
          f('audibleStatus', 'Audible reading status'), f('audibleOwnership', 'Audible ownership'), f('audiblePosition', 'Audible position'),
          date('audibleFinished', 'Finished on Audible'), f('audibleAsin', 'Audible ASIN')],
        summary: ['author', 'audibleStatus', 'audibleOwnership', 'rating'] }),
      k('Music', true, { fields: [f('type', 'Type', { choices: ['Artist', 'Album', 'Song'] }), f('artist', 'Artist'), f('genre', 'Genre'),
          f('service', 'Listened on', { choices: ['Spotify', 'Apple Music', 'YouTube Music', 'Radio', 'Vinyl', 'CD'] }),
          f('plays', 'Plays', { format: 'number' }), f('time', 'Time listened'), date('lastPlayed', 'Last played')],
        summary: ['artist', 'genre', 'service'] }),
      k('Movie or show', true, { fields: [f('type', 'Type', { choices: ['Movie', 'Show'] }), f('year', 'Year', { format: 'year' }),
          f('status', 'Status', { choices: ['Want to watch', 'Watching', 'Watched'] }), rating,
          f('service', 'Watched on', { choices: ['Netflix', 'Prime Video', 'Disney+', 'Hulu', 'Max', 'Apple TV+', 'Theater'] }),
          f('episodes', 'Episodes watched', { format: 'number' }), date('lastWatched', 'Last watched')],
        summary: ['type', 'service', 'rating'] }),
      k('Podcast', true, { fields: [f('host', 'Host'), f('service', 'Listened on', { choices: ['Spotify', 'Apple Podcasts', 'YouTube', 'Pocket Casts', 'Overcast'] }),
          f('episodes', 'Episodes played', { format: 'number' }), f('time', 'Time listened'), date('lastPlayed', 'Last played')],
        summary: ['host', 'service'] }),
      k('Food', true, { fields: [f('type', 'Type', { choices: ['Dish', 'Restaurant', 'Cuisine'] }), f('where', 'Where')], summary: ['type'] }),
      k('Hobby', true, { fields: [f('level', 'Level', { choices: ['Just started', 'Getting good', 'Expert'] }), f('often', 'How often')], summary: ['level'] }),
      k('Sport', true, { fields: [f('how', 'Play or watch', { choices: ['Play', 'Watch', 'Both'] }), f('team', 'Team')], summary: ['how', 'team'] }),
      k('Place visited', true, { fields: [f('with', 'With'), f('highlight', 'Highlight'), f('notes', 'Notes')], summary: ['with'] }),
      k('Place to go', true, { fields: [f('why', 'Why'), date('when', 'Hoping to go'), f('with', 'With')], summary: ['when'] })] },

  { id: 'goals', title: 'Goals', hint: 'Plans, habits, someday',
    icon: '<path d="M5 21V4"/><path d="M5 4h12l-2.5 4L17 12H5"/>',
    kinds: [
      k('Goal', true, { fields: [date('by', 'By'), f('status', 'Status', { choices: ['Not started', 'In progress', 'Done'] }), f('why', 'Why'), f('next', 'Next step')],
        summary: ['status', 'by'] }),
      k('Habit', true, { fields: [f('often', 'How often', { choices: ['Daily', 'Weekly', 'Monthly'] }), f('direction', 'Building or breaking', { choices: ['Building', 'Breaking'] }), f('why', 'Why')],
        summary: ['often', 'direction'] }),
      k('Learning', true, { fields: [f('source', 'Through', { placeholder: 'Course, book, teacher' }), f('progress', 'Progress', { choices: ['Starting', 'Halfway', 'Almost done', 'Done'] })],
        summary: ['progress'] }),
      k('Someday', true, { fields: [f('why', 'Why')] }),
      k('Bucket list', true, { fields: [f('status', 'Status', { choices: ['Not yet', 'Planned', 'Done'] }), f('where', 'Where'), f('with', 'With')],
        summary: ['status'] }),
      k('Value', true, { fields: [f('why', 'Why it matters')] })] },
];

// Checklist additions preserve every existing saved kind and field id.
const extend = (area: AreaId, name: string, fields: Field[], hint?: string) => {
  const kind = AREAS.find(a => a.id === area)!.kinds.find(k => k.name === name)!;
  kind.fields = [...(kind.fields ?? []), ...fields];
  if (hint) kind.hint = hint;
};
const offer = (area: AreaId, name: string, fields: Field[], hint?: string) =>
  AREAS.find(a => a.id === area)!.kinds.push(k(name, true, { fields, hint }));
extend('about', 'Full name', [f('type', 'Name kind', { choices: ['Birth', 'Married', 'Changed'] })]);
extend('about', 'Full name', [date('since', 'Name used since')]);
offer('about', 'Former name', [f('type', 'Name kind', { choices: ['Birth', 'Married', 'Changed'] })]);
offer('about', 'Identity document', [f('type', 'Type', { choices: ['Passport', "Driver's licence", 'National ID'] }), f('number', 'Number', { sensitive: true }), f('issuer', 'Issuer'), date('issued', 'Issued'), date('expires', 'Expires')]);
extend('about', 'Birthday', [f('place', 'Birthplace')]);
for (const name of ['Passport', "Driver's license"]) extend('about', name, [f('issuer', 'Issuer')]);
extend('health', 'Medication', [f('status', 'Status', { choices: ['Taking', 'Ended', 'As needed'] })]);
offer('health', 'Procedure or hospital stay', [f('what', 'Procedure or treatment'), f('where', 'Hospital or clinic'), date('date', 'Date')]);
offer('health', 'Measurement', [f('type', 'Measurement', { choices: ['Height', 'Weight'] }), f('amount', 'Value', { format: 'number' }), f('unit', 'Unit', { choices: ['cm', 'ft / in', 'kg', 'lb'] }), date('date', 'Measured on')]);
offer('health', 'Care wishes', [f('type', 'Choice', { choices: ['Advance directive', 'Organ donor'] }), f('wish', 'Your wishes'), f('document', 'Document kept at')]);
offer('health', 'Family health history', [f('condition', 'Condition')], 'Link the relative this condition concerns.');
extend('health', 'Doctor', [], 'Add a specialty or phone; link any conditions they help with.');
extend('health', 'Emergency contact', [], 'Add a relationship or phone, and link the person.');
AREAS.find(a => a.id === 'work')!.kinds.find(k => k.name === 'Certification')!.fields!.find(f => f.id === 'number')!.sensitive = true;
offer('work', 'Military service', [f('branch', 'Branch'), f('rank', 'Rank')]);
offer('work', 'Volunteering', [f('organization', 'Organization'), f('role', 'Role')]);
offer('money', 'Loan or debt', [f('lender', 'Lender'), f('type', 'Type', { choices: ['Mortgage', 'Car', 'Student', 'Personal', 'Other'] }), money('amount', 'Amount'), account('Loan number')]);
extend('money', 'Credit card', [f('number', 'Card number', { sensitive: true })]);
offer('money', 'Income', [f('source', 'Source'), money('amount', 'Amount')]);
offer('money', 'Tax record', [f('year', 'Tax year', { format: 'year' }), f('preparer', 'Prepared by'), f('document', 'Return kept at')]);
extend('home', 'Address', [f('tenure', 'Owned or rented', { choices: ['Owned', 'Rented', 'Other'] })]);
offer('home', 'Possession', [f('description', 'Description'), date('acquired', 'Acquired')]);
const pet = AREAS.find(a => a.id === 'people')!.kinds.find(k => k.name === 'Pet')!;
AREAS.find(a => a.id === 'home')!.kinds.push({ ...pet }); // People remains readable for older records.
extend('people', 'Partner', [f('relationship', 'Relationship', { choices: ['Dating', 'Engaged', 'Married', 'Separated', 'Divorced', 'Widowed'] })], 'Link the person; date when this relationship began or ended.');
offer('people', 'Important date', [f('type', 'Occasion', { choices: ['Birthday', 'Anniversary', 'Death', 'Other'] }), date('date', 'Date')], 'Link the person this date remembers.');
for (const name of ['Family member', 'Child', 'Friend']) extend('people', name, [], 'Add their details and link any related people.');
extend('interests', 'Book', [date('read', 'Date read')]);
extend('interests', 'Movie or show', [date('watched', 'Date watched')]);
AREAS.find(a => a.id === 'goals')!.kinds.find(k => k.name === 'Goal')!.fields!.find(f => f.id === 'status')!.choices!.push('Achieved', 'Dropped');
offer('goals', 'Milestone', [date('date', 'Date')]);
offer('goals', 'Wishes for after death', [f('funeral', 'Funeral wishes'), f('bequests', 'Bequests'), f('will', 'Will kept at')]);
for (const area of AREAS) for (const kind of area.kinds) kind.hint ??= kind.fields?.length
  ? `Add ${kind.fields.slice(0, 2).map(f => f.label.toLowerCase()).join(' or ')} if useful; every detail is optional.`
  : `Record ${kind.name.toLowerCase()} in your own words.`;

export const areaById = (id: string): Area | undefined => AREAS.find(a => a.id === id);
export const isAreaId = (id: string): id is AreaId => AREAS.some(a => a.id === id);

/** A kind's settings. Kinds the person invents are dated, text, and added alongside. */
export type KindInfo = Kind & { many: boolean; dated: boolean; value: 'text' | 'date' };
export function kindOf(area: AreaId, kind: string, profile?: Profile): KindInfo {
  // Kinds the person named match however they were capitalized ("gizmo" and "Gizmo" are one kind).
  const found: Kind | undefined = areaById(area)?.kinds.find(x => x.name === kind)
    ?? profile?.kinds?.find(x => x.area === area && x.name.trim().toLowerCase() === kind.trim().toLowerCase());
  return { ...found, name: kind, many: found ? !!found.many : true, dated: found?.dated ?? true, value: found?.value ?? 'text' };
}

export const isMany = (area: AreaId, kind: string) => kindOf(area, kind).many;

/** A card's tag (Cell, Home…), if its kind has tags. Unknown or missing tags fall back to none. */
export function tagOf(c: { area: AreaId; kind: string; tag?: string }): Tag | undefined {
  return c.tag ? kindOf(c.area, c.kind).tags?.find(t => t.id === c.tag) : undefined;
}

/** "Phone · Work cell", or just "Phone" when there's no tag. */
export function kindLabel(c: { area: AreaId; kind: string; tag?: string }): string {
  const t = tagOf(c);
  return t ? `${c.kind} · ${t.label}` : c.kind;
}
