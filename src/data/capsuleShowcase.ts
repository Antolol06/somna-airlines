import type { LightMode } from '../state/store';

export const SHOWCASE_ENTRY = 0.18;

export const LIGHT_MODES: Record<LightMode, { strip: string; fill: string; level: number; label: string }> = {
  relax: { strip: '#ffcf96', fill: '#ffbe7a', level: 1, label: 'Warm champagne' },
  dream: { strip: '#5d74ff', fill: '#2d3f9a', level: 0.45, label: 'Deep midnight' },
  wake: { strip: '#ffb070', fill: '#ff9868', level: 1.25, label: 'Soft sunrise' },
};

export type PartId = 'enclosure' | 'acoustic' | 'lighting' | 'mattress' | 'climate' | 'entertainment' | 'storage' | 'air';

export const PARTS: { id: PartId; label: string; title: string; note: string; dir: [number, number, number] }[] = [
  { id: 'enclosure', label: 'Privacy', title: 'Privacy enclosure', note: 'A quiet roll-down shade closes the satin shell for a room of your own.', dir: [0, 1.3, 0] },
  { id: 'mattress', label: 'Bed', title: 'Full-length bed', note: 'A layered mattress, soft linens and a down pillow let you sleep fully flat.', dir: [0, -0.42, 0.12] },
  { id: 'lighting', label: 'Lighting', title: 'Adaptive lighting', note: 'Recessed lighting shifts from warm champagne to midnight blue and soft sunrise.', dir: [0, 0.42, 0.42] },
  { id: 'acoustic', label: 'Acoustics', title: 'Acoustic insulation', note: 'The ribbed acoustic liner softens cabin noise.', dir: [0, 0.78, 0] },
  { id: 'entertainment', label: 'Display', title: 'Ceiling display', note: 'The curved ceiling display is angled for watching while lying down.', dir: [-0.95, 0.28, 0.1] },
  { id: 'storage', label: 'Storage', title: 'Personal storage', note: 'A soft-close cubby keeps essentials within arm’s reach.', dir: [-0.85, -0.12, -0.25] },
  { id: 'air', label: 'Airflow', title: 'Air circulation', note: 'Filtered air circulates gently through a recessed duct.', dir: [0.95, 0.25, 0] },
  { id: 'climate', label: 'Climate', title: 'Personal climate', note: 'Set the capsule between 18 and 24 °C from the bedside controls.', dir: [0, 0.12, -0.95] },
];
