import { ActionSheetIOS, Linking, Platform } from 'react-native';

/** Online events ("Zoom", "En línea", a link…) have no address to open. */
export function isOnlinePlace(text?: string | null) {
  const t = String(text || '').trim().toLowerCase();
  return !t || /^https?:\/\//.test(t) || /\b(zoom|en l[ií]nea|online|google meet|meet|teams|virtual|youtube)\b/.test(t);
}

export type PlaceSuggestion = { id: string; label: string };

type PhotonFeature = { properties: Record<string, string | undefined> };

function formatPhoton(p: Record<string, string | undefined>) {
  const street = p.street ? `${p.street}${p.housenumber ? ` ${p.housenumber}` : ''}` : '';
  const first = p.name && p.name !== p.street ? p.name : street;
  const place = [p.postcode, p.city || p.town || p.village || p.county].filter(Boolean).join(' ');
  return [first, first === street ? '' : street, place, p.country].filter(Boolean).join(', ');
}

/**
 * Address suggestions while typing (Photon, OpenStreetMap: free, no key,
 * designed for autocomplete). Returns [] for short or online entries.
 */
export async function searchPlaces(query: string, signal?: AbortSignal): Promise<PlaceSuggestion[]> {
  const q = query.trim();
  if (q.length < 3 || isOnlinePlace(q)) return [];
  const response = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=5`, { signal });
  if (!response.ok) return [];
  const data = (await response.json()) as { features?: PhotonFeature[] };
  const seen = new Set<string>();
  return (data.features || [])
    .map((f) => formatPhoton(f.properties))
    .filter((label) => label && !seen.has(label) && seen.add(label))
    .map((label) => ({ id: label, label }));
}

async function openFirst(urls: string[]) {
  for (const url of urls) {
    try { await Linking.openURL(url); return; } catch { /* app not installed: try the next one */ }
  }
}

/**
 * Opens an address in the phone's map apps. Android shows the system chooser
 * with every installed map app; iOS offers Apple Maps, Google Maps and Waze
 * (falling back to the web if one is not installed).
 */
export function openInMaps(address: string) {
  const q = encodeURIComponent(address.trim());
  const web = `https://www.google.com/maps/search/?api=1&query=${q}`;
  if (Platform.OS === 'android') { void openFirst([`geo:0,0?q=${q}`, web]); return; }
  if (Platform.OS !== 'ios') { void openFirst([web]); return; }
  ActionSheetIOS.showActionSheetWithOptions(
    { title: address, options: ['Apple Maps', 'Google Maps', 'Waze', 'Cancelar'], cancelButtonIndex: 3 },
    (index) => {
      if (index === 0) void openFirst([`maps://?q=${q}`, `https://maps.apple.com/?q=${q}`]);
      if (index === 1) void openFirst([`comgooglemaps://?q=${q}`, web]);
      if (index === 2) void openFirst([`waze://?q=${q}&navigate=yes`, `https://waze.com/ul?q=${q}&navigate=yes`]);
    },
  );
}
