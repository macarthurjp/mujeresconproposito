import AsyncStorage from '@react-native-async-storage/async-storage';

// Favorites and personal notes for devotionals, kept on this device.
const FAV_KEY = 'mcp930:devocionales-favoritos';
const noteKey = (slug: string) => `mcp930:devocional-nota:${slug}`;

export async function getFavorites(): Promise<string[]> {
  try { return JSON.parse((await AsyncStorage.getItem(FAV_KEY)) || '[]'); } catch { return []; }
}

export async function toggleFavorite(slug: string): Promise<boolean> {
  const list = await getFavorites();
  const next = list.includes(slug) ? list.filter((s) => s !== slug) : [...list, slug];
  await AsyncStorage.setItem(FAV_KEY, JSON.stringify(next));
  return next.includes(slug);
}

export async function getNote(slug: string) {
  return (await AsyncStorage.getItem(noteKey(slug))) ?? '';
}

export async function saveNote(slug: string, text: string) {
  if (text.trim()) await AsyncStorage.setItem(noteKey(slug), text);
  else await AsyncStorage.removeItem(noteKey(slug));
}
