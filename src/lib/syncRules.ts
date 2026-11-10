/**
 * RF-18: reglas de resolución al bajar una fila de la nube (base principal).
 * - La nube gana salvo que la copia local tenga un cambio pendiente estrictamente más reciente.
 * - En empate gana la nube.
 */
export interface LocalState { modified: string; pending: boolean }
export interface RemoteState { modified: string; deleted: boolean }
export type MergeAction = 'apply' | 'deleteLocal' | 'keepLocal' | 'skip';

export function resolveRemote(local: LocalState | null, remote: RemoteState): MergeAction {
  const localWins = !!local && local.pending && Date.parse(local.modified) > Date.parse(remote.modified);
  if (remote.deleted) {
    if (!local) return 'skip';
    return localWins ? 'keepLocal' : 'deleteLocal';
  }
  if (!local) return 'apply';
  return localWins ? 'keepLocal' : 'apply';
}
