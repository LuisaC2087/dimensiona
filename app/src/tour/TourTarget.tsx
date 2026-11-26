/** Marca una opción de la pantalla para que el recorrido guiado pueda señalarla y «presionarla». */
import { type ReactNode, useEffect, useRef } from 'react';
import { type StyleProp, View, type ViewStyle } from 'react-native';

const targets = new Map<string, React.RefObject<View | null>>();

export function TourTarget({ id, children, style }: { id: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const ref = useRef<View>(null);
  useEffect(() => {
    targets.set(id, ref);
    return () => { if (targets.get(id) === ref) targets.delete(id); };
  }, [id]);
  return <View ref={ref} collapsable={false} style={style}>{children}</View>;
}

export type Rect = { x: number; y: number; w: number; h: number };

/** Posición en ventana de una opción marcada (null si no está en pantalla). */
export function measureTarget(id: string): Promise<Rect | null> {
  const ref = targets.get(id);
  return new Promise((resolve) => {
    if (!ref?.current) return resolve(null);
    ref.current.measureInWindow((x, y, w, h) => resolve(w > 0 && h > 0 ? { x, y, w, h } : null));
  });
}
