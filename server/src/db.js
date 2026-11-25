/**
 * Base de datos: PostgreSQL en Render (DATABASE_URL). Sin DATABASE_URL se usa PGlite
 * (Postgres embebido) en ./data para desarrollo local, con el mismo SQL.
 */
import { config } from './config.js';

let impl;

export async function initDb() {
  if (config.databaseUrl) {
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({
      connectionString: config.databaseUrl,
      // URL interna de Render (dpg-…): sin SSL. URL externa (*.render.com u otro proveedor): SSL.
      ssl: /\.render\.com|sslmode=require/.test(config.databaseUrl) || process.env.PGSSL === 'true'
        ? { rejectUnauthorized: false }
        : false,
      max: 5,
    });
    impl = { query: (t, p) => pool.query(t, p), kind: 'postgres' };
  } else {
    const { PGlite } = await import('@electric-sql/pglite');
    const db = new PGlite(config.pgliteDir);
    await db.waitReady;
    impl = { query: (t, p) => db.query(t, p), exec: (t) => db.exec(t), kind: 'pglite' };
  }
  await migrate();
  return impl.kind;
}

export const query = (text, params = []) => impl.query(text, params);
export const one = async (text, params = []) => (await impl.query(text, params)).rows[0] ?? null;
export const many = async (text, params = []) => (await impl.query(text, params)).rows;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  name text NOT NULL,
  role text NOT NULL CHECK (role IN ('tienda','mensajero','admin')),
  phone text,
  city text,
  vehicle text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  city text NOT NULL,
  address text,
  channel text,
  instagram text,
  whatsapp text,
  default_box_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  sku text,
  category text,
  length_cm numeric NOT NULL,
  width_cm numeric NOT NULL,
  height_cm numeric NOT NULL,
  weight_kg numeric NOT NULL DEFAULT 0.2,
  price numeric NOT NULL DEFAULT 0,
  fragile boolean NOT NULL DEFAULT false,
  measured_by text NOT NULL DEFAULT 'manual',
  confidence numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS boxes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  length_cm numeric NOT NULL,
  width_cm numeric NOT NULL,
  height_cm numeric NOT NULL,
  max_weight_kg numeric NOT NULL DEFAULT 20,
  cost numeric NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  divisor numeric NOT NULL DEFAULT 5000,
  insurance_pct numeric NOT NULL DEFAULT 1,
  min_insurance numeric NOT NULL DEFAULT 500,
  cod_pct numeric NOT NULL DEFAULT 3,
  courier_share_pct numeric NOT NULL DEFAULT 70,
  rates jsonb NOT NULL,
  active boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  courier_id uuid REFERENCES users(id) ON DELETE SET NULL,
  service_id uuid REFERENCES services(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'creado',
  recipient_name text NOT NULL,
  recipient_phone text NOT NULL,
  address text NOT NULL,
  city text NOT NULL,
  zone text NOT NULL,
  notes text,
  items jsonb NOT NULL,
  packages jsonb NOT NULL,
  quote jsonb NOT NULL,
  baseline_total numeric,
  declared_value numeric NOT NULL DEFAULT 0,
  cod_amount numeric NOT NULL DEFAULT 0,
  price numeric NOT NULL,
  courier_fee numeric NOT NULL DEFAULT 0,
  verified jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shipments_store_idx ON shipments(store_id);
CREATE INDEX IF NOT EXISTS shipments_courier_idx ON shipments(courier_id);
CREATE INDEX IF NOT EXISTS shipments_status_idx ON shipments(status);
CREATE TABLE IF NOT EXISTS shipment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  status text NOT NULL,
  note text,
  photo text,
  receiver_name text,
  by_user uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_shipment_idx ON shipment_events(shipment_id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_version text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_ip text;
`;

async function migrate() {
  // Varias sentencias: pg las admite en una consulta sin parámetros; PGlite usa exec.
  if (impl.exec) await impl.exec(SCHEMA);
  else await impl.query(SCHEMA);
}
