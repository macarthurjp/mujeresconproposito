import { Platform } from 'react-native';

// Same palette as the website's premium layer (assets/css/premium.css).
export const C = {
  ink: '#1c1117',
  plum: '#3d1a2b',
  wine: '#7a2e42',
  rose: '#d69aa0',
  blush: '#f4e4e1',
  gold: '#c9a46b',
  gold2: '#e3c995',
  ivory: '#fbf8f4',
  sand: '#f3ece4',
  paper: '#ffffff',
  text: '#2b2026',
  muted: '#6f6168',
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
