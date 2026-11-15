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

export type Album<T> = { key: string; title: string; cover: T; photos: T[]; order: number };

type PhotoLike = { texto: string | null; categoria: string; orden?: number | null; portada?: boolean | null };

/**
 * Groups a region's photos into albums exactly like the website: by title
 * (texto), albums ordered by their first photo's order, and the photo
 * marked "portada" first (it is the cover).
 */
export function albumsFor<T extends PhotoLike>(photos: T[], region: RegionKey): Album<T>[] {
  const map = new Map<string, Album<T>>();
  photos.forEach((photo, index) => {
    if (galleryRegionKey(photo.categoria) !== region) return;
    const title = String(photo.texto || '').trim() || 'Actividad';
    const key = normalize(title) || `actividad-${index}`;
    const order = Number.isFinite(Number(photo.orden)) ? Number(photo.orden) : index + 1;
    if (!map.has(key)) map.set(key, { key, title, cover: photo, photos: [], order });
    map.get(key)!.photos.push(photo);
  });
  return [...map.values()]
    .map((album) => {
      const sorted = [...album.photos].sort((a, b) => Number(Boolean(b.portada)) - Number(Boolean(a.portada)));
      return { ...album, photos: sorted, cover: sorted[0] };
    })
    .sort((a, b) => a.order - b.order);
}
