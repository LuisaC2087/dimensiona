/** CR-04: nombres en español (es-CO) de las clases del modelo YOLOE (scripts/export_yoloe.py). */
export const OBJECT_LABELS_ES: Record<string, string> = {
  chair: 'Silla', armchair: 'Sillón', sofa: 'Sofá', table: 'Mesa', 'dining table': 'Mesa de comedor',
  'coffee table': 'Mesa de centro', desk: 'Escritorio', bed: 'Cama', nightstand: 'Mesa de noche',
  wardrobe: 'Clóset', cabinet: 'Gabinete', dresser: 'Cómoda', bookshelf: 'Biblioteca', shelf: 'Repisa',
  door: 'Puerta', window: 'Ventana', curtain: 'Cortina', rug: 'Tapete', mirror: 'Espejo',
  'picture frame': 'Cuadro', television: 'Televisor', 'computer monitor': 'Monitor', laptop: 'Portátil',
  refrigerator: 'Nevera', microwave: 'Microondas', oven: 'Horno', stove: 'Estufa',
  'washing machine': 'Lavadora', sink: 'Lavaplatos', toilet: 'Sanitario', bathtub: 'Tina', shower: 'Ducha',
  lamp: 'Lámpara', 'ceiling light': 'Lámpara de techo', 'potted plant': 'Planta', vase: 'Florero',
  box: 'Caja', suitcase: 'Maleta', basket: 'Canasta', 'trash can': 'Caneca', fan: 'Ventilador',
  'air conditioner': 'Aire acondicionado', stool: 'Butaco', bench: 'Banca', pillow: 'Cojín',
  speaker: 'Parlante', printer: 'Impresora', 'kitchen counter': 'Mesón', bottle: 'Botella', cup: 'Taza',
  book: 'Libro', clock: 'Reloj', 'power outlet': 'Tomacorriente', 'light switch': 'Interruptor',
  stairs: 'Escaleras', backpack: 'Morral', guitar: 'Guitarra', bicycle: 'Bicicleta', piano: 'Piano',
  fireplace: 'Chimenea', toy: 'Juguete', keyboard: 'Teclado', 'cell phone': 'Celular',
};

export function labelEs(label: string): string {
  const k = label.trim().toLowerCase();
  return OBJECT_LABELS_ES[k] ?? k.charAt(0).toUpperCase() + k.slice(1);
}
