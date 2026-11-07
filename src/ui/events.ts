// App-wide events, so screens don't have to import each other.
type AppEvent = 'card-added' | 'data-loaded' | 'named';

export const emit = (name: AppEvent) => window.dispatchEvent(new Event('you:' + name));
export const on = (name: AppEvent, fn: () => void) => window.addEventListener('you:' + name, fn);
