/** Aviso de cambios locales: la sincronización (src/cloud) se suscribe aquí sin crear dependencias circulares. */
type Listener = () => void;
const listeners = new Set<Listener>();

export function onLocalChange(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function notifyLocalChange(): void {
  listeners.forEach((l) => l());
}
