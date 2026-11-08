import { expect, it } from 'vitest';
import { esc, linkText } from './dom';
it('escapes text and both attribute quotes', () => {
 expect(esc(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
});
it('keeps hostile card link text inert', () => {
 const html = linkText('', 'Note', '<img src=x onerror=alert(1)>');
 expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
 expect(html).not.toContain('<img');
});
