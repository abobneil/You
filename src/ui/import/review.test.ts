import { it, expect, vi } from 'vitest';
import { emptyProfile } from '../../core/profile';
import { applyProposals } from '../../core/import/match';
const h=vi.hoisted(()=>({html:'',handlers:{} as Record<string,(b?:any)=>void>}));
vi.mock('../sheet',()=>({openSheet:(html:string,handlers:any)=>{h.html=html;h.handlers=handlers;},closeSheet:vi.fn(),sheetTop:()=>''}));
vi.mock('../../state',()=>({profile:emptyProfile(),save:vi.fn()}));
import { profile, save } from '../../state';
import { openReview } from './review';
it('shows overwrites, defaults ambiguous names separate, allows selection and leaves Cancel untouched',()=>{
 profile.cards=[];
 const p={area:'interests' as const,kind:'Book',value:'Fable Moon',fields:{author:'Original'},sync:{source:'Fixture',id:'1',at:'2020'}};
 applyProposals(profile,[p],'Fixture');
 const before=JSON.stringify(profile);
 openReview('Fixture',{rows:[{id:'1',group:'Books',label:'Fable Moon',build:()=>[{...p,fields:{author:'Changed'},sync:{...p.sync,at:'2021'}}]}],notes:['Skipped 2 unsupported entries.']});
 expect(h.html).toContain('Original → Changed');expect(h.html).toContain('Skipped 2');expect(h.html).toContain('Already there (0)');
 expect(JSON.stringify(profile)).toBe(before);expect(save).not.toHaveBeenCalled();
 h.handlers.none();expect(h.html).toContain('Apply to 0 cards');expect(JSON.stringify(profile)).toBe(before);
 h.handlers.all();expect(h.html).toContain('Apply to 1 cards');
 h.handlers.add();expect(profile.cards[0].fields?.author).toBe('Changed');expect(save).toHaveBeenCalledOnce();
});

import { contactAsMe, contactRows, parseVcf } from '../../core/import/vcard';
it('preselects This is me and lists a repeated contact as already there', () => {
 profile.cards = [];
 const contacts = parseVcf('BEGIN:VCARD\nUID:alex\nFN:Alex Kim\nEMAIL:alex@example.com\nEND:VCARD');
 applyProposals(profile, contactAsMe(contacts[0]), 'Contacts');
 openReview('Contacts', contactRows(contacts));
 expect(h.html).toContain('Already there (1)');
 expect(h.html).toContain('value="me" selected');
 expect(h.html).toContain('Apply to 0 cards');
});
