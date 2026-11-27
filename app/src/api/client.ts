/** Cliente de la API de DIMENSIONA (servicios en Render). */
import { Platform } from 'react-native';
import { getItem, setItem } from '../lib/storage';
import type { AdminMessages, AppNotification, BillingSummary, Box, CarrierInfo, Claim, NotificationChannels, NotificationPrefs, Invoice, Me, Product, Quote, QuotePlan, Service, Settlement, Shipment, Stats, StoreProfile, TrackInfo, User, VisionObject, PackingResult } from './types';

// En la web la app se sirve desde el mismo servidor: rutas relativas.
const DEFAULT_URL = process.env.EXPO_PUBLIC_API_URL ?? (Platform.OS === 'web' ? '' : 'https://dimensiona-logistica.onrender.com');

let baseUrl = DEFAULT_URL;
let token: string | null = null;
let onUnauthorized: (() => void) | null = null;

export const SERVER_KEY = 'dm.server';
export const TOKEN_KEY = 'dm.token';

export async function loadClientState() {
  const [s, t] = await Promise.all([getItem(SERVER_KEY), getItem(TOKEN_KEY)]);
  if (s) baseUrl = s;
  token = t;
  return { token };
}

export const getBaseUrl = () => baseUrl;
export const getDefaultUrl = () => DEFAULT_URL;
export async function setBaseUrl(url: string | null) {
  baseUrl = (url ?? '').trim().replace(/\/+$/, '') || DEFAULT_URL;
  await setItem(SERVER_KEY, url ? baseUrl : null);
}
export async function setToken(t: string | null) { token = t; await setItem(TOKEN_KEY, t); }
export const setUnauthorizedHandler = (fn: (() => void) | null) => { onUnauthorized = fn; };

/** URL pública de rastreo para compartir con el cliente final. */
export function trackingUrl(code: string) {
  const origin = baseUrl || (Platform.OS === 'web' ? globalThis.location?.origin ?? '' : DEFAULT_URL);
  return `${origin}/rastreo/${code}`;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Sin conexión con el servidor. Revisa tu internet e inténtalo de nuevo en un momento.');
  }
  if (res.status === 204) return undefined as T;
  let data: any = null;
  try { data = await res.json(); } catch { /* respuesta vacía */ }
  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized?.();
    throw new ApiError(res.status, data?.error ?? `Error ${res.status}`);
  }
  return data as T;
}

const get = <T>(p: string) => request<T>('GET', p);
const post = <T>(p: string, b?: unknown) => request<T>('POST', p, b ?? {});
const put = <T>(p: string, b: unknown) => request<T>('PUT', p, b);
const patch = <T>(p: string, b: unknown) => request<T>('PATCH', p, b);
const del = <T>(p: string, b?: unknown) => request<T>('DELETE', p, b);

export interface ItemInput { productId?: string; qty: number; name?: string; length?: number; width?: number; height?: number; weight?: number; fragile?: boolean }

