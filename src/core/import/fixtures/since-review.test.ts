import { it, expect, vi } from 'vitest';
import { emptyProfile } from '../../profile';
import { applyProposals } from '../match';
const h=vi.hoisted(()=>({html:''}));
vi.mock('../../../ui/sheet',()=>({openSheet:(html:string)=>{h.html=html;},closeSheet:vi.fn(),sheetTop:()=>''}));
vi.mock('../../../state',()=>({profile:emptyProfile(),save:vi.fn()}));
import { profile } from '../../../state';
import { openReview } from '../../../ui/import/review';
it('C3b shows the old and corrected medication start dates before applying',()=>{
 profile.cards=[];
 const p={area:'health' as const,kind:'Medication',value:'Example',since:'2018-05',sync:{source:'health',id:'med1',at:'2020'}};
 applyProposals(profile,[p],'Health');
 openReview('Health',{rows:[{id:'med1',group:'Medication',label:'Example',build:()=>[{...p,since:'2017-03',sync:{...p.sync,at:'2024'}}]}]});
 expect(h.html).toContain('Since: 2018-05 → 2017-03');expect(profile.cards[0].since).toBe('2018-05');
});
