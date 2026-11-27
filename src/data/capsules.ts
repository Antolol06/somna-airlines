/**
 * Conceptual capsule categories and an illustrative cabin layout.
 * These are design concepts — not certified aviation configurations.
 */
import { rng } from '../lib/math';

export type TierId = 'essential' | 'signature' | 'grand';

export interface Tier {
  id: TierId;
  name: string;
  short: string;
  subtitle: string;
  dims: { w: number; h: number; l: number };
  rateKm: number;
  minFare: number;
  features: string[];
  palette: {
    shell: string;
    liner: string;
    accent: string;
    wood: string;
    bed: string;
    blanket: string;
  };
}

export const TIERS: Record<TierId, Tier> = {
  essential: {
    id: 'essential',
    name: 'SŌMNA Essential',
    short: 'Essential',
    subtitle: 'Private sleeping capsule',
    dims: { w: 1.05, h: 1.05, l: 2.05 },
    rateKm: 0.11,
    minFare: 190,
    features: ['Full-length 2.0 m bed', 'Acoustic privacy enclosure', 'Adaptive ambient lighting', 'Personal climate control', 'Integrated entertainment', 'Under-bed storage'],
    palette: { shell: '#ECE5D8', liner: '#D6CAB5', accent: '#C8AD85', wood: '#8A6B4E', bed: '#F4EFE7', blanket: '#CDBEA6' },
  },
  signature: {
    id: 'signature',
    name: 'SŌMNA Signature',
    short: 'Signature',
    subtitle: 'Enhanced personal space and comfort',
    dims: { w: 1.32, h: 1.25, l: 2.15 },
    rateKm: 0.19,
    minFare: 340,
    features: ['Wider 1.2 m bed', 'Walnut and leather details', 'Sunrise wake-up programme', 'Personal wardrobe', 'Enhanced acoustic liner', 'Climate & air purification'],
    palette: { shell: '#EFE8DC', liner: '#C7B595', accent: '#C8AD85', wood: '#6B4A33', bed: '#F5F0E8', blanket: '#9C8466' },
  },
  grand: {
    id: 'grand',
    name: 'SŌMNA Grand',
    short: 'Grand',
    subtitle: 'Expansive private sleeping suite',
    dims: { w: 1.9, h: 1.7, l: 2.3 },
    rateKm: 0.36,
    minFare: 690,
    features: ['Double-width bed', 'Seated lounge nook', 'Full-height doorway', 'Private vanity & storage', 'Curated dream menu', 'Personal host on request'],
    palette: { shell: '#EAE2D4', liner: '#1F2637', accent: '#D2B68C', wood: '#4A3324', bed: '#F4EFE7', blanket: '#2C3446' },
  },
};

export const TIER_ORDER: TierId[] = ['essential', 'signature', 'grand'];

export interface CapsuleSlot {
  id: string;
  row: number;
  letter: string;
  tier: TierId;
  side: -1 | 1;
  level: 0 | 1;
  /** position in aircraft cutaway space (metres) */
  x: number;
  y: number;
  z: number;
  /** extent along the aisle (z), height (y), depth across the cabin (x) */
  w: number;
  h: number;
  d: number;
  reserved: boolean;
  position: string;
  priceFactor: number;
}

const AISLE = 1.1;
const DECK_HALF = 2.65;

function buildLayout(): CapsuleSlot[] {
  const r = rng(7);
  const slots: CapsuleSlot[] = [];
  let z = -19.2;
  let row = 1;
  // Grand — forward cabin
  for (let i = 0; i < 3; i++, row++) {
    const pitch = 2.55;
    for (const side of [-1, 1] as const) {
      const d = DECK_HALF - AISLE / 2;
      slots.push({
        id: `${String(row).padStart(2, '0')}${side < 0 ? 'A' : 'K'}`,
        row, letter: side < 0 ? 'A' : 'K', tier: 'grand', side, level: 0,
        x: side * (AISLE / 2 + d / 2), y: 0, z: z + pitch / 2, w: pitch - 0.12, h: 1.95, d,
        reserved: r() < 0.3, position: `Row ${String(row).padStart(2, '0')} · ${side < 0 ? 'Left' : 'Right'} suite · Forward cabin`,
        priceFactor: 1.04,
      });
    }
    z += pitch;
  }
  z += 0.6;
  // Signature — mid cabin
  for (let i = 0; i < 6; i++, row++) {
    const pitch = 1.55;
    for (const side of [-1, 1] as const) {
      const d = DECK_HALF - AISLE / 2;
      slots.push({
        id: `${String(row).padStart(2, '0')}${side < 0 ? 'A' : 'K'}`,
        row, letter: side < 0 ? 'A' : 'K', tier: 'signature', side, level: 0,
        x: side * (AISLE / 2 + d / 2), y: 0, z: z + pitch / 2, w: pitch - 0.1, h: 1.45, d,
        reserved: r() < 0.35, position: `Row ${String(row).padStart(2, '0')} · ${side < 0 ? 'Left' : 'Right'} side · Mid cabin`,
        priceFactor: i < 2 ? 1.03 : 1,
      });
    }
    z += pitch;
  }
  z += 0.6;
  // Essential — two tiers, aft cabin
  for (let i = 0; i < 11; i++, row++) {
    const pitch = 1.24;
    for (const side of [-1, 1] as const) {
      for (const level of [0, 1] as const) {
        const d = DECK_HALF - AISLE / 2;
        const letter = side < 0 ? (level ? 'C' : 'A') : level ? 'H' : 'K';
        slots.push({
          id: `${String(row).padStart(2, '0')}${letter}`,
          row, letter, tier: 'essential', side, level,
          x: side * (AISLE / 2 + d / 2), y: level ? 1.12 : 0, z: z + pitch / 2, w: pitch - 0.08, h: 1.08, d,
          reserved: r() < 0.38,
          position: `Row ${String(row).padStart(2, '0')} · ${side < 0 ? 'Left' : 'Right'} side · ${level ? 'Upper tier, integrated steps' : 'Lower tier, aisle level'}`,
          priceFactor: level ? 0.95 : 1,
        });
      }
    }
    z += pitch;
  }
  return slots;
}

export const LAYOUT: CapsuleSlot[] = buildLayout();
export const SLOT: Record<string, CapsuleSlot> = Object.fromEntries(LAYOUT.map((s) => [s.id, s]));

export function firstAvailable(tier: TierId) {
  return LAYOUT.find((s) => s.tier === tier && !s.reserved) ?? LAYOUT.find((s) => s.tier === tier)!;
}

export const MAX_GUESTS = 4;

export function availableCapsule(id: string | null) {
  const slot = id ? SLOT[id] : undefined;
  return slot && !slot.reserved ? slot : undefined;
}

export function fareFor(km: number, tier: TierId, slotId?: string | null) {
  const t = TIERS[tier];
  const slot = slotId ? SLOT[slotId] : undefined;
  const base = Math.max(t.minFare, km * t.rateKm + 120);
  const f = base * (slot?.priceFactor ?? 1);
  return Math.round(f / 10) * 10;
}

export const formatEUR = (n: number) =>
  new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);

export function quoteCapsules(ids: (string | null)[], km: number) {
  const assignments = ids.map((id, guest) => {
    const slot = availableCapsule(id);
    return { guest, slot, fare: slot ? fareFor(km, slot.tier, slot.id) : null };
  });
  const assigned = assignments.filter(({ slot }) => !!slot).length;
  return { assignments, assigned, complete: assigned === ids.length, total: assignments.reduce((sum, row) => sum + (row.fare ?? 0), 0) };
}
