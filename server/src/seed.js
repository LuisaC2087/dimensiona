/** Datos iniciales: catálogo de cajas, servicios/tarifas, administrador y (opcional) cuentas demo. */
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { config } from './config.js';
import { one, query } from './db.js';

const BOXES = [
  ['Sobre acolchado', 25, 18, 3, 1, 900],
  ['Caja XS', 15, 10, 8, 3, 900],
  ['Caja S', 20, 15, 10, 5, 1200],
  ['Caja M', 30, 20, 15, 10, 1800],
  ['Caja L', 40, 30, 20, 15, 2600],
  ['Caja XL', 50, 40, 30, 25, 3800],
  ['Caja XXL', 60, 50, 40, 30, 5200],
];

const SERVICES = [
  {
    name: 'Mensajería local DIMENSIONA', description: 'Mensajeros de la red: mismo día en tu ciudad.',
    courier: 75, rates: { local: { base: 7500, perKg: 1200, etaDays: 0 }, regional: { base: 11000, perKg: 1800, etaDays: 1 } },
  },
  {
    name: 'Nacional estándar', description: 'Entrega económica a todo el país.',
    courier: 25, rates: { local: { base: 9000, perKg: 1500, etaDays: 1 }, regional: { base: 11500, perKg: 2000, etaDays: 2 }, nacional: { base: 14500, perKg: 2800, etaDays: 4 } },
  },
  {
    name: 'Nacional express', description: 'Prioritario: llega más rápido.',
    courier: 25, rates: { local: { base: 12000, perKg: 2000, etaDays: 1 }, regional: { base: 15500, perKg: 2600, etaDays: 1 }, nacional: { base: 21000, perKg: 3800, etaDays: 2 } },
  },
];

export async function seed() {
  const hasBoxes = await one('SELECT count(*)::int AS n FROM boxes');
  if (!hasBoxes.n) {
    for (const [name, l, w, h, maxW, cost] of BOXES) {
      await query('INSERT INTO boxes (name, length_cm, width_cm, height_cm, max_weight_kg, cost) VALUES ($1,$2,$3,$4,$5,$6)', [name, l, w, h, maxW, cost]);
    }
  }
  const hasServices = await one('SELECT count(*)::int AS n FROM services');
  if (!hasServices.n) {
    for (const s of SERVICES) {
      await query('INSERT INTO services (name, description, courier_share_pct, rates) VALUES ($1,$2,$3,$4)', [s.name, s.description, s.courier, JSON.stringify(s.rates)]);
    }
  }

  // Administrador: contraseña de ADMIN_PASSWORD; si falta, se genera y se muestra una sola vez en el log.
  const admin = await one('SELECT id FROM users WHERE email = $1', [config.adminEmail]);
  if (!admin) {
    const pwd = config.adminPassword || (process.env.NODE_ENV === 'production' ? randomBytes(9).toString('base64url') : 'admin1234');
    await query("INSERT INTO users (email, password_hash, name, role, city, terms_version, terms_accepted_at) VALUES ($1,$2,'Administración','admin','Bogotá','1.0',now())", [config.adminEmail, await bcrypt.hash(pwd, 10)]);
    if (!config.adminPassword) console.log(`[seed] Administrador creado: ${config.adminEmail} / ${pwd}  (cámbiala definiendo ADMIN_PASSWORD)`);
  }

  if (config.seedDemo) await seedDemo();
}

