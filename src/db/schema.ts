/** Esquema SQLite (Apéndice I). Unidades en metros. */
export const DB_NAME = 'dimensiona.db';
export const SCHEMA_VERSION = 1;

export const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS proyecto (
  id TEXT PRIMARY KEY NOT NULL,
  nombre TEXT NOT NULL UNIQUE,
  tipo_espacio TEXT NOT NULL,
  altura_m REAL,
  altura_conf REAL,
  factor_k REAL NOT NULL DEFAULT 1.0,
  es_demo INTEGER NOT NULL DEFAULT 0,
  creado TEXT NOT NULL,
  modificado TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS esquina (
  id TEXT PRIMARY KEY NOT NULL,
  proyecto_id TEXT NOT NULL REFERENCES proyecto(id) ON DELETE CASCADE,
  orden INTEGER NOT NULL,
  x REAL NOT NULL,
  z REAL NOT NULL,
  confiabilidad REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS medicion (
  id TEXT PRIMARY KEY NOT NULL,
  proyecto_id TEXT NOT NULL REFERENCES proyecto(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('distancia','altura','referencia')),
  valor_m REAL NOT NULL,
  a_x REAL, a_y REAL, a_z REAL, b_x REAL, b_y REAL, b_z REAL,
  confiabilidad REAL NOT NULL,
  nivel TEXT NOT NULL,
  factores TEXT NOT NULL,
  creado TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS foto (
  id TEXT PRIMARY KEY NOT NULL,
  proyecto_id TEXT NOT NULL REFERENCES proyecto(id) ON DELETE CASCADE,
  medicion_id TEXT REFERENCES medicion(id) ON DELETE SET NULL,
  ruta TEXT NOT NULL,
  nota TEXT CHECK (nota IS NULL OR length(nota) <= 500),
  fecha TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ajustes (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  unidad TEXT NOT NULL DEFAULT 'm',
  decimales INTEGER NOT NULL DEFAULT 2,
  tutorial_visto INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO ajustes (id) VALUES (1);
CREATE INDEX IF NOT EXISTS idx_esquina_proy ON esquina(proyecto_id, orden);
CREATE INDEX IF NOT EXISTS idx_medicion_proy ON medicion(proyecto_id);
CREATE INDEX IF NOT EXISTS idx_foto_proy ON foto(proyecto_id);
`;
