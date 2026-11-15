/** Tiny pub-sub so floating UI (the prayer button) can react to page scrolling. */
type Listener = () => void;
const listeners = new Set<Listener>();

export function reportScroll() {
  listeners.forEach((listener) => listener());
}

export function onScrollActivity(listener: Listener) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