export const api = {
  config: () => get<{ apkUrl: string | null; videoUrl?: string | null; version: string; vision: boolean; mail: boolean; carriers: CarrierInfo[]; notifications?: NotificationChannels }>('/config'),
  login: (email: string, password: string) => post<{ token: string; user: User }>('/auth/login', { email, password }),
  register: (b: Record<string, unknown>) => post<{ token?: string; user: User; pending?: boolean }>('/auth/register', b),
  me: () => get<Me>('/auth/me'),
  updateMe: (b: Record<string, unknown>) => patch<{ user: User }>('/auth/me', b),
  deleteMe: () => del<void>('/auth/me'),

  store: () => get<StoreProfile>('/store'),
  updateStore: (b: Partial<StoreProfile>) => put<StoreProfile>('/store', b),
  products: () => get<Product[]>('/products'),
  createProduct: (b: Partial<Product>) => post<Product>('/products', b),
  updateProduct: (id: string, b: Partial<Product>) => put<Product>(`/products/${id}`, b),
  deleteProduct: (id: string) => del<void>(`/products/${id}`),
  boxes: () => get<Box[]>('/boxes'),

  recommend: (items: ItemInput[]) => post<PackingResult>('/packing/recommend', { items }),
  quote: (b: { items: ItemInput[]; destCity: string; declaredValue?: number; codAmount?: number; packing?: 'catalogo' | 'medida' }) => post<QuotePlan>('/quotes', b),

  shipments: (q?: { status?: string; q?: string }) => {
    const qs = new URLSearchParams(Object.entries(q ?? {}).filter(([, v]) => v) as [string, string][]).toString();
    return get<Shipment[]>(`/shipments${qs ? `?${qs}` : ''}`);
  },
  shipment: (id: string) => get<Shipment>(`/shipments/${id}`),
  createShipment: (b: Record<string, unknown>) => post<Shipment>('/shipments', b),
  cancelShipment: (id: string, note?: string) => post<{ ok: true }>(`/shipments/${id}/cancel`, { note }),
  available: () => get<Shipment[]>('/courier/available'),
  accept: (id: string) => post<{ ok: true }>(`/shipments/${id}/accept`),
  setStatus: (id: string, b: { status: string; note?: string; receiverName?: string; photo?: string }) => post<{ ok: true }>(`/shipments/${id}/status`, b),
  verify: (id: string, b: { length: number; width: number; height: number; weight?: number }) =>
    post<{ matches: boolean; chargeableKg: number; declaredChargeableKg: number | null }>(`/shipments/${id}/verify`, b),
  assign: (id: string, courierId: string) => post<{ ok: true }>(`/shipments/${id}/assign`, { courierId }),
  track: (code: string) => get<TrackInfo>(`/track/${encodeURIComponent(code)}`),
  stats: () => get<Stats>('/stats'),

  identify: (image: string, mediaType = 'image/jpeg') => post<{ objetos: VisionObject[] }>('/vision/identify', { image, mediaType, consent: true }),
  legal: (doc: string) => get<{ doc: string; title: string; version: string; markdown: string }>(`/legal/${doc}`),
  exportUrl: () => `${baseUrl}/api/auth/me/export`,
  exportMe: () => get<Record<string, unknown>>('/auth/me/export'),

  adminUsers: () => get<(User & { store_name: string | null; envios: number; created_at: string })[]>('/admin/users'),
  adminSetActive: (id: string, active: boolean) => patch<{ id: string; active: boolean }>(`/admin/users/${id}`, { active }),
  adminCouriers: () => get<{ id: string; name: string; city: string; vehicle: string }[]>('/admin/couriers'),
  adminBoxes: () => get<Box[]>('/admin/boxes'),
  adminCreateBox: (b: Partial<Box>) => post<{ id: string }>('/admin/boxes', b),
  adminUpdateBox: (id: string, b: Partial<Box>) => put<{ id: string }>(`/admin/boxes/${id}`, b),
  adminServices: () => get<Service[]>('/admin/services'),
  adminUpdateService: (id: string, b: Service) => put<{ id: string }>(`/admin/services/${id}`, b),
  // v1.1
  carriers: () => get<CarrierInfo[]>('/carriers'),
  schedulePickup: (id: string, b: { date: string; window: 'manana' | 'tarde' }) => post<{ id: string; date: string; window: string; mode: string }>(`/shipments/${id}/pickup`, b),
  printLink: (doc: 'label' | 'invoice', id: string) => post<{ url: string }>('/print-links', { doc, id }),
  billing: () => get<BillingSummary>('/billing'),
  payouts: () => get<{ settlements: Settlement[]; pending: { total: number; envios: number }; codHeld: number }>('/payouts'),
  adminRunBilling: (period: string) => post<{ period: string; invoices: Invoice[] }>('/admin/billing/run', { period }),
  adminInvoices: (status?: string) => get<Invoice[]>(`/admin/invoices${status ? `?status=${status}` : ''}`),
  adminPayInvoice: (id: string, ref: string) => post<{ ok: true }>(`/admin/invoices/${id}/pay`, { ref }),
  adminVoidInvoice: (id: string) => post<{ ok: true }>(`/admin/invoices/${id}/void`),
  adminRunSettlements: () => post<Settlement[]>('/admin/settlements/run'),
  adminSettlements: () => get<Settlement[]>('/admin/settlements'),
  adminPaySettlement: (id: string, ref: string) => post<{ ok: true }>(`/admin/settlements/${id}/pay`, { ref }),
  adminTempPassword: (id: string) => post<{ email: string; tempPassword: string }>(`/admin/users/${id}/temp-password`),
  adminAudit: () => get<{ id: number; action: string; target: string | null; detail: unknown; created_at: string; email: string | null }[]>('/admin/audit'),
  claims: () => get<Claim[]>('/claims'),
  createClaim: (b: { type: string; message: string; name?: string; contact?: string; code?: string }) => post<{ number: string; due_at: string }>('/claims', b),
  claimStatus: (n: string) => get<Claim>(`/claims/${encodeURIComponent(n)}/status`),
  adminRespondClaim: (id: string, response: string, close = true) => post<{ ok: true }>(`/admin/claims/${id}/respond`, { response, close }),
  acceptTerms: (version: string) => post<{ ok: true }>('/auth/accept-terms', { version }),
  forgot: (email: string) => post<{ ok: true; mail: boolean; message: string }>('/auth/forgot', { email }),
  reset: (token: string, password: string) => post<{ ok: true }>('/auth/reset', { token, password }),
  // v1.2: avisos
  notifications: () => get<{ items: AppNotification[]; unread: number }>('/notifications'),
  unread: () => get<{ unread: number }>('/notifications/unread'),
  markRead: (ids?: string[]) => post<{ ok: true }>('/notifications/read', ids ? { ids } : {}),
  notificationPrefs: () => get<NotificationPrefs>('/notifications/prefs'),
  setNotificationPrefs: (b: { push?: boolean; customers?: boolean }) => put<{ ok: true }>('/notifications/prefs', b),
  registerPushToken: (token: string, platform: string) => post<{ ok: true }>('/notifications/push-token', { token, platform }),
  removePushToken: (token: string) => del<{ ok: true }>('/notifications/push-token', { token }),
  optOut: (code: string) => post<{ ok: true }>(`/track/${encodeURIComponent(code)}/opt-out`),
  adminMessages: () => get<AdminMessages>('/admin/messages'),
};

export type { Quote };
