/** Guiones del recorrido guiado por rol. Cada paso se explica en una pantalla; si `press`, la mano presiona la opción para pasar al siguiente. */
import type { IconName } from '../components/Icon';

export type TourRole = 'tienda' | 'mensajero' | 'admin';
export interface TourCtx { shipmentId?: string; code?: string; availableId?: string }
export interface TourStep {
  route: string | ((c: TourCtx) => string | null);
  target?: string;
  press?: boolean;
  icon: IconName;
  title: string;
  text: string;
}

export const ROLE_NAME: Record<TourRole, string> = { tienda: 'Tienda', mensajero: 'Mensajero', admin: 'Administración' };

export const TOURS: Record<TourRole, TourStep[]> = {
  tienda: [
    { route: '/tienda', icon: 'storefront', title: 'Tu tienda de un vistazo',
      text: 'En el inicio ves cuánto ahorras por medir, tus envíos activos y lo que te deben por pagos contra entrega.' },
    { route: '/tienda', target: 'home.medir', icon: 'cube-scan', title: 'Medir con la cámara',
      text: 'Apuntas la cámara al producto y la realidad aumentada toma largo, ancho y alto, con su nivel de confiabilidad. Lo mides una vez y queda guardado.' },
    { route: '/tienda', target: 'tab.productos', press: true, icon: 'package-variant', title: 'Vamos a tus productos',
      text: 'Abrimos la pestaña Productos.' },
    { route: '/tienda/productos', icon: 'package-variant', title: 'Tu catálogo medido',
      text: 'Cada producto guarda sus medidas, cómo se midieron (AR —realidad aumentada—, foto o IA), el peso y si es frágil. Así cada envío se arma en segundos.' },
    { route: '/tienda/productos', target: 'tab.envios', press: true, icon: 'truck-delivery', title: 'Ahora, los envíos',
      text: 'Abrimos la pestaña Envíos.' },
    { route: '/tienda/envios', target: 'envios.nuevo', press: true, icon: 'truck-fast', title: 'Tus envíos',
      text: 'Aquí están todos tus envíos por estado. Creemos uno nuevo.' },
    { route: '/nuevo-envio', icon: 'cube-outline', title: 'Un envío en tres pasos',
      text: 'Eliges productos, la app arma el empaque en la caja justa (con vista 3D) y compara precios: red DIMENSIONA, Servientrega y Coordinadora. Pagas el peso real, no el aire.' },
    { route: (c) => (c.shipmentId ? '/tienda/envios' : null), target: 'list.first', press: true, icon: 'file-document-outline', title: 'Abramos un envío',
      text: 'Tocamos un envío para ver su detalle.' },
    { route: (c) => (c.shipmentId ? `/envio/${c.shipmentId}` : null), icon: 'clipboard-text-clock', title: 'Todo el envío en una pantalla',
      text: 'Estado en tiempo real, rótulo con QR para imprimir, enviar el rastreo por WhatsApp y los avisos automáticos que recibe tu cliente.' },
    { route: '/tienda', target: 'bell', press: true, icon: 'bell-ring', title: 'Los avisos',
      text: 'La campana cuenta los avisos sin leer. Vamos a verlos.' },
    { route: '/avisos', icon: 'bell-ring', title: 'Siempre al tanto',
      text: 'Cada cambio de estado, novedad, factura o pago llega aquí y como notificación al teléfono. También eliges si avisamos a tus clientes por WhatsApp.' },
    { route: '/tienda/facturas', icon: 'receipt', title: 'Facturas y recaudos',
      text: 'Cada mes recibes tu cuenta de cobro con IVA incluido, y aquí ves los pagos contra entrega que te transferimos.' },
    { route: (c) => (c.code ? `/rastreo/${c.code}` : null), icon: 'map-marker-radius', title: 'Así lo ve tu cliente',
      text: 'Tu cliente sigue su pedido sin crear cuenta, desde el enlace que le llega por WhatsApp.' },
    { route: '/tienda', icon: 'check-decagram', title: '¡Eso es DIMENSIONA!',
      text: 'Mide, empaca y envía desde el celular. Puedes repetir este recorrido desde Cuenta › Ayuda.' },
  ],
  mensajero: [
    { route: '/mensajero', icon: 'motorbike', title: 'Tu ruta del día',
      text: 'Ves las entregas en curso, las recogidas pendientes y lo que llevas ganado hoy.' },
    { route: '/mensajero', target: 'tab.disponibles', press: true, icon: 'map-marker-radius', title: 'Busquemos trabajo',
      text: 'Abrimos la pestaña Disponibles.' },
    { route: '/mensajero/disponibles', target: 'list.first', press: true, icon: 'map-marker-radius', title: 'Envíos cerca de ti',
      text: 'Primero aparecen los de tu ciudad, con lo que ganas por cada uno. Abramos uno.' },
    { route: (c) => (c.availableId ? `/envio/${c.availableId}` : null), icon: 'clipboard-check', title: 'Tomar y entregar',
      text: 'Aceptas el envío, ves la recogida en el mapa, verificas las medidas con AR (realidad aumentada) al recoger, avanzas los estados y registras quién recibió con una foto.' },
    { route: '/mensajero/ganancias', icon: 'cash-multiple', title: 'Tus ganancias',
      text: 'Lo ganado por entrega, el dinero recaudado contra entrega y los pagos que te transfiere administración.' },
    { route: '/mensajero', icon: 'check-decagram', title: '¡Listo para rodar!',
      text: 'Cada envío nuevo cerca de ti te llega como aviso. Puedes repetir este recorrido desde Cuenta › Ayuda.' },
  ],
  admin: [
    { route: '/admin', icon: 'view-dashboard', title: 'El panel',
      text: 'Métricas de la operación y alertas: envíos sin asignar, novedades, facturas vencidas y PQR por vencer.' },
    { route: '/admin', target: 'tab.operacion', press: true, icon: 'truck-delivery', title: 'La operación', text: 'Abrimos Envíos.' },
    { route: '/admin/operacion', icon: 'truck-delivery', title: 'Todos los envíos',
      text: 'Filtras por estado, asignas o reasignas mensajeros y atiendes novedades.' },
    { route: '/admin/operacion', target: 'tab.finanzas', press: true, icon: 'bank', title: 'Las finanzas', text: 'Abrimos Finanzas.' },
    { route: '/admin/finanzas', icon: 'bank', title: 'Facturar y liquidar',
      text: 'Generas las cuentas de cobro del mes, registras pagos y liquidas recaudos a tiendas y pagos a mensajeros.' },
    { route: '/admin/finanzas', target: 'tab.usuarios', press: true, icon: 'account-group', title: 'Las personas', text: 'Abrimos Usuarios.' },
    { route: '/admin/usuarios', icon: 'account-group', title: 'Usuarios',
      text: 'Apruebas mensajeros nuevos, activas o desactivas cuentas y das claves temporales.' },
    { route: '/admin/usuarios', target: 'tab.mas', press: true, icon: 'dots-grid', title: 'Y más', text: 'Abrimos Más.' },
    { route: '/admin/mas', icon: 'dots-grid', title: 'Configuración y control',
      text: 'Cajas y tarifas, transportadoras, avisos a clientes, PQR y la bitácora de acciones sensibles.' },
  ],
};
