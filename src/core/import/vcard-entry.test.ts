import {it,expect} from 'vitest';
import {parseVcf,defaultContactKind} from './vcard';
it('suggests organization, family and friend relationships', () => {
 const cards = parseVcf(`BEGIN:VCARD\nVERSION:3.0\nFN:Dentist Office\nORG:Dental Clinic\nEND:VCARD\nBEGIN:VCARD\nVERSION:3.0\nFN:Robin Lee\nN:Lee;Robin;;;\nEND:VCARD`);
 expect(defaultContactKind(cards[0], 'Lee')).toBe('Contact');
 expect(defaultContactKind(cards[1], 'Lee')).toBe('Family member');
 expect(defaultContactKind(cards[1], 'Kim')).toBe('Friend');
});
