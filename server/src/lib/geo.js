/**
 * Zonas de envío en Colombia: local (misma ciudad), regional (mismo departamento o área
 * metropolitana) y nacional. Lista corta de ciudades principales; el resto cae en "nacional".
 */
const DEPT = {
  bogota: 'cundinamarca', soacha: 'cundinamarca', chia: 'cundinamarca', zipaquira: 'cundinamarca', mosquera: 'cundinamarca', funza: 'cundinamarca', facatativa: 'cundinamarca', fusagasuga: 'cundinamarca', cajica: 'cundinamarca', madrid: 'cundinamarca',
  medellin: 'antioquia', envigado: 'antioquia', itagui: 'antioquia', bello: 'antioquia', sabaneta: 'antioquia', rionegro: 'antioquia', 'la estrella': 'antioquia',
  cali: 'valle', palmira: 'valle', jamundi: 'valle', yumbo: 'valle', tulua: 'valle', buenaventura: 'valle',
  barranquilla: 'atlantico', soledad: 'atlantico', malambo: 'atlantico', 'puerto colombia': 'atlantico',
  cartagena: 'bolivar', turbaco: 'bolivar',
  bucaramanga: 'santander', floridablanca: 'santander', giron: 'santander', piedecuesta: 'santander',
  pereira: 'risaralda', dosquebradas: 'risaralda', manizales: 'caldas', armenia: 'quindio',
  cucuta: 'norte de santander', ibague: 'tolima', villavicencio: 'meta', neiva: 'huila', pasto: 'narino',
  'santa marta': 'magdalena', monteria: 'cordoba', valledupar: 'cesar', sincelejo: 'sucre', popayan: 'cauca',
  tunja: 'boyaca', duitama: 'boyaca', sogamoso: 'boyaca', riohacha: 'la guajira', quibdo: 'choco', yopal: 'casanare', florencia: 'caqueta',
};

export function normCity(c) {
  return String(c ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/,.*$/, '').replace(/\b(d\.?c\.?|distrito capital)\b/g, '')
    .replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function zoneFor(origin, dest) {
  const a = normCity(origin), b = normCity(dest);
  if (!a || !b) return 'nacional';
  if (a === b) return 'local';
  if (DEPT[a] && DEPT[a] === DEPT[b]) return 'regional';
  return 'nacional';
}

export const ZONE_LABEL = { local: 'Local (misma ciudad)', regional: 'Regional', nacional: 'Nacional' };
