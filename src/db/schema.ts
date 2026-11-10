/**
 * Esquema SQLite local (Apéndice I, Rev. 1.1). Unidades en metros.
 * Es la copia de trabajo offline; la base principal es la nube (RF-18).
 *  - pendiente = 1: cambio local aún no subido.
 *  - modificado: marca de tiempo del último cambio (gana el más reciente en conflictos).
 *  - eliminado: borrados locales pendientes de propagar a la nube.
 */
export const DB_NAME = 'dimensiona.db';
export const SCHEMA_VERSION = 1;

export const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS proyecto (
  id TEXT PRIMARY KEY NOT NULL,
  usuario_id TEXT,
  nombre TEXT NOT NULL,
  tipo_espacio TEXT NOT NULL,
  altura_m REAL,
  altura_conf REAL,
  factor_k REAL NOT NULL DEFAULT 1.0,
  es_demo INTEGER NOT NULL DEFAULT 0,
  creado TEXT NOT NULL,
  modificado TEXT NOT NULL,
  pendiente INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS esquina (
  id TEXT PRIMARY KEY NOT NULL,
  proyecto_id TEXT NOT NULL REFERENCES proyecto(id) ON DELETE CASCADE,
  orden INTEGER NOT NULL,
  x REAL NOT NULL,
  z REAL NOT NULL,
  confiabilidad REAL NOT NULL,
  modificado TEXT NOT NULL,
  pendiente INTEGER NOT NULL DEFAULT 1
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
  creado TEXT NOT NULL,
  modificado TEXT NOT NULL,
  pendiente INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS foto (
  id TEXT PRIMARY KEY NOT NULL,
  proyecto_id TEXT NOT NULL REFERENCES proyecto(id) ON DELETE CASCADE,
  medicion_id TEXT REFERENCES medicion(id) ON DELETE SET NULL,
  ruta TEXT NOT NULL,
  fecha TEXT NOT NULL
);
-- Notas separadas de las fotos para poder sincronizarlas (las fotos no salen del teléfono).
-- foto_id es una referencia débil: en otro dispositivo la foto puede no existir.
CREATE TABLE IF NOT EXISTS nota (
  id TEXT PRIMARY KEY NOT NULL,
  proyecto_id TEXT NOT NULL REFERENCES proyecto(id) ON DELETE CASCADE,
  foto_id TEXT,
  texto TEXT NOT NULL CHECK (length(texto) BETWEEN 1 AND 500),
  creado TEXT NOT NULL,
  modificado TEXT NOT NULL,
  pendiente INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS ajustes (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  unidad TEXT NOT NULL DEFAULT 'm',
  decimales INTEGER NOT NULL DEFAULT 2,
  tutorial_visto INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO ajustes (id) VALUES (1);
CREATE TABLE IF NOT EXISTS eliminado (
  tabla TEXT NOT NULL,
  id TEXT NOT NULL,
  fecha TEXT NOT NULL,
  PRIMARY KEY (tabla, id)
);
CREATE TABLE IF NOT EXISTS sync_meta (
  clave TEXT PRIMARY KEY NOT NULL,
  valor TEXT
);
CREATE INDEX IF NOT EXISTS idx_esquina_proy ON esquina(proyecto_id, orden);
CREATE INDEX IF NOT EXISTS idx_medicion_proy ON medicion(proyecto_id);
CREATE INDEX IF NOT EXISTS idx_foto_proy ON foto(proyecto_id);
CREATE INDEX IF NOT EXISTS idx_nota_proy ON nota(proyecto_id);
PRAGMA user_version = ${SCHEMA_VERSION};
`;
