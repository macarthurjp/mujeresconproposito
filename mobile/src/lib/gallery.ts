// Gallery regions. Same rule as getGalleryRegionKey() on the website:
// the database stores short codes ("usa", "rd", "eu") or full names.
export type RegionKey = 'usa' | 'rd' | 'eu';

export const GALLERY_REGIONS: { key: RegionKey; label: string; short: string }[] = [
  { key: 'usa', label: 'Estados Unidos', short: 'Estados Unidos' },
  { key: 'rd', label: 'República Dominicana', short: 'Rep. Dominicana' },
  { key: 'eu', label: 'Europa', short: 'Europa' },
];

function normalize(value: string) {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

export function galleryRegionKey(categoria: string | null | undefined): RegionKey | '' {
  const value = normalize(String(categoria || ''));
  if (value === 'estados unidos' || value === 'usa' || value === 'eeuu') return 'usa';
  if (value === 'republica dominicana' || value === 'rd') return 'rd';
  if (value === 'europa' || value === 'eu') return 'eu';
  return '';
}
