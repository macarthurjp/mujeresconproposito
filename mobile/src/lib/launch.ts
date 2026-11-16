import { useSyncExternalStore } from 'react';

/**
 * Tells the UI when the launch overlay starts to open, so screen content
 * reveals itself at that moment (instead of animating unseen behind it).
 */
let revealed = false;
const listeners = new Set<() => void>();

export function markLaunchRevealed() {
  if (revealed) return;
  revealed = true;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useLaunchRevealed() {
  return useSyncExternalStore(subscribe, () => revealed, () => true);
}

// Safety net: never leave content hidden if the launch overlay does not report.
setTimeout(markLaunchRevealed, 4000);
