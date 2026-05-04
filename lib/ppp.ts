// Purchasing Power Parity (PPP) multipliers
// Factors are approximate and meant to make prices accessible.
// 1.0 = No discount (Tier 1: US, UK, CA, etc.)
// 0.6 = 40% discount (Tier 2: Brazil, Mexico, etc.)
// 0.4 = 60% discount (Tier 3: India, Pakistan, etc.)

export const PPP_FACTORS: Record<string, number> = {
  // Tier 1 (1.0x)
  US: 1.0, GB: 1.0, CA: 1.0, AU: 1.0, DE: 1.0, FR: 1.0, JP: 1.0, SG: 1.0, AE: 1.0, HK: 1.0,

  // Tier 2 (0.6x)
  BR: 0.6, MX: 0.6, PL: 0.6, TR: 0.6, RU: 0.6, ZA: 0.6, CN: 0.6, TH: 0.6, MY: 0.6,

  // Tier 3 (0.4x)
  IN: 0.4, PK: 0.4, BD: 0.4, ID: 0.4, VN: 0.4, PH: 0.4, NG: 0.4, KE: 0.4, EG: 0.4,
};

export function getPPPFactor(countryCode: string): number {
  const code = countryCode.toUpperCase();
  return PPP_FACTORS[code] || 1.0;
}

export function applyPPP(priceCents: number, countryCode: string): number {
  const factor = getPPPFactor(countryCode);
  return Math.round(priceCents * factor);
}
