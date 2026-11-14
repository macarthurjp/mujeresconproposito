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
  live: '#d64545',
};

export const serif = Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia, serif' });

export const radius = { sm: 12, md: 18, lg: 26 };
export const space = (n: number) => n * 4;

export const SITE_URL = 'https://mcp930.org';
export const YOUTUBE_URL = 'https://www.youtube.com/@MujeresconProposito930';
export const SOUNDCLOUD_URL = 'https://soundcloud.com/mujeresconproposito930/sets/mujeres-con-proposito-porcion';
export const INSTAGRAM_URL = 'https://instagram.com/mujeresconproposito930';
export const FACEBOOK_URL = 'https://facebook.com/mujeresconproposito930';
export const CONTACT_EMAIL = 'contacto@mcp930.org';
