import { esc } from './dom';
export const noteInput = (id: string, value: string) => `<label class="note-lab" for="${id}">Your note</label><textarea id="${id}" autocomplete="off" rows="3" class="note-input">${esc(value)}</textarea>`;
export function autosizeNote(root: HTMLElement) {
  root.querySelectorAll<HTMLTextAreaElement>('textarea').forEach(t => {
    const resize = () => { t.style.height = 'auto'; t.style.height = `${Math.max(80, t.scrollHeight)}px`; };
    t.addEventListener('input', resize);
    resize();
  });
}
