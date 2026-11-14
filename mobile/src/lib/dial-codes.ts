// International dialling codes for the phone field. Communities first
// (Europe, USA, Dominican Republic), then everyone else alphabetically.
export type DialCode = { iso: string; name: string; code: string };

const ALL: DialCode[] = [
  ['DE', 'Alemania', '49'], ['AD', 'Andorra', '376'], ['AO', 'Angola', '244'], ['AG', 'Antigua y Barbuda', '1268'],
  ['SA', 'Arabia Saudita', '966'], ['DZ', 'Argelia', '213'], ['AR', 'Argentina', '54'], ['AU', 'Australia', '61'],
  ['AT', 'Austria', '43'], ['BS', 'Bahamas', '1242'], ['BB', 'Barbados', '1246'], ['BE', 'Bélgica', '32'],
  ['BZ', 'Belice', '501'], ['BO', 'Bolivia', '591'], ['BR', 'Brasil', '55'], ['BG', 'Bulgaria', '359'],
  ['CV', 'Cabo Verde', '238'], ['CM', 'Camerún', '237'], ['CA', 'Canadá', '1'], ['CL', 'Chile', '56'],
  ['CN', 'China', '86'], ['CY', 'Chipre', '357'], ['CO', 'Colombia', '57'], ['KR', 'Corea del Sur', '82'],
  ['CI', 'Costa de Marfil', '225'], ['CR', 'Costa Rica', '506'], ['HR', 'Croacia', '385'], ['CU', 'Cuba', '53'],
  ['CW', 'Curazao', '599'], ['DK', 'Dinamarca', '45'], ['DM', 'Dominica', '1767'], ['EC', 'Ecuador', '593'],
  ['EG', 'Egipto', '20'], ['SV', 'El Salvador', '503'], ['AE', 'Emiratos Árabes Unidos', '971'], ['SK', 'Eslovaquia', '421'],
  ['SI', 'Eslovenia', '386'], ['ES', 'España', '34'], ['US', 'Estados Unidos', '1'], ['EE', 'Estonia', '372'],
  ['PH', 'Filipinas', '63'], ['FI', 'Finlandia', '358'], ['FR', 'Francia', '33'], ['GH', 'Ghana', '233'],
  ['GD', 'Granada', '1473'], ['GR', 'Grecia', '30'], ['GP', 'Guadalupe', '590'], ['GT', 'Guatemala', '502'],
  ['GF', 'Guayana Francesa', '594'], ['GQ', 'Guinea Ecuatorial', '240'], ['GY', 'Guyana', '592'], ['HT', 'Haití', '509'],
  ['HN', 'Honduras', '504'], ['HU', 'Hungría', '36'], ['IN', 'India', '91'], ['IE', 'Irlanda', '353'],
  ['IS', 'Islandia', '354'], ['IL', 'Israel', '972'], ['IT', 'Italia', '39'], ['JM', 'Jamaica', '1876'],
  ['JP', 'Japón', '81'], ['KE', 'Kenia', '254'], ['LV', 'Letonia', '371'], ['LI', 'Liechtenstein', '423'],
  ['LT', 'Lituania', '370'], ['LU', 'Luxemburgo', '352'], ['MT', 'Malta', '356'], ['MA', 'Marruecos', '212'],
  ['MQ', 'Martinica', '596'], ['MX', 'México', '52'], ['MC', 'Mónaco', '377'], ['NI', 'Nicaragua', '505'],
  ['NG', 'Nigeria', '234'], ['NO', 'Noruega', '47'], ['NZ', 'Nueva Zelanda', '64'], ['NL', 'Países Bajos', '31'],
  ['PA', 'Panamá', '507'], ['PY', 'Paraguay', '595'], ['PE', 'Perú', '51'], ['PL', 'Polonia', '48'],
  ['PT', 'Portugal', '351'], ['PR', 'Puerto Rico', '1'], ['GB', 'Reino Unido', '44'], ['CZ', 'República Checa', '420'],
  ['CD', 'República del Congo', '243'], ['DO', 'República Dominicana', '1'], ['RO', 'Rumania', '40'], ['RU', 'Rusia', '7'],
  ['KN', 'San Cristóbal y Nieves', '1869'], ['VC', 'San Vicente y las Granadinas', '1784'], ['LC', 'Santa Lucía', '1758'], ['SN', 'Senegal', '221'],
  ['RS', 'Serbia', '381'], ['SR', 'Surinam', '597'], ['ZA', 'Sudáfrica', '27'], ['SE', 'Suecia', '46'],
  ['CH', 'Suiza', '41'], ['TT', 'Trinidad y Tobago', '1868'], ['TR', 'Turquía', '90'], ['UA', 'Ucrania', '380'],
  ['UY', 'Uruguay', '598'], ['VE', 'Venezuela', '58'],
].map(([iso, name, code]) => ({ iso, name, code }));

const FIRST = ['LU', 'BE', 'FR', 'DE', 'ES', 'NL', 'CH', 'IT', 'PT', 'GB', 'US', 'DO', 'PR'];

export const DIAL_CODES: DialCode[] = [
  ...FIRST.map((iso) => ALL.find((c) => c.iso === iso)!),
  ...ALL.filter((c) => !FIRST.includes(c.iso)),
];

export const DEFAULT_DIAL = DIAL_CODES[0];

export function flag(iso: string) {
  return iso.toUpperCase().replace(/./g, (ch) => String.fromCodePoint(127397 + ch.charCodeAt(0)));
}
