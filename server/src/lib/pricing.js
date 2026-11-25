/**
 * Tarifas y peso cobrable (lógica pura). Moneda: COP. Medidas: cm, kg.
 */
import { zoneFor } from './geo.js';

export const DEFAULT_DIVISOR = 5000; // cm³/kg, factor volumétrico usado por la mayoría de transportadoras

/** Peso volumétrico en kg. */
export function volumetricKg([l, w, h], divisor = DEFAULT_DIVISOR) {
  return (l * w * h) / divisor;
}

/** Peso cobrable: el mayor entre real y volumétrico, redondeado hacia arriba al kilo (mínimo 1). */
export function chargeableKg(realKg, dims, divisor = DEFAULT_DIVISOR) {
  return Math.max(1, Math.ceil(Math.max(Number(realKg) || 0, volumetricKg(dims, divisor)) - 1e-9));
}

const roundCop = (n) => Math.round(n / 50) * 50;

/**
 * Precio de un servicio para un conjunto de paquetes.
 * @param service { id, name, divisor, insurancePct, minInsurance, codPct, rates: { local|regional|nacional: { base, perKg, etaDays } } }
 * @param packages [{ dims:[l,w,h], weightKg }]
 */
export function priceService(service, packages, { zone, declaredValue = 0, codAmount = 0 }) {
  const rate = service.rates?.[zone];
  if (!rate) return null;
  const divisor = service.divisor || DEFAULT_DIVISOR;
  let freight = 0;
  let totalCharge = 0;
  let totalVol = 0;
  let totalReal = 0;
  for (const p of packages) {
    const vol = volumetricKg(p.dims, divisor);
    const ch = chargeableKg(p.weightKg, p.dims, divisor);
    freight += rate.base + rate.perKg * Math.max(0, ch - 1);
    totalCharge += ch;
    totalVol += vol;
    totalReal += Number(p.weightKg) || 0;
  }
  const insurance = declaredValue > 0 ? Math.max(service.minInsurance ?? 0, declaredValue * (service.insurancePct ?? 0) / 100) : 0;
  const codFee = codAmount > 0 ? Math.max(3000, codAmount * (service.codPct ?? 0) / 100) : 0;
  const total = roundCop(freight + insurance + codFee);
  return {
    serviceId: service.id,
    serviceName: service.name,
    zone,
    etaDays: rate.etaDays,
    realKg: Math.round(totalReal * 100) / 100,
    volumetricKg: Math.round(totalVol * 100) / 100,
    chargeableKg: totalCharge,
    freight: roundCop(freight),
    insurance: roundCop(insurance),
    codFee: roundCop(codFee),
    total,
  };
}

/** Cotiza con todos los servicios activos; ordenado por precio. Marca el más barato y el más rápido. */
export function quoteAll(services, packages, { originCity, destCity, declaredValue, codAmount }) {
  const zone = zoneFor(originCity, destCity);
  const quotes = services
    .filter((s) => s.active !== false)
    .map((s) => priceService(s, packages, { zone, declaredValue, codAmount }))
    .filter(Boolean)
    .sort((a, b) => a.total - b.total);
  if (quotes.length) {
    quotes[0].cheapest = true;
    const fastest = [...quotes].sort((a, b) => a.etaDays - b.etaDays || a.total - b.total)[0];
    fastest.fastest = true;
  }
  return { zone, quotes };
}
