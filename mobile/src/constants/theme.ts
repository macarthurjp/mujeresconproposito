import { Platform } from 'react-native';

// Same palette as the website's premium layer (assets/css/premium.css).
export const C = {
  ink: '#3f2623',
  plum: '#f3d5d1',
  wine: '#a64b43',
  rose: '#e7a8a0',
  blush: '#f9e4e0',
  gold: '#c9a46b',
  gold2: '#b8864a',
  ivory: '#fff7f6',
  sand: '#f9edea',
  paper: '#ffffff',
  text: '#3f2623',
  muted: '#6d5250',
  line: 'rgba(28,17,23,0.09)',
  // iOS-style grouped surfaces, warmed to the brand
  bg: '#faf5f4',
  card: '#ffffff',
  fill: 'rgba(166,75,67,0.08)',
  separator: 'rgba(60,40,38,0.12)',
  live: '#d64545',
};

export const serif = Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia, serif' });
// System font (SF Pro on iOS, Roboto on Android) for UI and screen titles, like native apps.
export const sans = Platform.select({ ios: 'System', android: 'sans-serif', default: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", sans-serif' });

export const radius = { sm: 12, md: 20, lg: 28 };

// Room left at the bottom of scroll views for the floating translucent tab bar.
export const TAB_BAR_SPACE = 96;
export const space = (n: number) => n * 4;

const PRODUCTION_SITE_URL = 'https://mcp930.org';
const configuredSiteUrl = process.env.EXPO_PUBLIC_SITE_URL?.trim();
export const SITE_URL = __DEV__ ? (configuredSiteUrl || '') : (configuredSiteUrl || PRODUCTION_SITE_URL);
if (__DEV__ && SITE_URL && !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(SITE_URL)) {
  throw new Error('En desarrollo, los enlaces de la app deben apuntar al sitio local.');
}
export const YOUTUBE_URL = 'https://www.youtube.com/@MujeresconProposito930';
export const SOUNDCLOUD_URL = 'https://soundcloud.com/mujeresconproposito930/sets/mujeres-con-proposito-porcion';
export const INSTAGRAM_URL = 'https://instagram.com/mujeresconproposito930';
export const FACEBOOK_URL = 'https://facebook.com/mujeresconproposito930';
export const CONTACT_EMAIL = 'contacto@mcp930.org';
