import { resolveRemote } from '../syncRules';

const T1 = '2026-11-10T10:00:00.000Z';
const T2 = '2026-11-10T11:00:00.000Z';

describe('RF-18 resolución de conflictos', () => {
  test('fila nueva en la nube se aplica', () => expect(resolveRemote(null, { modified: T1, deleted: false })).toBe('apply'));
  test('local sin cambios pendientes: gana la nube', () =>
    expect(resolveRemote({ modified: T2, pending: false }, { modified: T1, deleted: false })).toBe('apply'));
  test('local pendiente y más reciente: se conserva y luego se sube', () =>
    expect(resolveRemote({ modified: T2, pending: true }, { modified: T1, deleted: false })).toBe('keepLocal'));
  test('local pendiente pero más antiguo: gana la nube', () =>
    expect(resolveRemote({ modified: T1, pending: true }, { modified: T2, deleted: false })).toBe('apply'));
  test('empate: gana la nube (base principal)', () =>
    expect(resolveRemote({ modified: T1, pending: true }, { modified: T1, deleted: false })).toBe('apply'));
  test('borrado en la nube elimina la copia local', () =>
    expect(resolveRemote({ modified: T1, pending: false }, { modified: T2, deleted: true })).toBe('deleteLocal'));
  test('borrado en la nube de algo que no existe localmente', () =>
    expect(resolveRemote(null, { modified: T2, deleted: true })).toBe('skip'));
  test('borrado remoto anterior a una edición local pendiente', () =>
    expect(resolveRemote({ modified: T2, pending: true }, { modified: T1, deleted: true })).toBe('keepLocal'));
});