async function seedDemo() {
  const exists = await one("SELECT id FROM users WHERE email = 'tienda@demo.app'");
  if (exists) return;
  const hash = await bcrypt.hash('demo1234', 10);
  const owner = await one(
    "INSERT INTO users (email, password_hash, name, role, phone, city, terms_version, terms_accepted_at) VALUES ('tienda@demo.app',$1,'Laura Gómez','tienda','3001234567','Bogotá','1.0',now()) RETURNING id", [hash]);
  const store = await one(
    "INSERT INTO stores (owner_id, name, city, address, channel, instagram, whatsapp) VALUES ($1,'Luna Velas & Co.','Bogotá','Cra 15 #93-20','Instagram','@lunavelas','3001234567') RETURNING id", [owner.id]);
  const courier = await one(
    "INSERT INTO users (email, password_hash, name, role, phone, city, vehicle, terms_version, terms_accepted_at) VALUES ('mensajero@demo.app',$1,'Andrés Rojas','mensajero','3109876543','Bogotá','Moto','1.0',now()) RETURNING id", [hash]);

  const products = [
    ['Vela aromática lavanda', 'VL-01', 'Hogar', 8, 8, 10, 0.4, 38000, true, 'ar', 0.86],
    ['Taza cerámica artesanal', 'TZ-02', 'Hogar', 12, 9, 10, 0.35, 32000, true, 'ar', 0.81],
    ['Camiseta estampada (doblada)', 'CM-03', 'Ropa', 25, 20, 3, 0.2, 45000, false, 'foto', 0.7],
    ['Tenis urbanos (con caja)', 'TN-04', 'Calzado', 33, 22, 12, 0.9, 189000, false, 'ar', 0.88],
    ['Libreta de tapa dura', 'LB-05', 'Papelería', 21, 15, 2, 0.25, 18000, false, 'manual', null],
  ];
  for (const p of products) {
    await query(`INSERT INTO products (store_id, name, sku, category, length_cm, width_cm, height_cm, weight_kg, price, fragile, measured_by, confidence)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [store.id, ...p]);
  }
  // Envíos de ejemplo creados con el mismo flujo de la API.
  const { createShipmentFor } = await import('./services/shipments.js');
  const prods = (await query('SELECT * FROM products WHERE store_id = $1 ORDER BY name', [store.id])).rows;
  const byName = (s) => prods.find((p) => p.name.startsWith(s));
  const demo = [
    { items: [{ productId: byName('Vela').id, qty: 2 }], recipientName: 'Camila Torres', recipientPhone: '3201112233', address: 'Cl 72 #10-34 Apto 501', city: 'Bogotá', status: 'entregado' },
    { items: [{ productId: byName('Tenis').id, qty: 1 }], recipientName: 'Juan Pérez', recipientPhone: '3157778899', address: 'Cra 43A #1-50', city: 'Medellín', status: 'en_ruta', cod: 189000 },
    { items: [{ productId: byName('Taza').id, qty: 2 }, { productId: byName('Libreta').id, qty: 1 }], recipientName: 'María Díaz', recipientPhone: '3004445566', address: 'Cl 26 Sur #45-12', city: 'Soacha', status: 'asignado' },
    { items: [{ productId: byName('Camiseta').id, qty: 3 }], recipientName: 'Sofía Ramírez', recipientPhone: '3012223344', address: 'Av Boyacá #64-30', city: 'Bogotá', status: 'creado' },
  ];
  for (const d of demo) {
    const sh = await createShipmentFor({ id: store.id, city: 'Bogotá' }, {
      items: d.items, recipientName: d.recipientName, recipientPhone: d.recipientPhone, address: d.address, city: d.city,
      declaredValue: 0, codAmount: d.cod ?? 0,
    }, owner.id);
    const flow = ['asignado', 'recogido', 'en_ruta', 'entregado'];
    const target = flow.indexOf(d.status);
    for (let i = 0; i <= target; i++) {
      const st = flow[i];
      await query('UPDATE shipments SET status = $1, courier_id = $2, updated_at = now() WHERE id = $3', [st, courier.id, sh.id]);
      await query('INSERT INTO shipment_events (shipment_id, status, note, by_user, receiver_name) VALUES ($1,$2,$3,$4,$5)',
        [sh.id, st, st === 'entregado' ? 'Entregado en portería' : null, courier.id, st === 'entregado' ? 'Camila Torres' : null]);
    }
  }
  console.log('[seed] Cuentas demo: tienda@demo.app / demo1234 · mensajero@demo.app / demo1234');
}
