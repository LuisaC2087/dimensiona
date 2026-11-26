export type Role = 'tienda' | 'mensajero' | 'admin';

export interface User { id: string; email: string; name: string; role: Role; phone: string | null; city: string | null; vehicle: string | null; active: boolean }
export interface StoreProfile { id: string; name: string; city: string; address: string | null; channel: string | null; instagram: string | null; whatsapp: string | null; default_box_id: string | null }
export interface Me { user: User; store: StoreProfile | null; terms?: { accepted: string | null; current: string } }

export type MeasuredBy = 'ar' | 'foto' | 'manual' | 'ia';
export interface Product {
  id: string; name: string; sku: string | null; category: string | null;
  length_cm: number; width_cm: number; height_cm: number; weight_kg: number; price: number; fragile: boolean;
  measured_by: MeasuredBy; confidence: number | null; updated_at?: string;
}

export interface Box { id: string; name: string; length: number; width: number; height: number; maxWeight: number; cost: number; active: boolean }
export interface Rate { base: number; perKg: number; etaDays: number }
export type Zone = 'local' | 'regional' | 'nacional';
export interface Service {
  id: string; name: string; description: string | null; divisor: number; insurancePct: number; minInsurance: number; codPct: number;
  courierSharePct: number; rates: Partial<Record<Zone, Rate>>; active: boolean; carrier?: CarrierId;
}

export interface Placement { name: string; x: number; y: number; z: number; l: number; w: number; h: number }
export interface PackageInfo {
  box: { id: string | null; name: string; length: number; width: number; height: number; cost: number; custom: boolean };
  units: number; fillPct: number; voidCm3: number; contentWeightKg: number; placements: Placement[];
}
export interface PackingResult { packages: PackageInfo[]; custom: PackageInfo | null; totalUnits: number }

export interface Quote {
  serviceId: string; serviceName: string; zone: Zone; etaDays: number; realKg: number; volumetricKg: number; chargeableKg: number;
  freight: number; insurance: number; codFee: number; total: number; cheapest?: boolean; fastest?: boolean; baselineTotal?: number; carrier?: CarrierId;
}
export interface QuotePlan {
  items: { productId?: string; name: string; qty: number; length: number; width: number; height: number; weight: number; fragile: boolean }[];
  packing: 'catalogo' | 'medida'; packages: PackageInfo[]; custom: PackageInfo | null; zone: Zone; quotes: Quote[];
  baseline: { boxes: string[]; total: number; serviceId: string } | null; boxCost: number; declaredValue: number;
}

export type ShipmentStatus = 'creado' | 'asignado' | 'recogido' | 'en_ruta' | 'entregado' | 'novedad' | 'devuelto' | 'cancelado';
export interface ShipmentEvent { id: string; status: ShipmentStatus; status_label: string; note: string | null; photo: string | null; receiver_name: string | null; created_at: string; by_name: string | null }
export interface Shipment {
  id: string; code: string; status: ShipmentStatus; status_label: string; store_id: string; store_name?: string; store_address?: string; store_city?: string; store_whatsapp?: string;
  courier_id: string | null; courier_name?: string | null; courier_phone?: string | null;
  recipient_name: string; recipient_phone: string; address: string; city: string; zone: Zone; notes: string | null;
  items: QuotePlan['items']; packages: PackageInfo[]; quote: Quote; baseline_total: number | null;
  declared_value: number; cod_amount: number; price: number; courier_fee: number;
  verified: { dims: number[]; chargeableKg: number; declaredChargeableKg: number | null; matches: boolean; at: string; by: string } | null;
  carrier: CarrierId; carrier_guide: string | null; pickup: { id: string; date: string; window: string; mode: string } | null; carrier_info?: CarrierInfo; invoice_id?: string | null;
  created_at: string; updated_at: string; events?: ShipmentEvent[];
  recipient_email?: string | null; messages?: CustomerMessage[];
}

export interface TrackInfo {
  code: string; status: ShipmentStatus; status_label: string; city: string; store: string; recipient: string; courier: string | null;
  service?: string; etaDays?: number; created_at: string; updated_at: string; carrier: { name: string; guide: string } | null; notifications?: boolean;
  events: { status: ShipmentStatus; status_label: string; note: string | null; receiver: string | null; at: string }[];
}

export type Stats = Record<string, number | null | { status?: string; zone?: string; n: number }[]>;

export interface VisionObject {
  nombre: string; categoria: string; fragil: boolean; confianza: 'alta' | 'media' | 'baja';
  caja: { x: number; y: number; ancho: number; alto: number };
  estimado: { largo: number | null; ancho: number | null; alto: number | null };
}

// ── v1.1 ──
export type CarrierId = 'propia' | 'servientrega' | 'coordinadora';
export interface CarrierInfo { id: CarrierId; name: string; mode: 'propia' | 'simulado' | 'real'; pickup: boolean }
export interface Invoice {
  id: string; number: string; store_id?: string; store_name?: string; period: string; subtotal: number; iva: number; total: number;
  status: 'pendiente' | 'pagada' | 'anulada'; issued_at: string; due_at: string; paid_at: string | null; payment_ref?: string | null;
  items?: { shipmentId: string; code: string; date: string; city: string; service: string; total: number }[];
}
export interface Settlement {
  id: string; kind: 'tienda' | 'mensajero'; amount: number; shipments: number; status: 'pendiente' | 'pagada';
  created_at: string; paid_at: string | null; payment_ref?: string | null; store_name?: string | null; courier_name?: string | null;
}
export interface BillingSummary {
  ivaPct: number; invoices: Invoice[]; owed: number; settlements: Settlement[]; codPending: number;
  unbilled: { envios: number; total: number; subtotal: number; iva: number };
}
export interface Claim {
  id?: string; number: string; type: 'peticion' | 'queja' | 'reclamo' | 'sugerencia'; status: 'abierta' | 'en_tramite' | 'cerrada';
  message?: string; name?: string; contact?: string; response: string | null; created_at: string; due_at: string; responded_at: string | null; shipment_code?: string | null;
}

// v1.2: avisos
export interface AppNotification { id: string; kind: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string }
export interface CustomerMessage { id: string; channel: 'whatsapp' | 'email'; to_addr: string; status_trigger: ShipmentStatus; body: string; state: 'pendiente' | 'enviado' | 'simulado' | 'fallido'; error: string | null; created_at: string }
export interface NotificationChannels { whatsapp: 'real' | 'simulado'; email: boolean; push: boolean; template: string }
export interface NotificationPrefs { push: boolean; customers: boolean | null; channels: NotificationChannels }
export interface AdminMessages {
  channels: NotificationChannels;
  totals: { total: number; enviados: number; simulados: number; fallidos: number; dispositivos: number };
  items: (Omit<CustomerMessage, 'body'> & { code: string; shipment_id: string })[];
}
